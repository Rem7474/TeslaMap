package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sync"
	"time"
)

type RouteResult struct {
	Coordinates     [][]float64 `json:"coordinates"` // Array of [lat, lon] for Leaflet
	DistanceMeters  float64     `json:"distance_meters"`
	DurationSeconds float64     `json:"duration_seconds"`
	CalculatedAt    time.Time   `json:"calculated_at"`
}

type Router interface {
	CalculateRoute(ctx context.Context, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes float64) (*RouteResult, error)
}

type RoutingService struct {
	provider   string // "openrouteservice", "mapbox", "osrm"
	apiKey     string
	httpClient *http.Client

	mu         sync.Mutex
	cachedKey  string
	cachedRes  *RouteResult
	lastCallAt time.Time
}

func NewRoutingService(provider, apiKey string) *RoutingService {
	return &RoutingService{
		provider: provider,
		apiKey:   apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *RoutingService) CalculateRoute(ctx context.Context, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes float64) (*RouteResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Cache key includes rough distance (+/- 5km) to allow re-selection if route strategy changes
	distBracket := math.Round(targetDistanceKm / 5.0) * 5.0
	cacheKey := fmt.Sprintf("%.3f,%.3f->%.3f,%.3f~%.0fkm", startLat, startLon, endLat, endLon, distBracket)
	if s.cachedKey == cacheKey && s.cachedRes != nil && time.Since(s.cachedRes.CalculatedAt) < 5*time.Minute {
		return s.cachedRes, nil
	}

	var res *RouteResult
	var err error

	switch s.provider {
	case "openrouteservice":
		if s.apiKey != "" {
			res, err = s.routeOpenRouteService(ctx, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes)
		} else {
			res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes)
		}
	case "mapbox":
		if s.apiKey != "" {
			res, err = s.routeMapbox(ctx, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes)
		} else {
			res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes)
		}
	default:
		res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes)
	}

	if err != nil {
		// Fallback to direct straight line if routing service fails
		res = &RouteResult{
			Coordinates: [][]float64{
				{startLat, startLon},
				{endLat, endLon},
			},
			CalculatedAt: time.Now(),
		}
		return res, nil
	}

	res.CalculatedAt = time.Now()
	s.cachedKey = cacheKey
	s.cachedRes = res
	return res, nil
}

type candidateRoute struct {
	coordinates [][]float64
	distance    float64
	duration    float64
}

// Selects candidate route closest to Tesla's reported distance and ETA (e.g. Tollway vs Highway vs National)
func selectBestCandidate(candidates []candidateRoute, targetDistanceKm, targetMinutes float64) candidateRoute {
	if len(candidates) == 0 {
		return candidateRoute{}
	}
	if len(candidates) == 1 || (targetDistanceKm <= 0 && targetMinutes <= 0) {
		return candidates[0]
	}

	targetDistMeters := targetDistanceKm * 1000.0
	targetDurationSec := targetMinutes * 60.0

	bestIdx := 0
	minScore := math.MaxFloat64

	for i, c := range candidates {
		var distDiff, timeDiff float64
		if targetDistMeters > 0 {
			distDiff = math.Abs(c.distance-targetDistMeters) / math.Max(1000.0, targetDistMeters)
		}
		if targetDurationSec > 0 {
			timeDiff = math.Abs(c.duration-targetDurationSec) / math.Max(60.0, targetDurationSec)
		}

		// Combined error score (60% weight on distance, 40% on duration)
		score := 0.6*distDiff + 0.4*timeDiff
		if score < minScore {
			minScore = score
			bestIdx = i
		}
	}

	return candidates[bestIdx]
}

