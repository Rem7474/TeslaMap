# TeslaMap 🚗🗺️

**TeslaMap** est une application autonome et ultra-légère en **Go** permettant de partager en temps réel la localisation, l'itinéraire, l'heure d'arrivée estimée (ETA) et la progression de votre Tesla connectée à **TeslaMate**, via des **URLs éphémères et sécurisées**.

Conçu avec un design moderne **Material Design 3 (M3)** adapté aux téléphones et tableaux de bord automobiles.

---

## ✨ Fonctionnalités Principales

- **Suivi en temps réel ultra-léger** : Connexion passive au broker MQTT Mosquitto de TeslaMate sans solliciter la batterie du véhicule.
- **URLs de partage éphémères (`/share/:token`)** :
  - **Durée relative** configurable (1h, 4h, 12h, 24h, etc.).
  - **Créneau horaire planifié** : définition d'une heure de début et d'une heure de fin précises (ex: de 14h00 à 16h30) avec affichage d'un écran d'attente soigné tant que le créneau n'a pas débuté.
  - Option d'**expiration automatique à l'arrivée** (dès que le véhicule passe en `parked`).
  - Révocation manuelle instantanée en 1 clic.
- **Protection de la vie privée (Geofencing)** :
  - Définition de zones protégées (Domicile, Travail) avec rayon en mètres.
  - Masquage automatique des coordonnées GPS exactes et de la vitesse lorsque le véhicule entre dans une zone privée.
- **Calcul d'itinéraire et progression** :
  - Récupération de la destination saisie dans le GPS du véhicule (`active_route`).
  - Tracé du trajet (polyline) via **OpenRouteService**, **Mapbox** ou **OSRM**.
  - Calcul dynamique du pourcentage accompli et affichage de la distance / temps restant.
- **Interface moderne Material Design 3** :
  - Vue publique optimisée mobile avec Bottom Sheet rétractable et thème sombre OLED.
  - Icône vectorielle du véhicule avec rotation fluide selon le cap (`heading`).
  - Panneau d'administration épuré pour piloter les partages et surveiller la télémétrie en direct.
- **Binaire unique autonome** : Frontend (HTML, CSS, JS, icônes) et base SQLite embarqués directement dans le binaire Go (`go:embed`), sans aucune dépendance externe au runtime.

---

## 🚀 Démarrage Rapide

### 1. Mode Simulation (Tester sans voiture ni TeslaMate)

Vous pouvez tester l'application immédiatement grâce au moteur de simulation intégré :

```bash
# Compiler et lancer en mode simulation
go run ./cmd/teslamap -simulate
```

Ouvrez ensuite votre navigateur sur :
- **Administration** : `http://localhost:8080/admin` (Mot de passe par défaut : `admin123`)
- Créez un lien de partage pour ouvrir la vue publique `/share/<token>` et voir le véhicule rouler en direct sur l'autoroute avec calcul d'itinéraire et progression dynamique !

---

### 2. Déploiement avec Docker & TeslaMate

Ajoutez simplement le service dans le fichier `docker-compose.yml` de votre stack TeslaMate :

```yaml
services:
  teslamap:
    image: teslamap:latest
    build:
      context: https://github.com/votre-user/TeslaMap.git
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - DATABASE_PATH=/data/teslamap.db
      - MQTT_BROKER=tcp://mosquitto:1883
      - TESLAMATE_CAR_ID=1
      - ADMIN_PASSWORD=VotreMotDePasseSecret!
      - ROUTING_PROVIDER=openrouteservice # ou mapbox, osrm
      - ROUTING_API_KEY=votre_cle_api_gratuite
      - SIMULATION_MODE=false
    volumes:
      - teslamap-data:/data

volumes:
  teslamap-data:
```

Puis démarrez le conteneur :

```bash
docker compose up -d teslamap
```

---

## ⚙️ Variables d'Environnement

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `PORT` | Port d'écoute HTTP | `8080` |
| `DATABASE_PATH` | Emplacement du fichier SQLite | `data/teslamap.db` |
| `MQTT_BROKER` | Adresse du broker MQTT Mosquitto | `tcp://localhost:1883` |
| `MQTT_USERNAME` | Nom d'utilisateur MQTT (si requis) | *(vide)* |
| `MQTT_PASSWORD` | Mot de passe MQTT (si requis) | *(vide)* |
| `TESLAMATE_CAR_ID` | Identifiant du véhicule dans TeslaMate | `1` |
| `ADMIN_PASSWORD` | Mot de passe d'accès au dashboard `/admin` | `admin123` |
| `ROUTING_PROVIDER` | Moteur de calcul d'itinéraire (`openrouteservice`, `mapbox`, `osrm`) | `osrm` |
| `ROUTING_API_KEY` | Clé API pour OpenRouteService ou Mapbox | *(vide)* |
| `SIMULATION_MODE` | Activer la simulation de conduite | `false` |

---

## 🛠️ Développement & Tests

```bash
# Lancer les tests unitaires et d'intégration
go test -v ./...

# Compiler le binaire autonome
go build -o bin/teslamap ./cmd/teslamap
```
