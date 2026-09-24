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
	BaseURL         string
	SimulationMode  bool
}

func Load() *Config {
	cfg := &Config{
		Port:            getEnv("PORT", "8080"),
		MQTTBroker:      getEnv("MQTT_BROKER", "tcp://localhost:1883"),
		MQTTClientID:    getEnv("MQTT_CLIENT_ID", "teslamap"),
		MQTTUsername:    os.Getenv("MQTT_USERNAME"),
		MQTTPassword:    os.Getenv("MQTT_PASSWORD"),
		TeslaMateCarID:  getEnv("TESLAMATE_CAR_ID", "1"),
		DatabasePath:    getEnv("DATABASE_PATH", "data/teslamap.db"),
		AdminPassword:   getEnv("ADMIN_PASSWORD", "admin123"),
		SessionSecret:   getEnv("SESSION_SECRET", ""),
		RoutingProvider: strings.ToLower(getEnv("ROUTING_PROVIDER", "osrm")),
		RoutingAPIKey:   os.Getenv("ROUTING_API_KEY"),
		BaseURL:         getEnv("BASE_URL", ""),
		SimulationMode:  getEnvBool("SIMULATION_MODE", false),
	}

	if cfg.SessionSecret == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		cfg.SessionSecret = hex.EncodeToString(b)
	}

	// Auto-detect provider if API key is provided
	if cfg.RoutingAPIKey != "" && cfg.RoutingProvider == "osrm" {
		if strings.HasPrefix(cfg.RoutingAPIKey, "pk.") {
			cfg.RoutingProvider = "mapbox"
		} else {
			cfg.RoutingProvider = "openrouteservice"
		}
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
