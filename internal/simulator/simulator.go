package simulator

import (
	"log"
	"math"
	"time"

	"teslamap/internal/state"
)

// Trip waypoint
type waypoint struct {
	lat float64
	lon float64
}

// StartTripSimulator runs a realistic driving loop
func StartTripSimulator(sm *state.StateManager) {
	log.Println("[Simulator] Starting driving simulation mode...")

	// Waypoints along A6 from Paris towards Fontainebleau
	waypoints := []waypoint{
		{48.8584, 2.2945}, // Paris Eiffel Tower
		{48.8250, 2.3300}, // Porte d'Orléans
		{48.7500, 2.3600}, // Rungis
		{48.6500, 2.4500}, // Évry
		{48.5400, 2.6500}, // Melun
		{48.4020, 2.7000}, // Fontainebleau
	}

	go func() {
		// Initial state
		battery := 85.0
		destLat, destLon := 48.4020, 2.7000
		totalDistKm := 65.0

		for {
			log.Println("[Simulator] New simulated journey starting: Paris -> Fontainebleau")
			sm.UpdateState("driving")
			sm.UpdateBattery(battery)
			sm.UpdateActiveRoute("Fontainebleau - Château", destLat, destLon, 54, totalDistKm, 62)

			// Interpolate smoothly between waypoints
			for i := 0; i < len(waypoints)-1; i++ {
				w1 := waypoints[i]
				w2 := waypoints[i+1]
				steps := 25

				for s := 0; s <= steps; s++ {
					t := float64(s) / float64(steps)
					curLat := w1.lat + t*(w2.lat-w1.lat)
					curLon := w1.lon + t*(w2.lon-w1.lon)

					// Calculate heading
					dLon := w2.lon - w1.lon
					y := math.Sin(dLon*math.Pi/180) * math.Cos(w2.lat*math.Pi/180)
					x := math.Cos(w1.lat*math.Pi/180)*math.Sin(w2.lat*math.Pi/180) -
						math.Sin(w1.lat*math.Pi/180)*math.Cos(w2.lat*math.Pi/180)*math.Cos(dLon*math.Pi/180)
					heading := math.Atan2(y, x) * 180 / math.Pi
					if heading < 0 {
						heading += 360
					}

					speed := 75.0 + 35.0*math.Sin(float64(s)/3.0) // ~75-110 km/h

					// Distance remaining approximation
					overallProgress := (float64(i) + t) / float64(len(waypoints)-1)
					distLeft := totalDistKm * (1.0 - overallProgress)
					if distLeft < 0.2 {
						distLeft = 0
					}
					minsLeft := math.Round(distLeft / 1.1)

					battery -= 0.05
					sm.UpdateBattery(battery)
					sm.UpdateLocation(curLat, curLon, heading, speed)
					sm.UpdateActiveRoute("Fontainebleau - Château", destLat, destLon, minsLeft, distLeft, battery-12)

					time.Sleep(1500 * time.Millisecond)
				}
			}

			// Arrived at destination
			log.Println("[Simulator] Arrived at destination! Setting state to parked.")
			sm.UpdateState("parked")
			sm.UpdateLocation(destLat, destLon, 0, 0)
			sm.UpdateActiveRoute("", 0, 0, 0, 0, 0)

			// Rest at destination for 20 seconds before repeating
			time.Sleep(20 * time.Second)
		}
	}()
}
