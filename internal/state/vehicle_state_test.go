package state

import (
	"path/filepath"
	"testing"

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
