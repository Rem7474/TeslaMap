package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"teslamap/internal/config"
	"teslamap/internal/database"
	"teslamap/internal/mqtt"
	"teslamap/internal/routing"
	"teslamap/internal/server"
	"teslamap/internal/simulator"
	"teslamap/internal/state"
)

func main() {
	cfg := config.Load()

	// Command line flags override environment variables
	simulateFlag := flag.Bool("simulate", cfg.SimulationMode, "Run in simulation mode (generates virtual trip without MQTT)")
	portFlag := flag.String("port", cfg.Port, "HTTP server port")
	dbFlag := flag.String("db", cfg.DatabasePath, "SQLite database file path")
	mqttFlag := flag.String("mqtt", cfg.MQTTBroker, "MQTT broker URI (e.g. tcp://localhost:1883)")
	carFlag := flag.String("car", cfg.TeslaMateCarID, "TeslaMate Car ID")
	flag.Parse()

	cfg.SimulationMode = *simulateFlag
	cfg.Port = *portFlag
	cfg.DatabasePath = *dbFlag
	cfg.MQTTBroker = *mqttFlag
	cfg.TeslaMateCarID = *carFlag

	log.Println("==================================================")
	log.Println("             TeslaMap - Live Tracker              ")
	log.Println("==================================================")
	log.Printf("• Port:              %s\n", cfg.Port)
	log.Printf("• Database:          %s\n", cfg.DatabasePath)
	log.Printf("• Map Provider:      %s\n", cfg.MapProvider)
	log.Printf("• Routing Provider:  %s\n", cfg.RoutingProvider)
	log.Printf("• Simulation Mode:   %v\n", cfg.SimulationMode)
	if !cfg.SimulationMode {
		log.Printf("• MQTT Broker:       %s\n", cfg.MQTTBroker)
		log.Printf("• Car ID:            %s\n", cfg.TeslaMateCarID)
	}
	log.Println("==================================================")

	// 1. Initialize SQLite Database
	db, err := database.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Fatal: failed to open database: %v\n", err)
	}
	defer db.Close()

	// 2. Initialize Routing Service
	router := routing.NewRoutingService(cfg.RoutingProvider, cfg.RoutingAPIKey)

	// 3. Initialize State Manager
	stateManager := state.NewStateManager(router, db)

	// 4. Ingestion: Simulator OR MQTT Subscriber
	var mqttSub *mqtt.Subscriber
	if cfg.SimulationMode {
		simulator.StartTripSimulator(stateManager)
	} else {
		mqttSub = mqtt.NewSubscriber(cfg, stateManager)
		if err := mqttSub.Start(); err != nil {
			log.Printf("Warning: MQTT subscriber start issue: %v\n", err)
		}
		defer mqttSub.Stop()
	}

	// 5. Initialize Web Server
	srv, err := server.NewServer(cfg, db, stateManager)
	if err != nil {
		log.Fatalf("Fatal: failed to initialize server: %v\n", err)
	}

	// Graceful shutdown handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("\n[TeslaMap] Shutting down...")
		if mqttSub != nil {
			mqttSub.Stop()
		}
		_ = db.Close()
		os.Exit(0)
	}()

	log.Printf("Admin panel: http://localhost:%s/admin (Default password: %s)\n", cfg.Port, cfg.AdminPassword)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Server error: %v\n", err)
	}
}
