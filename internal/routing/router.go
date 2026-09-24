package routing

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	CalculateRoute(ctx context.Context, startLat, startLon, endLat, endLon float64) (*RouteResult, error)
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

func (s *RoutingService) CalculateRoute(ctx context.Context, startLat, startLon, endLat, endLon float64) (*RouteResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Cache key with 3 decimal precision (~110 meters) to avoid duplicate API calls
	cacheKey := fmt.Sprintf("%.3f,%.3f->%.3f,%.3f", startLat, startLon, endLat, endLon)
	if s.cachedKey == cacheKey && s.cachedRes != nil && time.Since(s.cachedRes.CalculatedAt) < 5*time.Minute {
		return s.cachedRes, nil
	}

	var res *RouteResult
	var err error

	switch s.provider {
	case "openrouteservice":
		if s.apiKey != "" {
			res, err = s.routeOpenRouteService(ctx, startLat, startLon, endLat, endLon)
		} else {
			res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon)
		}
	case "mapbox":
		if s.apiKey != "" {
			res, err = s.routeMapbox(ctx, startLat, startLon, endLat, endLon)
		} else {
			res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon)
		}
	default:
		res, err = s.routeOSRM(ctx, startLat, startLon, endLat, endLon)
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

// OSRM Public Routing
func (s *RoutingService) routeOSRM(ctx context.Context, startLat, startLon, endLat, endLon float64) (*RouteResult, error) {
	url := fmt.Sprintf("https://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson",
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

	route := data.Routes[0]
	coords := make([][]float64, len(route.Geometry.Coordinates))
	for i, c := range route.Geometry.Coordinates {
		if len(c) >= 2 {
			coords[i] = []float64{c[1], c[0]} // convert to [lat, lon]
		}
	}

	return &RouteResult{
		Coordinates:     coords,
		DistanceMeters:  route.Distance,
		DurationSeconds: route.Duration,
	}, nil
}

// OpenRouteService API
func (s *RoutingService) routeOpenRouteService(ctx context.Context, startLat, startLon, endLat, endLon float64) (*RouteResult, error) {
	url := "https://api.openrouteservice.org/v2/directions/driving-car/geojson"

	bodyData := map[string]interface{}{
		"coordinates": [][]float64{
			{startLon, startLat},
			{endLon, endLat},
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

	feat := geojson.Features[0]
	coords := make([][]float64, len(feat.Geometry.Coordinates))
	for i, c := range feat.Geometry.Coordinates {
		if len(c) >= 2 {
			coords[i] = []float64{c[1], c[0]}
		}
	}

	return &RouteResult{
		Coordinates:     coords,
		DistanceMeters:  feat.Properties.Summary.Distance,
		DurationSeconds: feat.Properties.Summary.Duration,
	}, nil
}

// Mapbox Directions API
func (s *RoutingService) routeMapbox(ctx context.Context, startLat, startLon, endLat, endLon float64) (*RouteResult, error) {
	url := fmt.Sprintf("https://api.mapbox.com/directions/v5/mapbox/driving/%f,%f;%f,%f?geometries=geojson&access_token=%s",
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

	route := data.Routes[0]
	coords := make([][]float64, len(route.Geometry.Coordinates))
	for i, c := range route.Geometry.Coordinates {
		if len(c) >= 2 {
			coords[i] = []float64{c[1], c[0]}
		}
	}

	return &RouteResult{
		Coordinates:     coords,
		DistanceMeters:  route.Distance,
		DurationSeconds: route.Duration,
	}, nil
}
