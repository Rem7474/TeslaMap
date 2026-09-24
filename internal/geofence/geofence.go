package geofence

import (
	"math"
	"teslamap/internal/database"
)

const earthRadiusMeters = 6371000.0

// HaversineDistance calculates the great-circle distance between two GPS points in meters.
func HaversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)

	rLat1 := lat1 * (math.Pi / 180.0)
	rLat2 := lat2 * (math.Pi / 180.0)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLon/2)*math.Sin(dLon/2)*math.Cos(rLat1)*math.Cos(rLat2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusMeters * c
}

type CheckResult struct {
	IsInsideSafeZone bool
	ZoneName         string
	DistanceToZone   float64
}

// CheckSafeZones verifies if a given point is inside any registered safe zone.
func CheckSafeZones(lat, lon float64, zones []database.SafeZone) CheckResult {
	for _, z := range zones {
		dist := HaversineDistance(lat, lon, z.Latitude, z.Longitude)
		if dist <= z.RadiusMeters {
			return CheckResult{
				IsInsideSafeZone: true,
				ZoneName:         z.Name,
				DistanceToZone:   dist,
			}
		}
	}
	return CheckResult{IsInsideSafeZone: false}
}
