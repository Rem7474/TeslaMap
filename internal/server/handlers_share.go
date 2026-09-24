package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
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

	isExpired := false
	isPending := false
	startsAtFormatted := ""

	if link == nil || link.IsExpired() {
		isExpired = true
	} else if link.IsPending() {
		isPending = true
		if link.StartsAt != nil {
			startsAtFormatted = link.StartsAt.Local().Format("02/01/2006 à 15:04")
		}
	} else {
		_ = s.db.IncrementLinkViewCount(token)
	}

	title := "Tesla Live"
	if link != nil && link.Label != "" {
		title = link.Label
	}

	data := struct {
		Token     string
		Title     string
		IsExpired bool
		IsPending bool
		StartsAt  string
	}{
		Token:     token,
		Title:     title,
		IsExpired: isExpired,
		IsPending: isPending,
		StartsAt:  startsAtFormatted,
	}

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