// OSRM Public Routing with alternatives
func (s *RoutingService) routeOSRM(ctx context.Context, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes float64) (*RouteResult, error) {
	url := fmt.Sprintf("https://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson&alternatives=true",
		startLon, startLat, endLon, endLat)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TeslaMap/1.0")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("osrm status error: %d", resp.StatusCode)
	}

	var data struct {
		Routes []struct {
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"` // [lon, lat]
			} `json:"geometry"`
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
		} `json:"routes"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Routes) == 0 {
		return nil, fmt.Errorf("no route found")
	}

	candidates := make([]candidateRoute, len(data.Routes))
	for i, r := range data.Routes {
		coords := make([][]float64, len(r.Geometry.Coordinates))
		for j, c := range r.Geometry.Coordinates {
			if len(c) >= 2 {
				coords[j] = []float64{c[1], c[0]} // convert to [lat, lon]
			}
		}
		candidates[i] = candidateRoute{
			coordinates: coords,
			distance:    r.Distance,
			duration:    r.Duration,
		}
	}

	best := selectBestCandidate(candidates, targetDistanceKm, targetMinutes)

	return &RouteResult{
		Coordinates:     best.coordinates,
		DistanceMeters:  best.distance,
		DurationSeconds: best.duration,
	}, nil
}

// OpenRouteService API with alternative routes
func (s *RoutingService) routeOpenRouteService(ctx context.Context, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes float64) (*RouteResult, error) {
	url := "https://api.openrouteservice.org/v2/directions/driving-car/geojson"

	bodyData := map[string]interface{}{
		"coordinates": [][]float64{
			{startLon, startLat},
			{endLon, endLat},
		},
		"alternative_routes": map[string]interface{}{
			"target_count": 3,
		},
	}
	bodyBytes, _ := json.Marshal(bodyData)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouteservice status: %d", resp.StatusCode)
	}

	var geojson struct {
		Features []struct {
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties struct {
				Summary struct {
					Distance float64 `json:"distance"`
					Duration float64 `json:"duration"`
				} `json:"summary"`
			} `json:"properties"`
		} `json:"features"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&geojson); err != nil {
		return nil, err
	}

	if len(geojson.Features) == 0 {
		return nil, fmt.Errorf("no feature found")
	}

	candidates := make([]candidateRoute, len(geojson.Features))
	for i, feat := range geojson.Features {
		coords := make([][]float64, len(feat.Geometry.Coordinates))
		for j, c := range feat.Geometry.Coordinates {
			if len(c) >= 2 {
				coords[j] = []float64{c[1], c[0]}
			}
		}
		candidates[i] = candidateRoute{
			coordinates: coords,
			distance:    feat.Properties.Summary.Distance,
			duration:    feat.Properties.Summary.Duration,
		}
	}

	best := selectBestCandidate(candidates, targetDistanceKm, targetMinutes)

	return &RouteResult{
		Coordinates:     best.coordinates,
		DistanceMeters:  best.distance,
		DurationSeconds: best.duration,
	}, nil
}

// Mapbox Directions API with alternatives
func (s *RoutingService) routeMapbox(ctx context.Context, startLat, startLon, endLat, endLon, targetDistanceKm, targetMinutes float64) (*RouteResult, error) {
	url := fmt.Sprintf("https://api.mapbox.com/directions/v5/mapbox/driving/%f,%f;%f,%f?geometries=geojson&alternatives=true&access_token=%s",
		startLon, startLat, endLon, endLat, s.apiKey)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mapbox status %d: %s", resp.StatusCode, string(b))
	}

	var data struct {
		Routes []struct {
			Geometry struct {
				Coordinates [][]float64 `json:"coordinates"`
			} `json:"geometry"`
			Distance float64 `json:"distance"`
			Duration float64 `json:"duration"`
		} `json:"routes"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Routes) == 0 {
		return nil, fmt.Errorf("no mapbox route")
	}

	candidates := make([]candidateRoute, len(data.Routes))
	for i, r := range data.Routes {
		coords := make([][]float64, len(r.Geometry.Coordinates))
		for j, c := range r.Geometry.Coordinates {
			if len(c) >= 2 {
				coords[j] = []float64{c[1], c[0]}
			}
		}
		candidates[i] = candidateRoute{
			coordinates: coords,
			distance:    r.Distance,
			duration:    r.Duration,
		}
	}

	best := selectBestCandidate(candidates, targetDistanceKm, targetMinutes)

	return &RouteResult{
		Coordinates:     best.coordinates,
		DistanceMeters:  best.distance,
		DurationSeconds: best.duration,
	}, nil
}
