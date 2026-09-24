package geofence

import (
	"testing"
	"teslamap/internal/database"
)

func TestHaversineDistance(t *testing.T) {
	// Paris Eiffel Tower: 48.8584, 2.2945
	// Arc de Triomphe: 48.8738, 2.2950
	// Real distance is ~1.7 km (1700 - 1750 m)
	dist := HaversineDistance(48.8584, 2.2945, 48.8738, 2.2950)
	if dist < 1650 || dist > 1750 {
		t.Errorf("expected distance around 1715m, got %.2f", dist)
	}
}

func TestCheckSafeZones(t *testing.T) {
	zones := []database.SafeZone{
		{
			ID:           1,
			Name:         "Home",
			Latitude:     48.8584,
			Longitude:    2.2945,
			RadiusMeters: 500,
		},
	}

	// 100 meters away -> should be inside
	inside := CheckSafeZones(48.8590, 2.2945, zones)
	if !inside.IsInsideSafeZone {
		t.Errorf("expected to be inside safe zone")
	}
	if inside.ZoneName != "Home" {
		t.Errorf("expected zone name 'Home', got '%s'", inside.ZoneName)
	}

	// 2000 meters away -> should be outside
	outside := CheckSafeZones(48.8738, 2.2950, zones)
	if outside.IsInsideSafeZone {
		t.Errorf("expected to be outside safe zone")
	}
}
