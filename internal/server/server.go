package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"

	"teslamap/internal/auth"
	"teslamap/internal/config"
	"teslamap/internal/database"
	"teslamap/internal/state"
	"teslamap/web"
)

type Server struct {
	cfg          *config.Config
	db           *database.DB
	stateManager *state.StateManager
	auth         *auth.AuthManager
	templates    *template.Template
	mux          *http.ServeMux
}

func NewServer(cfg *config.Config, db *database.DB, sm *state.StateManager) (*Server, error) {
	tmpl, err := web.ParseTemplates()
	if err != nil {
		return nil, fmt.Errorf("failed to parse templates: %w", err)
	}

	authMgr := auth.NewAuthManager(cfg.AdminPassword, cfg.SessionSecret)

	s := &Server{
		cfg:          cfg,
		db:           db,
		stateManager: sm,
		auth:         authMgr,
		templates:    tmpl,
		mux:          http.NewServeMux(),
	}

	s.routes()
	return s, nil
}

func (s *Server) routes() {
	// Static files
	staticFS, err := web.StaticFS()
	if err != nil {
		log.Fatalf("failed to load static fs: %v", err)
	}
	s.mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(staticFS)))

	// Public share routes
	s.mux.HandleFunc("GET /share/{token}", s.handleShareView)
	s.mux.HandleFunc("GET /api/stream/{token}", s.handleSSEStream)

	// Clean up any stale Service Workers registered on this host/port by previous apps
	handleSWCleanup := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		_, _ = w.Write([]byte(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>{e.waitUntil(self.registration.unregister().then(()=>self.clients.matchAll()).then(clients=>{clients.forEach(c=>{if(c.url&&'navigate'in c)c.navigate(c.url);});}));});`))
	}
	s.mux.HandleFunc("GET /sw.js", handleSWCleanup)
	s.mux.HandleFunc("GET /service-worker.js", handleSWCleanup)

	// Admin and Auth routes
	s.mux.HandleFunc("GET /login", s.handleLoginPage)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLoginAPI)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleLogoutAPI)

	// Admin protected pages & APIs
	s.mux.HandleFunc("GET /admin", s.requireAuth(s.handleAdminPage))
	s.mux.HandleFunc("GET /admin/map", s.requireAuth(s.handleAdminMapPage))
	s.mux.HandleFunc("GET /api/admin/status", s.requireAuth(s.handleAdminStatusAPI))
	s.mux.HandleFunc("GET /api/admin/stream", s.requireAuth(s.handleAdminStream))
	s.mux.HandleFunc("GET /api/admin/links", s.requireAuth(s.handleAdminLinksListAPI))
	s.mux.HandleFunc("POST /api/admin/links", s.requireAuth(s.handleAdminLinksCreateAPI))
	s.mux.HandleFunc("DELETE /api/admin/links/{id}", s.requireAuth(s.handleAdminLinksDeleteAPI))
	s.mux.HandleFunc("POST /api/admin/links/{id}/revoke", s.requireAuth(s.handleAdminLinksRevokeAPI))
	s.mux.HandleFunc("GET /api/admin/zones", s.requireAuth(s.handleAdminZonesListAPI))
	s.mux.HandleFunc("POST /api/admin/zones", s.requireAuth(s.handleAdminZonesCreateAPI))
	s.mux.HandleFunc("DELETE /api/admin/zones/{id}", s.requireAuth(s.handleAdminZonesDeleteAPI))
	s.mux.HandleFunc("POST /api/admin/settings/teslamate-geofence", s.requireAuth(s.handleAdminToggleTeslaMateGeofenceAPI))

	// Root redirect
	s.mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/admin", http.StatusFound)
	})
}

func (s *Server) ListenAndServe() error {
	addr := ":" + s.cfg.Port
	log.Printf("[HTTP] TeslaMap web server listening on http://0.0.0.0:%s\n", s.cfg.Port)
	return http.ListenAndServe(addr, s.mux)
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.auth.IsAuthenticated(r) {
			if r.Header.Get("Accept") == "application/json" || r.URL.Path[:5] == "/api/" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			} else {
				http.Redirect(w, r, "/login", http.StatusFound)
			}
			return
		}
		next(w, r)
	}
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
