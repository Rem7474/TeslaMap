package state

import (
	"context"
	"log"
	"math"
	"strings"
	"sync"
	"time"

	"teslamap/internal/database"
	"teslamap/internal/geofence"
	"teslamap/internal/routing"
)

type ActiveRoute struct {
	Destination       string      `json:"destination"`
	Latitude          float64     `json:"latitude"`
	Longitude         float64     `json:"longitude"`
	MinutesToArrival  float64     `json:"minutes_to_arrival"`
	DistanceToArrival float64     `json:"distance_to_arrival_km"`
	EnergyAtArrival   float64     `json:"energy_at_arrival"`
	InitialDistance   float64     `json:"initial_distance_km"`
	Coordinates       [][]float64 `json:"coordinates"` // [lat, lon]
	UpdatedAt         time.Time   `json:"updated_at"`
}

type VehicleState struct {
	State             string    `json:"state"` // "driving", "parked", "charging", "asleep", etc.
	Latitude          float64   `json:"latitude"`
	Longitude         float64   `json:"longitude"`
	Heading           float64   `json:"heading"`
	Speed             float64   `json:"speed"` // km/h
	BatteryLevel      float64   `json:"battery_level"`
	TeslaMateGeofence string    `json:"teslamate_geofence,omitempty"`
	UpdatedAt         time.Time `json:"updated_at"`

	HasActiveRoute bool         `json:"has_active_route"`
	Route          *ActiveRoute `json:"route,omitempty"`
}

// PublicTelemetry is the sanitized data sent over SSE to public links
type PublicTelemetry struct {
	State          string      `json:"state"`
	Latitude       *float64    `json:"latitude,omitempty"`
	Longitude      *float64    `json:"longitude,omitempty"`
	Heading        float64     `json:"heading"`
	Speed          *float64    `json:"speed,omitempty"`
	BatteryLevel   *float64    `json:"battery_level,omitempty"`
	InSafeZone     bool        `json:"in_safe_zone"`
	SafeZoneName   string      `json:"safe_zone_name,omitempty"`
	HasActiveRoute bool        `json:"has_active_route"`
	Destination    string      `json:"destination,omitempty"`
	ETA            string      `json:"eta,omitempty"`
	MinutesLeft    int         `json:"minutes_left,omitempty"`
	DistanceLeftKm float64     `json:"distance_left_km,omitempty"`
	ProgressPct    float64     `json:"progress_pct"`
	Coordinates         [][]float64 `json:"route_coordinates,omitempty"`
	TraveledCoordinates [][]float64 `json:"traveled_coordinates,omitempty"`
	UpdatedAt           string      `json:"updated_at"`
}

type TraveledPoint struct {
	Latitude  float64
	Longitude float64
	Timestamp time.Time
}

type lastDestinationInfo struct {
	Destination string
	Latitude    float64
	Longitude   float64
	ClearedAt   time.Time
}

type StateManager struct {
	mu                sync.RWMutex
	state             VehicleState
	router            routing.Router
	db                *database.DB
	subscribers       map[chan struct{}]struct{}
	subscribersMu     sync.Mutex
	lastDestination   *lastDestinationInfo
	parkGraceTimer    *time.Timer
	parkGraceTimerMu  sync.Mutex
	parkGraceDuration time.Duration
	traveledPoints    []TraveledPoint
}

func NewStateManager(r routing.Router, db *database.DB) *StateManager {
	return &StateManager{
		router:            r,
		db:                db,
		subscribers:       make(map[chan struct{}]struct{}),
		parkGraceDuration: 5 * time.Minute,
		state: VehicleState{
			State:     "parked",
			UpdatedAt: time.Now(),
		},
	}
}

// SetParkGraceDuration configures the grace period before expiring links in free navigation mode
func (sm *StateManager) SetParkGraceDuration(d time.Duration) {
	sm.parkGraceTimerMu.Lock()
	defer sm.parkGraceTimerMu.Unlock()
	sm.parkGraceDuration = d
}

func (sm *StateManager) cancelParkGraceTimer() {
	sm.parkGraceTimerMu.Lock()
	defer sm.parkGraceTimerMu.Unlock()
	if sm.parkGraceTimer != nil {
		sm.parkGraceTimer.Stop()
		sm.parkGraceTimer = nil
		log.Println("[StateManager] Vehicle resumed driving: cancelled auto-expire grace timer.")
	}
}

