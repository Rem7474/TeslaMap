package routing

import (
	"testing"
)

func TestSelectBestCandidate(t *testing.T) {
	// Candidate 1: Highway route (e.g. 50 km, 35 minutes)
	c1 := candidateRoute{
		coordinates: [][]float64{{48.8, 2.3}, {48.5, 2.5}},
		distance:    50000.0, // 50 km
		duration:    2100.0,  // 35 min
	}

	// Candidate 2: National / No-toll route (e.g. 58 km, 55 minutes)
	c2 := candidateRoute{
		coordinates: [][]float64{{48.8, 2.3}, {48.6, 2.4}, {48.5, 2.5}},
		distance:    58000.0, // 58 km
		duration:    3300.0,  // 55 min
	}

	candidates := []candidateRoute{c1, c2}

	// Test 1: Tesla navigation reports 57 km and 54 mins (driver chose Avoid Tolls)
	bestNoToll := selectBestCandidate(candidates, 57.0, 54.0)
	if bestNoToll.distance != c2.distance {
		t.Errorf("expected national road candidate c2 (58km), got %.0fm", bestNoToll.distance)
	}

	// Test 2: Tesla navigation reports 49 km and 36 mins (driver chose Highway)
	bestHighway := selectBestCandidate(candidates, 49.0, 36.0)
	if bestHighway.distance != c1.distance {
		t.Errorf("expected highway candidate c1 (50km), got %.0fm", bestHighway.distance)
	}
}
