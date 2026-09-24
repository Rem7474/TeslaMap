package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"teslamap/internal/database"
	"teslamap/internal/state"
)

func (s *Server) handleLoginPage(w http.ResponseWriter, r *http.Request) {
	if s.auth.IsAuthenticated(r) {
		http.Redirect(w, r, "/admin", http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = s.templates.ExecuteTemplate(w, "login.html", nil)
}

func (s *Server) handleLoginAPI(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	if !s.auth.CheckPassword(body.Password) {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "invalid password"})
		return
	}

	s.auth.SetSessionCookie(w)
	jsonResponse(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleLogoutAPI(w http.ResponseWriter, r *http.Request) {
	s.auth.ClearSessionCookie(w)
	jsonResponse(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleAdminPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = s.templates.ExecuteTemplate(w, "admin.html", nil)
}

func (s *Server) handleAdminStatusAPI(w http.ResponseWriter, r *http.Request) {
	st := s.stateManager.GetRawState()
	jsonResponse(w, http.StatusOK, st)
}

func (s *Server) handleAdminStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	sendUpdate := func() {
		st := s.stateManager.GetRawState()
		links, _ := s.db.ListSharedLinks()
		payload := struct {
			Status state.VehicleState     `json:"status"`
			Links  []database.SharedLink `json:"links"`
		}{
			Status: st,
			Links:  links,
		}
		if b, err := json.Marshal(payload); err == nil {
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}

	// Send initial snapshot
	sendUpdate()

	subCh := s.stateManager.Subscribe()
	defer s.stateManager.Unsubscribe(subCh)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			sendUpdate()
		case <-subCh:
			sendUpdate()
		}
	}
}

func (s *Server) handleAdminLinksListAPI(w http.ResponseWriter, r *http.Request) {
	links, err := s.db.ListSharedLinks()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, links)
}

func (s *Server) handleAdminLinksCreateAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Label           string `json:"label"`
		DurationMinutes int    `json:"duration_minutes"`
		StartsAt        string `json:"starts_at"`
		ExpiresAt       string `json:"expires_at"`
		ExpireOnArrival bool   `json:"expire_on_arrival"`
		ShowSpeed       bool   `json:"show_speed"`
		ShowBattery     bool   `json:"show_battery"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	startsAt, _ := parseFlexibleTime(req.StartsAt)
	expiresAt, _ := parseFlexibleTime(req.ExpiresAt)

	now := time.Now().UTC()
	if startsAt == nil && req.StartsAt == "" {
		startsAt = &now
	}

	if expiresAt == nil && req.DurationMinutes > 0 {
		base := now
		if startsAt != nil {
			base = *startsAt
		}
		exp := base.Add(time.Duration(req.DurationMinutes) * time.Minute)
		expiresAt = &exp
	}

	link, err := s.db.CreateSharedLink(req.Label, startsAt, expiresAt, req.ExpireOnArrival, req.ShowSpeed, req.ShowBattery)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusCreated, link)
}

func parseFlexibleTime(val string) (*time.Time, error) {
	if val == "" {
		return nil, nil
	}
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04",
		"2006-01-02 15:04:05",
	}
	for _, f := range formats {
		if t, err := time.ParseInLocation(f, val, time.Local); err == nil {
			utc := t.UTC()
			return &utc, nil
		}
	}
	return nil, nil
}

func (s *Server) handleAdminLinksDeleteAPI(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	if err := s.db.DeleteLink(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleAdminLinksRevokeAPI(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	if err := s.db.RevokeLink(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *Server) handleAdminZonesListAPI(w http.ResponseWriter, r *http.Request) {
	zones, err := s.db.ListSafeZones()
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, http.StatusOK, zones)
}

func (s *Server) handleAdminZonesCreateAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string  `json:"name"`
		Latitude     float64 `json:"latitude"`
		Longitude    float64 `json:"longitude"`
		RadiusMeters float64 `json:"radius_meters"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	zone, err := s.db.CreateSafeZone(req.Name, req.Latitude, req.Longitude, req.RadiusMeters)
	if err != nil {
		log.Printf("[Server] Error creating safe zone: %v", err)
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusCreated, zone)
}

func (s *Server) handleAdminZonesDeleteAPI(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	if err := s.db.DeleteSafeZone(id); err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	jsonResponse(w, http.StatusOK, map[string]bool{"success": true})
}