func (sm *StateManager) startParkGraceTimer() {
	sm.parkGraceTimerMu.Lock()
	defer sm.parkGraceTimerMu.Unlock()

	if sm.parkGraceTimer != nil {
		return
	}

	duration := sm.parkGraceDuration
	if duration <= 0 {
		duration = 5 * time.Minute
	}

	sm.parkGraceTimer = time.AfterFunc(duration, func() {
		sm.parkGraceTimerMu.Lock()
		sm.parkGraceTimer = nil
		sm.parkGraceTimerMu.Unlock()

		sm.mu.RLock()
		currentState := sm.state.State
		sm.mu.RUnlock()

		if currentState != "driving" {
			log.Printf("[StateManager] Auto-expire: vehicle remained %s for %v without active GPS route. Expiring links.\n", currentState, duration)
			sm.expireLinksNow()
		}
	})
}

func (sm *StateManager) expireLinksNow() {
	sm.cancelParkGraceTimer()
	if sm.db != nil {
		if err := sm.db.ExpireOnArrivalLinks(); err != nil {
			log.Printf("[StateManager] Error expiring arrival links: %v\n", err)
		}
	}
	sm.notifySubscribers()
}

func (sm *StateManager) Subscribe() chan struct{} {
	ch := make(chan struct{}, 1)
	sm.subscribersMu.Lock()
	sm.subscribers[ch] = struct{}{}
	sm.subscribersMu.Unlock()
	return ch
}

func (sm *StateManager) Unsubscribe(ch chan struct{}) {
	sm.subscribersMu.Lock()
	delete(sm.subscribers, ch)
	sm.subscribersMu.Unlock()
	close(ch)
}

