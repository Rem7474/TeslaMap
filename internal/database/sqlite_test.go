package database

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSQLiteCRUD(t *testing.T) {
	tmpDir := t.TempDir()
	db, err := Open(filepath.Join(tmpDir, "test_db.db"))
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer db.Close()

	// 1. Create a link
	now := time.Now().UTC()
	exp := now.Add(2 * time.Hour)
	link, err := db.CreateSharedLink("Vacances", &now, &exp, true, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	if link.Token == "" {
		t.Errorf("expected non-empty token")
	}
	if !link.IsActive {
		t.Errorf("expected link to be active")
	}
	if !link.IsAvailable() {
		t.Errorf("expected link to be available")
	}

	// Test pending time slot
	futureStart := now.Add(2 * time.Hour)
	futureExp := now.Add(4 * time.Hour)
	pendingLink, err := db.CreateSharedLink("Futur", &futureStart, &futureExp, true, true, true)
	if err != nil {
		t.Fatalf("failed to create pending link: %v", err)
	}
	if !pendingLink.IsPending() {
		t.Errorf("expected link to be pending")
	}
	if pendingLink.IsAvailable() {
		t.Errorf("expected link not to be available yet")
	}

	// 2. Fetch by token
	fetched, err := db.GetSharedLinkByToken(link.Token)
	if err != nil {
		t.Fatalf("failed to fetch link: %v", err)
	}
	if fetched == nil {
		t.Fatalf("expected to find link")
	}
	if fetched.Label != "Vacances" {
		t.Errorf("expected label Vacances, got %s", fetched.Label)
	}

	// 3. Increment view count
	_ = db.IncrementLinkViewCount(link.Token)
	fetchedAfter, _ := db.GetSharedLinkByToken(link.Token)
	if fetchedAfter.ViewCount != 1 {
		t.Errorf("expected view count 1, got %d", fetchedAfter.ViewCount)
	}

	// 4. Revoke
	_ = db.RevokeLink(link.ID)
	fetchedRevoked, _ := db.GetSharedLinkByToken(link.Token)
	if fetchedRevoked.IsActive {
		t.Errorf("expected link to be inactive after revocation")
	}

	// 5. Safe Zones
	zone, err := db.CreateSafeZone("Bureau", 48.85, 2.35, 300)
	if err != nil {
		t.Fatalf("failed to create safe zone: %v", err)
	}
	zones, err := db.ListSafeZones()
	if err != nil {
		t.Fatalf("failed to list safe zones: %v", err)
	}
	if len(zones) != 1 {
		t.Errorf("expected 1 zone, got %d", len(zones))
	}

	_ = db.DeleteSafeZone(zone.ID)
	zonesAfter, _ := db.ListSafeZones()
	if len(zonesAfter) != 0 {
		t.Errorf("expected 0 zones after delete, got %d", len(zonesAfter))
	}
}
