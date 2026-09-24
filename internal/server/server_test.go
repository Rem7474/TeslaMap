package server

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"teslamap/internal/config"
	"teslamap/internal/database"
	"teslamap/internal/state"
)

func setupTestServer(t *testing.T) (*Server, *database.DB, *state.StateManager) {
	tmpDir := t.TempDir()
	db, err := database.Open(filepath.Join(tmpDir, "test.db"))
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	cfg := &config.Config{
		Port:          "8080",
		AdminPassword: "testpassword",
		SessionSecret: "testsecret12345678901234567890",
	}

	sm := state.NewStateManager(nil, db)
	srv, err := NewServer(cfg, db, sm)
	if err != nil {
		t.Fatalf("failed to create server: %v", err)
	}

	return srv, db, sm
}

func TestAuthAndAdminFlow(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// 1. Unauthorized access to /admin
	req := httptest.NewRequest("GET", "/admin", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusFound {
		t.Errorf("expected 302 redirect for unauthenticated admin access, got %d", w.Code)
	}

	// 2. Wrong login password
	badLoginBody := `{"password":"wrong"}`
	req = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(badLoginBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 on wrong password, got %d", w.Code)
	}

	// 3. Good login password
	goodLoginBody := `{"password":"testpassword"}`
	req = httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(goodLoginBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 on good password, got %d", w.Code)
	}

	// Extract cookie
	cookie := w.Result().Header.Get("Set-Cookie")
	if cookie == "" {
		t.Fatalf("expected Set-Cookie header")
	}

	// 4. Authorized access to /admin
	req = httptest.NewRequest("GET", "/admin", nil)
	req.Header.Set("Cookie", cookie)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for authenticated admin access, got %d", w.Code)
	}

	// 5. Authorized access to /admin/map?embed=1
	req = httptest.NewRequest("GET", "/admin/map?embed=1", nil)
	req.Header.Set("Cookie", cookie)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for authenticated admin map, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, "</html>") || !strings.Contains(body, "live_map.js") {
		t.Errorf("admin map HTML was truncated or incomplete")
	}

	// 6. Test Service Worker kill-switch cleanup route
	req = httptest.NewRequest("GET", "/sw.js", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for /sw.js, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "unregister") {
		t.Errorf("expected unregister script in /sw.js, got %s", w.Body.String())
	}
}

func TestShareViewAndSSE(t *testing.T) {
	srv, db, sm := setupTestServer(t)
	ts := httptest.NewServer(srv.mux)
	t.Cleanup(func() {
		ts.Close()
	})

	// 1. Create a share link
	now := time.Now().UTC()
	exp := now.Add(time.Hour)
	link, err := db.CreateSharedLink("Trajet Test", &now, &exp, false, true, true)
	if err != nil {
		t.Fatalf("failed to create link: %v", err)
	}

	// 2. Access /share/{token}
	resp, err := http.Get(ts.URL + "/share/" + link.Token)
	if err != nil {
		t.Fatalf("failed to GET share view: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 for valid share token, got %d", resp.StatusCode)
	}

	// 3. Update telemetry and check SSE stream
	sm.UpdateLocation(48.8584, 2.2945, 90, 80)

	sseResp, err := http.Get(ts.URL + "/api/stream/" + link.Token)
	if err != nil {
		t.Fatalf("failed to connect to SSE stream: %v", err)
	}

	reader := bufio.NewReader(sseResp.Body)
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed to read initial SSE line: %v", err)
	}
	sseResp.Body.Close() // Cancels connection

	if !strings.HasPrefix(line, "data: ") {
		t.Errorf("expected SSE line starting with 'data: ', got: %s", line)
	}

	// 4. Test an expired token
	pastExp := now.Add(-time.Hour)
	expLink, _ := db.CreateSharedLink("Expired", nil, &pastExp, false, true, true)
	expResp, err := http.Get(ts.URL + "/api/stream/" + expLink.Token)
	if err != nil {
		t.Fatalf("failed to connect to expired SSE: %v", err)
	}
	defer expResp.Body.Close()

	expReader := bufio.NewReader(expResp.Body)
	expLine, _ := expReader.ReadString('\n')
	if !strings.Contains(expLine, "event: expired") {
		t.Errorf("expected SSE expired event, got %s", expLine)
	}
}

func TestAdminCreateLinkAPI(t *testing.T) {
	srv, _, _ := setupTestServer(t)

	// Login first to get cookie
	loginReq := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"password":"testpassword"}`))
	loginW := httptest.NewRecorder()
	srv.mux.ServeHTTP(loginW, loginReq)
	cookie := loginW.Result().Header.Get("Set-Cookie")

	// 1. Create link with duration
	payload := `{"label":"Roadtrip","duration_minutes":120,"expire_on_arrival":true,"show_speed":true,"show_battery":true}`
	req := httptest.NewRequest("POST", "/api/admin/links", bytes.NewBufferString(payload))
	req.Header.Set("Cookie", cookie)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var res struct {
		ID       int64  `json:"id"`
		Token    string `json:"token"`
		Label    string `json:"label"`
		StartsAt string `json:"starts_at"`
	}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if res.Label != "Roadtrip" {
		t.Errorf("expected label Roadtrip, got %s", res.Label)
	}
	if len(res.Token) == 0 {
		t.Errorf("expected non empty token")
	}

	// 2. Create link with specific time slot (e.g. 14h to 16h30)
	slotPayload := `{"label":"Creneau RDV","starts_at":"2026-09-24T14:00:00Z","expires_at":"2026-09-24T16:30:00Z","expire_on_arrival":false,"show_speed":true,"show_battery":true}`
	slotReq := httptest.NewRequest("POST", "/api/admin/links", bytes.NewBufferString(slotPayload))
	slotReq.Header.Set("Cookie", cookie)
	slotReq.Header.Set("Content-Type", "application/json")
	slotW := httptest.NewRecorder()
	srv.mux.ServeHTTP(slotW, slotReq)

	if slotW.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for time slot, got %d: %s", slotW.Code, slotW.Body.String())
	}

	var slotRes struct {
		ID        int64  `json:"id"`
		Label     string `json:"label"`
		StartsAt  string `json:"starts_at"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := json.NewDecoder(slotW.Body).Decode(&slotRes); err != nil {
		t.Fatalf("failed to decode slot response: %v", err)
	}
	if slotRes.StartsAt == "" || slotRes.ExpiresAt == "" {
		t.Errorf("expected starts_at and expires_at to be populated in slot response")
	}
}
