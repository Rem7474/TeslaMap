package state

import (
	"path/filepath"
	"testing"
	"time"

	"teslamap/internal/database"
)

func TestProgressCalculation(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)

	// Car starts trip: initial distance 100 km, 100 km left
	sm.UpdateActiveRoute("Lyon", 45.75, 4.85, 90, 100.0, 50)
	link, _ := db.CreateSharedLink("Test", nil, nil, false, true, true)

	telem := sm.GetPublicTelemetry(link)
	if telem.ProgressPct != 0 {
		t.Errorf("expected 0%% progress, got %.1f%%", telem.ProgressPct)
	}

	// Car has traveled: now 40 km left
	sm.UpdateActiveRoute("Lyon", 45.75, 4.85, 35, 40.0, 50)
	telem = sm.GetPublicTelemetry(link)
	if telem.ProgressPct != 60 {
		t.Errorf("expected 60%% progress, got %.1f%%", telem.ProgressPct)
	}
	if telem.MinutesLeft != 35 {
		t.Errorf("expected 35 minutes left, got %d", telem.MinutesLeft)
	}
}

func TestSafeZoneMasking(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	// Create a safe zone around 48.8584, 2.2945 (radius 500m)
	_, err = db.CreateSafeZone("Home", 48.8584, 2.2945, 500)
	if err != nil {
		t.Fatalf("failed to create safe zone: %v", err)
	}

	sm := NewStateManager(nil, db)
	link, _ := db.CreateSharedLink("Test", nil, nil, false, true, true)

	// Car is 50 meters inside safe zone
	sm.UpdateLocation(48.8586, 2.2945, 180, 0)
	telem := sm.GetPublicTelemetry(link)

	if !telem.InSafeZone {
		t.Errorf("expected vehicle to be detected inside safe zone")
	}
	if telem.Latitude != nil || telem.Longitude != nil {
		t.Errorf("expected coordinates to be nil/masked inside safe zone")
	}
	if telem.SafeZoneName != "Home" {
		t.Errorf("expected SafeZoneName 'Home', got '%s'", telem.SafeZoneName)
	}

	// Move car outside safe zone
	sm.UpdateLocation(48.9000, 2.3000, 180, 50)
	telem = sm.GetPublicTelemetry(link)

	if telem.InSafeZone {
		t.Errorf("expected vehicle to be outside safe zone")
	}
	if telem.Latitude == nil || telem.Longitude == nil {
		t.Errorf("expected coordinates to be present outside safe zone")
	}
}

func TestTeslaMateGeofenceMasking(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)
	link, _ := db.CreateSharedLink("Test TM Geofence", nil, nil, false, true, true)

	// 1. Car is driving and receives TeslaMate geofence "Maison" via MQTT
	sm.UpdateLocation(48.8584, 2.2945, 180, 50)
	sm.UpdateTeslaMateGeofence("Maison")

	telem := sm.GetPublicTelemetry(link)
	if !telem.InSafeZone {
		t.Errorf("expected vehicle to be in safe zone when TeslaMate geofence is active")
	}
	if telem.SafeZoneName != "Maison" {
		t.Errorf("expected SafeZoneName 'Maison', got '%s'", telem.SafeZoneName)
	}
	if telem.Latitude != nil || telem.Longitude != nil {
		t.Errorf("expected coordinates to be nil/masked inside TeslaMate geofence")
	}
	if telem.Speed != nil {
		t.Errorf("expected speed to be nil/masked inside TeslaMate geofence")
	}

	// 2. Car leaves TeslaMate geofence (TeslaMate sends empty string "")
	sm.UpdateTeslaMateGeofence("")
	telem = sm.GetPublicTelemetry(link)
	if telem.InSafeZone {
		t.Errorf("expected vehicle to no longer be in safe zone")
	}
	if telem.Latitude == nil || telem.Longitude == nil {
		t.Errorf("expected coordinates to be visible outside geofence")
	}
}

func TestAutoExpire_ParkedMidTripDoesNotExpire(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)

	// Link configured with expire_on_arrival = true
	link, err := db.CreateSharedLink("Roadtrip", nil, nil, true, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	// 1. Vehicle is driving towards Lyon (45.75, 4.85)
	sm.UpdateState("driving")
	sm.UpdateLocation(47.79, 3.57, 180, 110) // Auxerre (~250km from Lyon)
	sm.UpdateActiveRoute("Lyon", 45.75, 4.85, 120, 250.0, 45)

	// 2. Vehicle parks at a Supercharger / rest stop (still 250km from Lyon)
	sm.UpdateState("parked")

	// 3. Verify link is STILL ACTIVE
	reloaded, err := db.GetSharedLinkByToken(link.Token)
	if err != nil || reloaded == nil {
		t.Fatalf("failed to fetch link: %v", err)
	}
	if !reloaded.IsActive {
		t.Errorf("expected link to remain active when parked mid-trip (far from destination)")
	}
}