func (sm *StateManager) notifySubscribers() {
	sm.subscribersMu.Lock()
	defer sm.subscribersMu.Unlock()
	for ch := range sm.subscribers {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func (sm *StateManager) GetRawState() VehicleState {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.state
}

func (sm *StateManager) UpdateLocation(lat, lon, heading, speed float64) {
	sm.mu.Lock()
	sm.state.Latitude = lat
	sm.state.Longitude = lon
	sm.state.Heading = heading
	sm.state.Speed = speed
	sm.state.UpdatedAt = time.Now()
	routeActive := sm.state.HasActiveRoute && sm.state.Route != nil
	var destLat, destLon, distKm, mins float64
	if routeActive {
		destLat = sm.state.Route.Latitude
		destLon = sm.state.Route.Longitude
		distKm = sm.state.Route.DistanceToArrival
		mins = sm.state.Route.MinutesToArrival
	}
	currentState := sm.state.State

	// Record traveled path coordinates if not inside safe zones
	if lat != 0 && lon != 0 {
		var safeZones []database.SafeZone
		if sm.db != nil {
			safeZones, _ = sm.db.ListSafeZones()
		}
		geoRes := geofence.CheckSafeZones(lat, lon, safeZones)
		inSafe := geoRes.IsInsideSafeZone || sm.state.TeslaMateGeofence != ""

		if !inSafe {
			n := len(sm.traveledPoints)
			if n == 0 || geofence.HaversineDistance(sm.traveledPoints[n-1].Latitude, sm.traveledPoints[n-1].Longitude, lat, lon) >= 15.0 {
				sm.traveledPoints = append(sm.traveledPoints, TraveledPoint{
					Latitude:  lat,
					Longitude: lon,
					Timestamp: time.Now(),
				})
				if len(sm.traveledPoints) > 5000 {
					sm.traveledPoints = sm.traveledPoints[len(sm.traveledPoints)-5000:]
				}
			}
		}
	}
	sm.mu.Unlock()

	// If route is active, calculate or update routing polyline in background if needed
	if routeActive && sm.router != nil {
		go sm.ensureRoutePolyline(lat, lon, destLat, destLon, distKm, mins)
	}

	// If car is already parked and route is active, check if current location reached destination
	if currentState == "parked" && routeActive {
		distMeters := geofence.HaversineDistance(lat, lon, destLat, destLon)
		if distMeters <= 400 || (distKm > 0 && distKm <= 0.4) {
			sm.expireLinksNow()
		}
	}

	sm.notifySubscribers()
}

func (sm *StateManager) UpdateBattery(batteryLevel float64) {
	sm.mu.Lock()
	sm.state.BatteryLevel = batteryLevel
	sm.state.UpdatedAt = time.Now()
	sm.mu.Unlock()
	sm.notifySubscribers()
}

func (sm *StateManager) UpdateTeslaMateGeofence(name string) {
	sm.mu.Lock()
	sm.state.TeslaMateGeofence = strings.TrimSpace(name)
	sm.state.UpdatedAt = time.Now()
	sm.mu.Unlock()
	sm.notifySubscribers()
}

func (sm *StateManager) UpdateState(vehicleState string) {
	sm.mu.Lock()
	prev := sm.state.State
	sm.state.State = vehicleState
	sm.state.UpdatedAt = time.Now()

	carLat := sm.state.Latitude
	carLon := sm.state.Longitude
	hasRoute := sm.state.HasActiveRoute && sm.state.Route != nil
	var destLat, destLon, distKm float64
	var destName string
	if hasRoute {
		destLat = sm.state.Route.Latitude
		destLon = sm.state.Route.Longitude
		distKm = sm.state.Route.DistanceToArrival
		destName = sm.state.Route.Destination
	}
	lastDest := sm.lastDestination
	sm.mu.Unlock()

	// If vehicle resumed driving, cancel any pending grace timer
	if vehicleState == "driving" {
		sm.cancelParkGraceTimer()
	}

	// Detect transition from driving to parked
	if prev == "driving" && vehicleState == "parked" {
		if hasRoute {
			// Case 1: Active GPS navigation route exists
			distMeters := geofence.HaversineDistance(carLat, carLon, destLat, destLon)
			if distMeters <= 400 || (distKm > 0 && distKm <= 0.4) {
				log.Printf("[StateManager] Auto-expire: arrived at GPS destination '%s' (dist: %.0fm, remaining: %.1fkm). Expiring links immediately.\n", destName, distMeters, distKm)
				sm.expireLinksNow()
			} else {
				log.Printf("[StateManager] Vehicle parked mid-trip (%.1fkm / %.0fm away from '%s'). Keeping links active.\n", distKm, distMeters, destName)
			}
		} else if lastDest != nil && !lastDest.ClearedAt.IsZero() && time.Since(lastDest.ClearedAt) < 5*time.Minute {
			// Case 2: Route was cleared right before parking and car is at destination
			distMeters := geofence.HaversineDistance(carLat, carLon, lastDest.Latitude, lastDest.Longitude)
			if distMeters <= 400 {
				log.Printf("[StateManager] Auto-expire: parked at recently completed destination '%s' (dist: %.0fm). Expiring links immediately.\n", lastDest.Destination, distMeters)
				sm.expireLinksNow()
			} else {
				log.Printf("[StateManager] Parked without active GPS route. Starting %v grace timer before expiring links.\n", sm.parkGraceDuration)
				sm.startParkGraceTimer()
			}
		} else {
			// Case 3: Free navigation (no active or recent GPS destination)
			log.Printf("[StateManager] Parked without active GPS route. Starting %v grace timer before expiring links.\n", sm.parkGraceDuration)
			sm.startParkGraceTimer()
		}
	}

	sm.notifySubscribers()
}

func (sm *StateManager) UpdateActiveRoute(destination string, lat, lon, minutes, distance, energy float64) {
	sm.mu.Lock()
	if destination == "" && lat == 0 && lon == 0 {
		if sm.state.HasActiveRoute && sm.state.Route != nil {
			sm.lastDestination = &lastDestinationInfo{
				Destination: sm.state.Route.Destination,
				Latitude:    sm.state.Route.Latitude,
				Longitude:   sm.state.Route.Longitude,
				ClearedAt:   time.Now(),
			}
		}
		sm.state.HasActiveRoute = false
		sm.state.Route = nil
		curState := sm.state.State
		carLat := sm.state.Latitude
		carLon := sm.state.Longitude
		lastDest := sm.lastDestination
		sm.mu.Unlock()

		// If car is already parked and route was just cleared at destination, check for auto-expire
		if curState == "parked" && lastDest != nil {
			distMeters := geofence.HaversineDistance(carLat, carLon, lastDest.Latitude, lastDest.Longitude)
			if distMeters <= 400 {
				log.Printf("[StateManager] Auto-expire: route cleared while parked at destination '%s' (dist: %.0fm). Expiring links.\n", lastDest.Destination, distMeters)
				sm.expireLinksNow()
			}
		}

		sm.notifySubscribers()
		return
	}

	sm.lastDestination = &lastDestinationInfo{
		Destination: destination,
		Latitude:    lat,
		Longitude:   lon,
	}

	isNewRoute := !sm.state.HasActiveRoute || sm.state.Route == nil || sm.state.Route.Destination != destination
	initialDist := distance
	var existingCoords [][]float64

	if isNewRoute {
		sm.traveledPoints = nil
	} else if sm.state.Route != nil {
		initialDist = sm.state.Route.InitialDistance
		existingCoords = sm.state.Route.Coordinates
	}

	if initialDist <= 0 || distance > initialDist {
		initialDist = distance
	}

	sm.state.HasActiveRoute = true
	sm.state.Route = &ActiveRoute{
		Destination:       destination,
		Latitude:          lat,
		Longitude:         lon,
		MinutesToArrival:  minutes,
		DistanceToArrival: distance,
		EnergyAtArrival:   energy,
		InitialDistance:   initialDist,
		Coordinates:       existingCoords,
		UpdatedAt:         time.Now(),
	}

	carLat := sm.state.Latitude
	carLon := sm.state.Longitude
	sm.mu.Unlock()

	if sm.router != nil && (carLat != 0 || carLon != 0) {
		go sm.ensureRoutePolyline(carLat, carLon, lat, lon, distance, minutes)
	}

	sm.notifySubscribers()
}

func (sm *StateManager) ensureRoutePolyline(startLat, startLon, destLat, destLon, targetDistanceKm, targetMinutes float64) {
	if startLat == 0 && startLon == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	res, err := sm.router.CalculateRoute(ctx, startLat, startLon, destLat, destLon, targetDistanceKm, targetMinutes)
	if err == nil && res != nil && len(res.Coordinates) > 0 {
		sm.mu.Lock()
		if sm.state.Route != nil {
			sm.state.Route.Coordinates = res.Coordinates
		}
		sm.mu.Unlock()
		sm.notifySubscribers()
	}
}

// GetPublicTelemetry formats the current state for a shared link recipient
func (sm *StateManager) GetPublicTelemetry(link *database.SharedLink) PublicTelemetry {
	sm.mu.RLock()
	st := sm.state
	traveledPts := make([]TraveledPoint, len(sm.traveledPoints))
	copy(traveledPts, sm.traveledPoints)
	sm.mu.RUnlock()

	// Check safe zones
	var safeZones []database.SafeZone
	if sm.db != nil {
		safeZones, _ = sm.db.ListSafeZones()
	}

	geoResult := geofence.CheckSafeZones(st.Latitude, st.Longitude, safeZones)

	inTeslaMateGeofence := st.TeslaMateGeofence != ""
	inSafeZone := geoResult.IsInsideSafeZone || inTeslaMateGeofence
	zoneName := geoResult.ZoneName
	if zoneName == "" && inTeslaMateGeofence {
		zoneName = st.TeslaMateGeofence
	}

	now := time.Now()
	res := PublicTelemetry{
		State:          st.State,
		Heading:        st.Heading,
		InSafeZone:     inSafeZone,
		SafeZoneName:   zoneName,
		HasActiveRoute: st.HasActiveRoute,
		UpdatedAt:      st.UpdatedAt.Format(time.RFC3339),
	}

	// Geofence obfuscation: if inside a safe zone or TeslaMate geofence, omit precise lat/lon
	if !inSafeZone {
		lat := st.Latitude
		lon := st.Longitude
		res.Latitude = &lat
		res.Longitude = &lon

		// Filter traveled points for this link (respecting StartsAt validity)
		var traveledCoords [][]float64
		for _, pt := range traveledPts {
			if link.StartsAt != nil && pt.Timestamp.Before(*link.StartsAt) {
				continue
			}
			traveledCoords = append(traveledCoords, []float64{pt.Latitude, pt.Longitude})
		}
		if len(traveledCoords) > 0 {
			res.TraveledCoordinates = traveledCoords
		}
	}

	if link.ShowSpeed && !inSafeZone {
		spd := st.Speed
		res.Speed = &spd
	}

	if link.ShowBattery {
		bat := st.BatteryLevel
		res.BatteryLevel = &bat
	}

	if st.HasActiveRoute && st.Route != nil {
		res.Destination = st.Route.Destination
		res.MinutesLeft = int(math.Round(st.Route.MinutesToArrival))
		res.DistanceLeftKm = math.Round(st.Route.DistanceToArrival*10) / 10

		etaTime := now.Add(time.Duration(st.Route.MinutesToArrival) * time.Minute)
		res.ETA = etaTime.Format("15:04")

		// Calculate progress percent
		if st.Route.InitialDistance > 0 {
			pct := ((st.Route.InitialDistance - st.Route.DistanceToArrival) / st.Route.InitialDistance) * 100
			if pct < 0 {
				pct = 0
			}
			if pct > 100 {
				pct = 100
			}
			res.ProgressPct = math.Round(pct)
		}

		if len(st.Route.Coordinates) > 0 {
			res.Coordinates = st.Route.Coordinates
		}
	}

	return res
}
