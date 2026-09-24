package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"teslamap/internal/state"
)

func (s *Server) handleShareView(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.NotFound(w, r)
		return
	}

	link, err := s.db.GetSharedLinkByToken(token)
	if err != nil {
		log.Printf("[Server] DB error fetching link %s: %v", token, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	graceHours := s.cfg.PostExpirationGraceHours
	if graceHours <= 0 {
		graceHours = 2
	}

	isExpired := false
	isDefinitelyClosed := false
	isPending := false
	startsAtFormatted := ""

	if link == nil {
		isExpired = true
		isDefinitelyClosed = true
	} else if link.IsDefinitelyClosed(graceHours) {
		isExpired = true
		isDefinitelyClosed = true
	} else if link.IsExpired() {
		isExpired = true
	} else if link.IsPending() {
		isPending = true
		if link.StartsAt != nil {
			startsAtFormatted = link.StartsAt.Local().Format("02/01/2006 à 15:04")
		}
	} else {
		_ = s.db.IncrementLinkViewCount(token)
		s.stateManager.TriggerRouteCalculation()
	}

	title := "Tesla Live"
	if link != nil && link.Label != "" {
		title = link.Label
	}

	tileURL := "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
	attribution := `&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>`
	maxZoom := 19

	if s.cfg.MapTileURL != "" {
		tileURL = s.cfg.MapTileURL
		attribution = `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`
	} else if (s.cfg.MapProvider == "cartodb" || s.cfg.MapProvider == "carto") && s.cfg.MapAPIKey != "" {
		tileURL = fmt.Sprintf("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=%s", s.cfg.MapAPIKey)
		attribution = `&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>`
		maxZoom = 19
	} else if s.cfg.MapProvider == "mapbox" && s.cfg.MapAPIKey != "" {
		tileURL = fmt.Sprintf("https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=%s", s.cfg.MapAPIKey)
		attribution = `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`
		maxZoom = 22
	} else if s.cfg.MapProvider == "maptiler" && s.cfg.MapAPIKey != "" {
		tileURL = fmt.Sprintf("https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=%s", s.cfg.MapAPIKey)
		attribution = `&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>`
		maxZoom = 20
	} else if s.cfg.MapProvider == "stadia" && s.cfg.MapAPIKey != "" {
		tileURL = fmt.Sprintf("https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=%s", s.cfg.MapAPIKey)
		attribution = `&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>`
		maxZoom = 20
	}

	var initialTelemetry *state.PublicTelemetry
	if link != nil && !isDefinitelyClosed {
		if link.IsExpired() && link.LastTelemetry != "" {
			var t state.PublicTelemetry
			if err := json.Unmarshal([]byte(link.LastTelemetry), &t); err == nil {
				initialTelemetry = &t
			}
		}
		if initialTelemetry == nil {
			t := s.stateManager.GetPublicTelemetry(link)
			initialTelemetry = &t
			if link.IsExpired() {
				if b, err := json.Marshal(t); err == nil {
					_ = s.db.SaveLinkLastTelemetry(link.Token, string(b))
				}
			}
		}
	}

	s.renderShareView(w, MapViewData{
		Token:              token,
		Title:              title,
		IsExpired:          isExpired,
		IsDefinitelyClosed: isDefinitelyClosed,
		IsPending:          isPending,
		IsEmbed:            false,
		StartsAt:           startsAtFormatted,
		TileURL:            tileURL,
		Attribution:        attribution,
		MaxZoom:            maxZoom,
		InitialTelemetry:   initialTelemetry,
	})
}

type MapViewData struct {
	Token              string
	Title              string
	IsExpired          bool
	IsDefinitelyClosed bool
	IsPending          bool
	IsEmbed            bool
	StartsAt           string
	TileURL            string
	Attribution        string
	MaxZoom            int
	InitialTelemetry   *state.PublicTelemetry
}

func (s *Server) renderShareView(w http.ResponseWriter, data MapViewData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.templates.ExecuteTemplate(w, "share.html", data); err != nil {
		log.Printf("[Server] Template execution error: %v", err)
	}
}

func (s *Server) handleSSEStream(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Validate link
	link, err := s.db.GetSharedLinkByToken(token)
	if err != nil || link == nil || link.IsExpired() {
		fmt.Fprintf(w, "event: expired\ndata: {}\n\n")
		flusher.Flush()
		return
	}

	if link.IsPending() {
		startsAt := ""
		if link.StartsAt != nil {
			startsAt = link.StartsAt.Local().Format("02/01/2006 à 15:04")
		}
		fmt.Fprintf(w, "event: pending\ndata: {\"starts_at\":\"%s\"}\n\n", startsAt)
		flusher.Flush()
	} else {
		// Send initial snapshot
		initialData := s.stateManager.GetPublicTelemetry(link)
		if b, err := json.Marshal(initialData); err == nil {
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}

	subCh := s.stateManager.Subscribe()
	defer s.stateManager.Unsubscribe(subCh)

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			// Client disconnected
			return

		case <-ticker.C:
			// SSE comment to keep connection alive
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()

		case <-subCh:
			// Check expiration & activation
			link, err := s.db.GetSharedLinkByToken(token)
			if err != nil || link == nil || link.IsExpired() {
				fmt.Fprintf(w, "event: expired\ndata: {}\n\n")
				flusher.Flush()
				return
			}

			if link.IsPending() {
				continue
			}

			telemetry := s.stateManager.GetPublicTelemetry(link)
			b, err := json.Marshal(telemetry)
			if err != nil {
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}
}