func TestAutoExpire_ParkedAtDestinationExpiresImmediately(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)

	link, err := db.CreateSharedLink("Destination Test", nil, nil, true, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	// 1. Driving near destination (48.8584, 2.2945)
	destLat, destLon := 48.8584, 2.2945
	sm.UpdateState("driving")
	sm.UpdateLocation(48.8585, 2.2945, 90, 20) // ~11m from destination
	sm.UpdateActiveRoute("Eiffel Tower", destLat, destLon, 1, 0.1, 80)

	// 2. Arrives and parks
	sm.UpdateState("parked")

	// 3. Verify link is deactivated immediately
	reloaded, err := db.GetSharedLinkByToken(link.Token)
	if err != nil || reloaded == nil {
		t.Fatalf("failed to fetch link: %v", err)
	}
	if reloaded.IsActive {
		t.Errorf("expected link to be deactivated immediately upon parking at destination")
	}
}

func TestAutoExpire_FreeDrivingGracePeriod(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)
	// Fast grace duration for test: 50ms
	sm.SetParkGraceDuration(50 * time.Millisecond)

	link, err := db.CreateSharedLink("Free Driving", nil, nil, true, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	// 1. Driving without active route
	sm.UpdateState("driving")
	sm.UpdateLocation(48.8584, 2.2945, 90, 50)

	// 2. Parks
	sm.UpdateState("parked")

	// Immediately, link must still be active (grace period)
	reloaded, _ := db.GetSharedLinkByToken(link.Token)
	if !reloaded.IsActive {
		t.Errorf("expected link to stay active during grace period")
	}

	// Wait for grace timer to fire (80ms > 50ms)
	time.Sleep(80 * time.Millisecond)

	reloaded, _ = db.GetSharedLinkByToken(link.Token)
	if reloaded.IsActive {
		t.Errorf("expected link to expire after grace period elapsed")
	}
}

func TestAutoExpire_FreeDrivingResumesDrivingCancelsGraceTimer(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)
	// Grace duration 100ms
	sm.SetParkGraceDuration(100 * time.Millisecond)

	link, err := db.CreateSharedLink("Resume Test", nil, nil, true, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	// 1. Driving
	sm.UpdateState("driving")

	// 2. Quick stop (parks)
	sm.UpdateState("parked")

	// 3. Resumes driving after 30ms (before 100ms timer)
	time.Sleep(30 * time.Millisecond)
	sm.UpdateState("driving")

	// Wait past initial 100ms (120ms total)
	time.Sleep(90 * time.Millisecond)

	reloaded, _ := db.GetSharedLinkByToken(link.Token)
	if !reloaded.IsActive {
		t.Errorf("expected link to remain active because driving resumed before grace timer fired")
	}
}

func TestTraveledPathTrackingAndFiltering(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	sm := NewStateManager(nil, db)

	// 1. Move outside safe zone across 3 points (each > 15m apart)
	sm.UpdateLocation(48.8584, 2.2945, 90, 50)
	sm.UpdateLocation(48.8590, 2.2950, 90, 50)
	sm.UpdateLocation(48.8600, 2.2960, 90, 50)

	linkAll, _ := db.CreateSharedLink("All Path", nil, nil, false, true, true)
	telem := sm.GetPublicTelemetry(linkAll)

	if len(telem.TraveledCoordinates) != 3 {
		t.Fatalf("expected 3 traveled coordinates, got %d", len(telem.TraveledCoordinates))
	}

	// 2. Link with starts_at in the future: points before starts_at are filtered
	futureStart := time.Now().Add(10 * time.Minute)
	linkFuture, _ := db.CreateSharedLink("Future Link", &futureStart, nil, false, true, true)
	telemFuture := sm.GetPublicTelemetry(linkFuture)

	if len(telemFuture.TraveledCoordinates) != 0 {
		t.Errorf("expected 0 traveled coordinates for future link, got %d", len(telemFuture.TraveledCoordinates))
	}

	// 3. New route clears previous trip's traveled coordinates
	sm.UpdateActiveRoute("Versailles", 48.8049, 2.1204, 20, 15.0, 70)
	telemNewRoute := sm.GetPublicTelemetry(linkAll)
	if len(telemNewRoute.TraveledCoordinates) != 0 {
		t.Errorf("expected 0 traveled coordinates after new route began, got %d", len(telemNewRoute.TraveledCoordinates))
	}
}


