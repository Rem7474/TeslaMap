package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port            string
	MQTTBroker      string
	MQTTClientID    string
	MQTTUsername    string
	MQTTPassword    string
	TeslaMateCarID  string
	DatabasePath    string
	AdminPassword   string
	SessionSecret   string
	RoutingProvider string // "osrm", "openrouteservice", "mapbox"
	RoutingAPIKey   string
	MapProvider     string // "cartodb", "mapbox", "maptiler", "stadia"
	MapAPIKey       string
	MapTileURL      string
	BaseURL                      string
	SimulationMode               bool
	PostExpirationGraceHours     int
	RoutingRecalcIntervalMinutes int
}

func Load() *Config {
	cfg := &Config{
		Port:                         getEnv("PORT", "8080"),
		MQTTBroker:                   getEnv("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTClientID:                 getEnv("MQTT_CLIENT_ID", "teslamap"),
		MQTTUsername:                 os.Getenv("MQTT_USERNAME"),
		MQTTPassword:                 os.Getenv("MQTT_PASSWORD"),
		TeslaMateCarID:               getEnv("TESLAMATE_CAR_ID", "1"),
		DatabasePath:                 getEnv("DATABASE_PATH", "data/teslamap.db"),
		AdminPassword:                getEnv("ADMIN_PASSWORD", "admin123"),
		SessionSecret:                getEnv("SESSION_SECRET", ""),
		RoutingProvider:              strings.ToLower(getEnv("ROUTING_PROVIDER", "osrm")),
		RoutingAPIKey:                os.Getenv("ROUTING_API_KEY"),
		MapProvider:                  strings.ToLower(getEnv("MAP_PROVIDER", "cartodb")),
		MapAPIKey:                    getEnv("MAP_API_KEY", ""),
		MapTileURL:                   os.Getenv("MAP_TILE_URL"),
		BaseURL:                      getEnv("BASE_URL", ""),
		SimulationMode:               getEnvBool("SIMULATION_MODE", false),
		PostExpirationGraceHours:     getEnvInt("POST_EXPIRATION_GRACE_HOURS", 2),
		RoutingRecalcIntervalMinutes: getEnvInt("ROUTING_RECALC_INTERVAL_MINUTES", 3),
	}

	if cfg.SessionSecret == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		cfg.SessionSecret = hex.EncodeToString(b)
	}

	// Auto-detect routing provider if API key is provided
	if cfg.RoutingAPIKey != "" && cfg.RoutingProvider == "osrm" {
		if strings.HasPrefix(cfg.RoutingAPIKey, "pk.") {
			cfg.RoutingProvider = "mapbox"
		} else {
			cfg.RoutingProvider = "openrouteservice"
		}
	}

	// Auto-detect Mapbox for map tiles if key starts with pk.
	if cfg.MapAPIKey == "" && strings.HasPrefix(cfg.RoutingAPIKey, "pk.") {
		cfg.MapAPIKey = cfg.RoutingAPIKey
		cfg.MapProvider = "mapbox"
	} else if cfg.MapAPIKey != "" && strings.HasPrefix(cfg.MapAPIKey, "pk.") {
		cfg.MapProvider = "mapbox"
	}

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		b, err := strconv.ParseBool(val)
		if err == nil {
			return b
		}
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		i, err := strconv.Atoi(val)
		if err == nil {
			return i
		}
	}
	return defaultVal
}
