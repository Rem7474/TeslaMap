# TeslaMap 🚗🗺️

[![CI](https://github.com/Rem7474/TeslaMap/actions/workflows/ci.yml/badge.svg)](https://github.com/Rem7474/TeslaMap/actions/workflows/ci.yml)
[![Docker](https://github.com/Rem7474/TeslaMap/actions/workflows/release.yml/badge.svg)](https://github.com/Rem7474/TeslaMap/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/Rem7474/TeslaMap)](https://github.com/Rem7474/TeslaMap/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**TeslaMap** is a lightweight, self-contained **Go** application that lets you share the real-time location, navigation route, estimated arrival time (ETA), and trip progress of your **Tesla** connected to **TeslaMate**, using **secure, ephemeral URLs**.

Built with a sleek **Material Design 3 (M3)** dark interface optimized for smartphones and automotive telemetry.

---

## ✨ Features

- **Battery-efficient real-time telemetry**: Passive MQTT ingestion from TeslaMate's Mosquitto broker without waking up or draining the vehicle's battery.
- **Ephemeral & Secure Share Links (`/share/:token`)**:
  - **Relative duration (TTL)**: 1h, 4h, 12h, 24h, 48h, or unlimited.
  - **Scheduled time slots**: Set precise start and end times (e.g. from 2:00 PM to 4:30 PM). Displays a countdown/pending screen prior to window start.
  - **Auto-expire on arrival**: Automatically revokes access as soon as the vehicle is parked at destination.
  - **Instant manual revocation**: One-click revocation or deletion from the admin dashboard.
- **Privacy & Geofencing (Safe Zones)**:
  - Define custom protected zones (e.g. Home, Work) with an adjustable radius in meters.
  - Exact GPS coordinates and live speed are automatically masked while the vehicle is inside a safe zone.
- **Route Tracking & Dynamic Progress**:
  - Automatically fetches destination details from Tesla in-car GPS navigation (`active_route`).
  - Computes and plots the route polyline via **OpenRouteService**, **Mapbox Directions**, or **OSRM** with smart caching.
  - Real-time percentage progress bar, remaining distance, ETA, and estimated battery at destination.
- **Full Internationalization (i18n)**:
  - Built-in English and French translations.
  - Automatic language detection based on browser settings, with manual toggle.
- **Material Design 3 UI**:
  - Mobile-first public view with retractable Bottom Sheet and smooth heading rotation for the vehicle icon.
  - Responsive admin panel with live vehicle status cards, link management, and safe zone controls.
- **Single Static Binary**:
  - Frontend assets (HTML, CSS, JS, SVG icons) embedded directly via `go:embed`.
  - Zero-CGO pure Go SQLite storage (`modernc.org/sqlite`).
- **Multi-architecture Docker support**:
  - Prebuilt images available on GitHub Container Registry (GHCR) for `linux/amd64`, `linux/arm64`, and `linux/arm/v7` (ideal for Raspberry Pi).

---

## 🚀 Quick Start

### 1. Simulation Mode (Test without a car or TeslaMate)

Test the complete application locally with a simulated highway trip:

```bash
# Clone the repository
git clone https://github.com/Rem7474/TeslaMap.git
cd TeslaMap

# Run with simulator enabled
go run ./cmd/teslamap -simulate
```

Open your browser:
- **Admin Dashboard**: `http://localhost:8080/admin` (Default password: `admin123`)
- Create a share link and copy the URL to watch the Tesla drive in real time on the live map!

---

### 2. Docker Compose (Alongside TeslaMate)

Add the `teslamap` service to your existing TeslaMate `docker-compose.yml`:

```yaml
services:
  teslamap:
    image: ghcr.io/rem7474/teslamap:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - DATABASE_PATH=/data/teslamap.db
      - MQTT_BROKER=tcp://mosquitto:1883
      - TESLAMATE_CAR_ID=1
      - ADMIN_PASSWORD=ChooseAStrongPassword!
      - ROUTING_PROVIDER=openrouteservice # options: openrouteservice, mapbox, osrm
      - ROUTING_API_KEY=your_free_api_key
      - SIMULATION_MODE=false
    volumes:
      - teslamap-data:/data
    networks:
      - default

volumes:
  teslamap-data:
```

Start the container:

```bash
docker compose up -d teslamap
```

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP server listening port | `8080` |
| `DATABASE_PATH` | Path to persistent SQLite database file | `data/teslamap.db` |
| `MQTT_BROKER` | Address of the Mosquitto MQTT broker | `tcp://localhost:1883` |
| `MQTT_CLIENT_ID` | MQTT client identifier | `teslamap` |
| `MQTT_USERNAME` | MQTT broker username (optional) | *(empty)* |
| `MQTT_PASSWORD` | MQTT broker password (optional) | *(empty)* |
| `TESLAMATE_CAR_ID` | Car ID in TeslaMate | `1` |
| `ADMIN_PASSWORD` | Password to access `/admin` dashboard | `admin123` |
| `SESSION_SECRET` | Secret key for signed session cookies | *(randomly generated)* |
| `ROUTING_PROVIDER` | Routing engine (`openrouteservice`, `mapbox`, `osrm`) | `osrm` |
| `ROUTING_API_KEY` | API key for OpenRouteService or Mapbox (`pk.xxx`) | *(empty)* |
| `MAP_PROVIDER` | Map tiles provider (`cartodb`, `mapbox`, `maptiler`, `stadia`) | `cartodb` |
| `MAP_API_KEY` | API key for Mapbox, MapTiler, or Stadia tiles (auto-detected if `ROUTING_API_KEY` is a Mapbox key) | *(empty)* |
| `MAP_TILE_URL` | Custom Leaflet tile template URL (optional) | *(empty)* |
| `SIMULATION_MODE` | Enable simulated vehicle driving | `false` |

---

## 🛠️ Development & Testing

```bash
# Run unit and integration test suite
go test -v -race ./...

# Build standalone binary
go build -ldflags="-s -w" -o bin/teslamap ./cmd/teslamap
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
