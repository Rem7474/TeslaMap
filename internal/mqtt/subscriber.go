package mqtt

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
	"teslamap/internal/config"
	"teslamap/internal/state"
)

type Subscriber struct {
	client       paho.Client
	stateManager *state.StateManager
	cfg          *config.Config

	currentLat     float64
	currentLon     float64
	currentHeading float64
	currentSpeed   float64
}

func NewSubscriber(cfg *config.Config, sm *state.StateManager) *Subscriber {
	return &Subscriber{
		cfg:          cfg,
		stateManager: sm,
	}
}

func (s *Subscriber) Start() error {
	opts := paho.NewClientOptions()
	opts.AddBroker(s.cfg.MQTTBroker)
	opts.SetClientID(s.cfg.MQTTClientID)
	if s.cfg.MQTTUsername != "" {
		opts.SetUsername(s.cfg.MQTTUsername)
		opts.SetPassword(s.cfg.MQTTPassword)
	}

	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(10 * time.Second)
	opts.SetKeepAlive(30 * time.Second)

	opts.OnConnect = func(c paho.Client) {
		log.Println("[MQTT] Connected to broker:", s.cfg.MQTTBroker)
		topic := fmt.Sprintf("teslamate/cars/%s/#", s.cfg.TeslaMateCarID)
		if token := c.Subscribe(topic, 0, s.handleMessage); token.Wait() && token.Error() != nil {
			log.Printf("[MQTT] Failed to subscribe to %s: %v\n", topic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to %s\n", topic)
		}
	}

	opts.OnConnectionLost = func(c paho.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v\n", err)
	}

	s.client = paho.NewClient(opts)
	token := s.client.Connect()
	if token.WaitTimeout(5 * time.Second) && token.Error() != nil {
		log.Printf("[MQTT] Initial connection failed (%v), will retry in background\n", token.Error())
	}

	return nil
}

func (s *Subscriber) Stop() {
	if s.client != nil && s.client.IsConnected() {
		s.client.Disconnect(250)
	}
}

func (s *Subscriber) handleMessage(client paho.Client, msg paho.Message) {
	topic := msg.Topic()
	payload := strings.TrimSpace(string(msg.Payload()))
	carPrefix := fmt.Sprintf("teslamate/cars/%s/", s.cfg.TeslaMateCarID)

	if !strings.HasPrefix(topic, carPrefix) {
		return
	}
	subTopic := strings.TrimPrefix(topic, carPrefix)

	switch subTopic {
	case "latitude":
		if val, err := strconv.ParseFloat(payload, 64); err == nil {
			s.currentLat = val
			s.stateManager.UpdateLocation(s.currentLat, s.currentLon, s.currentHeading, s.currentSpeed)
		}
	case "longitude":
		if val, err := strconv.ParseFloat(payload, 64); err == nil {
			s.currentLon = val
			s.stateManager.UpdateLocation(s.currentLat, s.currentLon, s.currentHeading, s.currentSpeed)
		}
	case "heading":
		if val, err := strconv.ParseFloat(payload, 64); err == nil {
			s.currentHeading = val
			s.stateManager.UpdateLocation(s.currentLat, s.currentLon, s.currentHeading, s.currentSpeed)
		}
	case "speed":
		if val, err := strconv.ParseFloat(payload, 64); err == nil {
			s.currentSpeed = val
			s.stateManager.UpdateLocation(s.currentLat, s.currentLon, s.currentHeading, s.currentSpeed)
		}
	case "battery_level":
		if val, err := strconv.ParseFloat(payload, 64); err == nil {
			s.stateManager.UpdateBattery(val)
		}
	case "state":
		s.stateManager.UpdateState(payload)
	case "location":
		// Support JSON location payload if published
		var loc struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Heading   float64 `json:"heading"`
			Speed     float64 `json:"speed"`
		}
		if err := json.Unmarshal(msg.Payload(), &loc); err == nil {
			s.currentLat = loc.Latitude
			s.currentLon = loc.Longitude
			s.currentHeading = loc.Heading
			s.currentSpeed = loc.Speed
			s.stateManager.UpdateLocation(loc.Latitude, loc.Longitude, loc.Heading, loc.Speed)
		}
	case "active_route":
		if payload == "" || payload == "null" {
			s.stateManager.UpdateActiveRoute("", 0, 0, 0, 0, 0)
			return
		}
		var route struct {
			Destination       string  `json:"destination"`
			Latitude          float64 `json:"latitude"`
			Longitude         float64 `json:"longitude"`
			MinutesToArrival  float64 `json:"minutes_to_arrival"`
			DistanceToArrival float64 `json:"distance_to_arrival"`
			EnergyAtArrival   float64 `json:"energy_at_arrival"`
		}
		if err := json.Unmarshal(msg.Payload(), &route); err == nil {
			s.stateManager.UpdateActiveRoute(
				route.Destination,
				route.Latitude,
				route.Longitude,
				route.MinutesToArrival,
				route.DistanceToArrival,
				route.EnergyAtArrival,
			)
		}
	}
}
