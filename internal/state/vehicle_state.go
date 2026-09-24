package state

import (
	"context"
	"math"
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
	State        string    `json:"state"` // "driving", "parked", "charging", "asleep", etc.
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	Heading      float64   `json:"heading"`
	Speed        float64   `json:"speed"` // km/h
	BatteryLevel float64   `json:"battery_level"`
	UpdatedAt    time.Time `json:"updated_at"`

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
	Coordinates    [][]float64 `json:"route_coordinates,omitempty"`
	UpdatedAt      string      `json:"updated_at"`
}

type StateManager struct {
	mu            sync.RWMutex
	state         VehicleState
	router        routing.Router
	db            *database.DB
	subscribers   map[chan struct{}]struct{}
	subscribersMu sync.Mutex
}

func NewStateManager(r routing.Router, db *database.DB) *StateManager {
	return &StateManager{
		router:      r,
		db:          db,
		subscribers: make(map[chan struct{}]struct{}),
		state: VehicleState{
			State:     "parked",
			UpdatedAt: time.Now(),
		},
	}
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
	sm.mu.Unlock()

	// If route is active, calculate or update routing polyline in background if needed
	if routeActive && sm.router != nil {
		go sm.ensureRoutePolyline(lat, lon, destLat, destLon, distKm, mins)
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

func (sm *StateManager) UpdateState(vehicleState string) {
	sm.mu.Lock()
	prev := sm.state.State
	sm.state.State = vehicleState
	sm.state.UpdatedAt = time.Now()

	// If car transitioned to "parked" from "driving", check if we should auto-expire links
	autoExpire := prev == "driving" && vehicleState == "parked"
	sm.mu.Unlock()

	if autoExpire && sm.db != nil {
		_ = sm.db.ExpireOnArrivalLinks()
	}

	sm.notifySubscribers()
}

func (sm *StateManager) UpdateActiveRoute(destination string, lat, lon, minutes, distance, energy float64) {
	sm.mu.Lock()
	if destination == "" && lat == 0 && lon == 0 {
		sm.state.HasActiveRoute = false
		sm.state.Route = nil
		sm.mu.Unlock()
		sm.notifySubscribers()
		return
	}

	isNewRoute := !sm.state.HasActiveRoute || sm.state.Route == nil || sm.state.Route.Destination != destination
	initialDist := distance
	var existingCoords [][]float64

	if !isNewRoute && sm.state.Route != nil {
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
	sm.mu.RUnlock()

	// Check safe zones
	var safeZones []database.SafeZone
	if sm.db != nil {
		safeZones, _ = sm.db.ListSafeZones()
	}

	geoResult := geofence.CheckSafeZones(st.Latitude, st.Longitude, safeZones)

	now := time.Now()
	res := PublicTelemetry{
		State:          st.State,
		Heading:        st.Heading,
		InSafeZone:     geoResult.IsInsideSafeZone,
		SafeZoneName:   geoResult.ZoneName,
		HasActiveRoute: st.HasActiveRoute,
		UpdatedAt:      st.UpdatedAt.Format(time.RFC3339),
	}

	// Geofence obfuscation: if inside a safe zone, omit precise lat/lon
	if !geoResult.IsInsideSafeZone {
		lat := st.Latitude
		lon := st.Longitude
		res.Latitude = &lat
		res.Longitude = &lon
	}

	if link.ShowSpeed && !geoResult.IsInsideSafeZone {
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
