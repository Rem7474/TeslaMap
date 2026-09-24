// TeslaMap - Live Map Client
(function () {
  const token = window.TESLAMAP_TOKEN;
  if (!token) return;

  let map = null;
  let carMarker = null;
  let carIconElement = null;
  let routeLine = null;
  let traveledLine = null;
  let destMarker = null;
  let firstFix = true;
  let currentLatLng = null;
  let autoFollow = true;
  let isProgrammaticMove = false;

  // Smooth motion interpolation state
  let animFrameId = null;
  let animStartPos = null;
  let animTargetPos = null;
  let animStartTime = 0;
  let animDuration = 1500;
  let animStartHeading = 0;
  let animTargetHeading = 0;
  let lastServerUpdateTime = 0;
  let lastTraveledCoords = [];

  // DOM Elements
  const elStatusChip = document.getElementById('status-chip');
  const elDestTitle = document.getElementById('dest-title');
  const elEtaVal = document.getElementById('eta-val');
  const elMinVal = document.getElementById('min-val');
  const elDistVal = document.getElementById('dist-val');
  const elBatBox = document.getElementById('battery-box');
  const elBatVal = document.getElementById('battery-val');
  const elProgressPct = document.getElementById('progress-pct');
  const elProgressBar = document.getElementById('progress-bar');
  const elSafeZoneAlert = document.getElementById('safe-zone-alert');
  const elSafeZoneName = document.getElementById('safe-zone-name');
  const elRecenterBar = document.getElementById('recenter-bar-container');
  const elRecenterBtn = document.getElementById('recenter-btn');
  const elExpiredCard = document.getElementById('expired-card');
  const elPendingCard = document.getElementById('pending-card');
  const elPendingStartsAt = document.getElementById('pending-starts-at');
  const elTelemetrySheet = document.getElementById('telemetry-sheet');

  function setAutoFollow(enabled) {
    autoFollow = enabled;
    if (elRecenterBar) {
      if (autoFollow || !currentLatLng || (lastTelemetry && lastTelemetry.in_safe_zone)) {
        elRecenterBar.classList.remove('visible');
      } else {
        elRecenterBar.classList.add('visible');
      }
    }
  }

  function animateVehicleTo(targetLat, targetLon, targetHeading) {
    const now = performance.now();
    const targetPos = [targetLat, targetLon];
    const targetH = targetHeading || 0;

    if (!map.hasLayer(carMarker)) {
      carMarker.addTo(map);
    }

    if (firstFix || !animStartPos) {
      firstFix = false;
      currentLatLng = targetPos;
      animStartPos = targetPos;
      animTargetPos = targetPos;
      animStartHeading = targetH;
      animTargetHeading = targetH;
      lastServerUpdateTime = now;
      carMarker.setLatLng(currentLatLng);
      if (!carIconElement) carIconElement = document.getElementById('car-svg-icon');
      if (carIconElement) carIconElement.style.transform = `rotate(${targetH}deg)`;

      isProgrammaticMove = true;
      map.setView(currentLatLng, 15, { animate: false });
      setTimeout(function () {
        isProgrammaticMove = false;
      }, 150);
      return;
    }

    // Adaptive duration matching the server update frequency (typically 1.0s - 3.0s)
    if (lastServerUpdateTime > 0) {
      const delta = now - lastServerUpdateTime;
      if (delta >= 500 && delta <= 6000) {
        animDuration = delta;
      } else {
        animDuration = 1500;
      }
    }
    lastServerUpdateTime = now;

    // Check for large teleport (> 50 km) e.g. reset/simulation loop
    const dist = Math.hypot(targetLat - animStartPos[0], targetLon - animStartPos[1]);
    if (dist > 0.5) {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      currentLatLng = targetPos;
      animStartPos = targetPos;
      animTargetPos = targetPos;
      animStartHeading = targetH;
      animTargetHeading = targetH;
      carMarker.setLatLng(currentLatLng);
      if (carIconElement) carIconElement.style.transform = `rotate(${targetH}deg)`;
      if (autoFollow && map) {
        isProgrammaticMove = true;
        map.setView(currentLatLng, map.getZoom(), { animate: false });
        setTimeout(function () {
          isProgrammaticMove = false;
        }, 150);
      }
      return;
    }

    // Start from current intermediate position
    animStartPos = currentLatLng ? [currentLatLng[0], currentLatLng[1]] : [targetLat, targetLon];
    animTargetPos = targetPos;
    animStartTime = now;

    // Shortest angular turn
    let diff = ((targetH - (animStartHeading % 360) + 540) % 360) - 180;
    animTargetHeading = animStartHeading + diff;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
    }

    // Camera pan in sync with the vehicle animation duration
    if (autoFollow && map) {
      isProgrammaticMove = true;
      map.panTo(targetPos, { animate: true, duration: animDuration / 1000, easeLinearity: 0.25 });
      setTimeout(function () {
        isProgrammaticMove = false;
      }, animDuration + 50);
    }

    function step(timestamp) {
      const elapsed = timestamp - animStartTime;
      const progress = Math.min(elapsed / animDuration, 1.0);

      // Linear interpolation between the two points for constant, natural vehicle velocity
      const lat = animStartPos[0] + (animTargetPos[0] - animStartPos[0]) * progress;
      const lon = animStartPos[1] + (animTargetPos[1] - animStartPos[1]) * progress;
      const heading = animStartHeading + (animTargetHeading - animStartHeading) * progress;

      currentLatLng = [lat, lon];
      carMarker.setLatLng(currentLatLng);

      if (!carIconElement) carIconElement = document.getElementById('car-svg-icon');
      if (carIconElement) {
        carIconElement.style.transform = `rotate(${heading}deg)`;
      }

      // Smoothly update the end of the gray traveled line to the car's current animated point
      if (traveledLine && lastTraveledCoords && lastTraveledCoords.length > 0) {
        traveledLine.setLatLngs(lastTraveledCoords.concat([currentLatLng]));
      }

      if (progress < 1.0) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animStartHeading = animTargetHeading % 360;
        animFrameId = null;
      }
    }

    animFrameId = requestAnimationFrame(step);
  }

  function initMap() {
    // Default to Europe center before first fix
    map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([46.8, 2.5], 6);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Configured map tiles (Mapbox, MapTiler, Stadia or default CartoDB Dark Matter)
    const tileURL = window.TESLAMAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const tileAttr = window.TESLAMAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const tileMaxZoom = window.TESLAMAP_MAX_ZOOM || 19;

    L.tileLayer(tileURL, {
      attribution: tileAttr,
      subdomains: 'abcd',
      maxZoom: tileMaxZoom
    }).addTo(map);

    // Custom Car DivIcon
    const carIcon = L.divIcon({
      className: 'car-marker-container',
      html: '<img src="/static/icons/car.svg" class="car-marker-icon" id="car-svg-icon" alt="Tesla"/>',
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    carMarker = L.marker([46.8, 2.5], {
      icon: carIcon,
      zIndexOffset: 1000,
      interactive: false
    });

    if (elRecenterBtn) {
      elRecenterBtn.addEventListener('click', recenterMap);
    }

    // Detect manual user panning / dragging / zooming
    map.on('dragstart', function () {
      setAutoFollow(false);
    });

    map.on('zoomstart', function () {
      if (!isProgrammaticMove) {
        setAutoFollow(false);
      }
    });
  }

  function recenterMap() {
    if (currentLatLng && map) {
      setAutoFollow(true);
      isProgrammaticMove = true;
      map.setView(currentLatLng, Math.max(map.getZoom(), 15), { animate: true, duration: 0.8 });
      setTimeout(function () {
        isProgrammaticMove = false;
      }, 900);
    }
  }

  function connectSSE() {
    const streamUrl = '/api/stream/' + encodeURIComponent(token);
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = function (e) {
      try {
        const data = JSON.parse(e.data);
        handleTelemetryUpdate(data);
      } catch (err) {
        console.error("Telemetry parse error", err);
      }
    };

    eventSource.addEventListener('pending', function (e) {
      if (elTelemetrySheet) elTelemetrySheet.style.display = 'none';
      if (elPendingCard) elPendingCard.style.display = 'block';
      try {
        const d = JSON.parse(e.data);
        if (d.starts_at && elPendingStartsAt) elPendingStartsAt.textContent = d.starts_at;
      } catch (err) {}
    });

    eventSource.addEventListener('expired', function () {
      eventSource.close();
      showExpiredScreen();
    });

    eventSource.onerror = function () {
      console.warn("SSE connection interrupted, retrying in 3s...");
      if (elStatusChip) {
        elStatusChip.innerHTML = `<span class="pulse-dot"></span><span>${I18n.t('reconnecting')}</span>`;
        elStatusChip.className = "m3-chip m3-chip-warning";
      }
    };
  }

  let lastTelemetry = null;

  function handleTelemetryUpdate(data) {
    lastTelemetry = data;
    if (elPendingCard) elPendingCard.style.display = 'none';
    if (elTelemetrySheet) elTelemetrySheet.style.display = 'block';

    // 1. Safe Zone Check
    if (data.in_safe_zone) {
      if (elSafeZoneAlert) elSafeZoneAlert.style.display = 'flex';
      if (elSafeZoneName) elSafeZoneName.textContent = data.safe_zone_name || I18n.t('private_zone');
      if (map && carMarker && map.hasLayer(carMarker)) {
        map.removeLayer(carMarker);
      }
      if (traveledLine && map.hasLayer(traveledLine)) {
        map.removeLayer(traveledLine);
      }
      if (routeLine && map.hasLayer(routeLine)) {
        map.removeLayer(routeLine);
      }
      if (elRecenterBar) elRecenterBar.classList.remove('visible');
      updateStatusChip(I18n.t('private_zone'), 'm3-chip-warning');
    } else {
      if (elSafeZoneAlert) elSafeZoneAlert.style.display = 'none';
      if (data.latitude != null && data.longitude != null) {
        lastTraveledCoords = data.traveled_coordinates || [];

        // Smoothly interpolate vehicle position, heading, and map pan at 60fps
        animateVehicleTo(data.latitude, data.longitude, data.heading || 0);

        // Ensure traveledLine is created and displayed
        if (lastTraveledCoords.length > 0) {
          const pts = lastTraveledCoords.concat([currentLatLng || [data.latitude, data.longitude]]);
          if (!traveledLine) {
            traveledLine = L.polyline(pts, {
              color: '#94a3b8',
              weight: 5,
              opacity: 0.65,
              lineJoin: 'round',
              lineCap: 'round'
            }).addTo(map);
          } else {
            if (!map.hasLayer(traveledLine)) {
              traveledLine.addTo(map);
            }
            traveledLine.setLatLngs(pts);
          }
        } else if (traveledLine && map.hasLayer(traveledLine)) {
          traveledLine.setLatLngs([]);
        }
      }
    }

    // 2. Status Chip
    let statusText = I18n.t('parked');
    let statusClass = "m3-chip";
    if (data.state === 'driving') {
      statusText = data.speed != null ? `${Math.round(data.speed)} km/h` : I18n.t('driving');
      statusClass = "m3-chip m3-chip-success";
    } else if (data.state === 'charging') {
      statusText = I18n.t('charging');
      statusClass = "m3-chip m3-chip-warning";
    }
    if (!data.in_safe_zone) {
      updateStatusChip(statusText, statusClass);
    }

    // 3. Battery
    if (data.battery_level != null && elBatBox && elBatVal) {
      elBatBox.style.display = 'block';
      elBatVal.textContent = Math.round(data.battery_level) + '%';
    }

    // 4. Active Route & Progress
    if (data.has_active_route && data.destination) {
      if (elDestTitle) elDestTitle.textContent = data.destination;
      if (elEtaVal) elEtaVal.textContent = data.eta || '--:--';
      if (elMinVal) elMinVal.textContent = data.minutes_left != null ? data.minutes_left + ' ' + I18n.t('min_unit') : '--';
      if (elDistVal) elDistVal.textContent = data.distance_left_km != null ? data.distance_left_km + ' ' + I18n.t('km_unit') : '--';

      const pct = data.progress_pct != null ? data.progress_pct : 0;
      if (elProgressPct) elProgressPct.textContent = pct + '%';
      if (elProgressBar) elProgressBar.style.width = pct + '%';

      // Draw Route Polyline
      if (data.route_coordinates && data.route_coordinates.length > 1) {
        if (!routeLine) {
          routeLine = L.polyline(data.route_coordinates, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
        } else {
          routeLine.setLatLngs(data.route_coordinates);
        }

        // Destination Marker
        const destCoord = data.route_coordinates[data.route_coordinates.length - 1];
        if (!destMarker) {
          const destIcon = L.divIcon({
            html: '<div style="background:#e82127;width:14px;height:14px;border-radius:50%;border:3px solid #ffffff;box-shadow:0 0 10px rgba(232,33,39,0.8)"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          destMarker = L.marker(destCoord, { icon: destIcon, interactive: false }).addTo(map);
        } else {
          destMarker.setLatLng(destCoord);
        }
      }
    } else {
      if (elDestTitle) elDestTitle.textContent = I18n.t('free_nav');
      if (elEtaVal) elEtaVal.textContent = "--:--";
      if (elMinVal) elMinVal.textContent = "--";
      if (elDistVal) elDistVal.textContent = "--";
      if (elProgressPct) elProgressPct.textContent = "0%";
      if (elProgressBar) elProgressBar.style.width = "0%";
      if (routeLine && map) {
        map.removeLayer(routeLine);
        routeLine = null;
      }
      if (destMarker && map) {
        map.removeLayer(destMarker);
        destMarker = null;
      }
    }
  }

  function updateStatusChip(text, className) {
    if (elStatusChip) {
      elStatusChip.innerHTML = `<span class="pulse-dot"></span><span>${text}</span>`;
      elStatusChip.className = className;
    }
  }

  function showExpiredScreen() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (elTelemetrySheet) elTelemetrySheet.style.display = 'none';
    if (elRecenterBar) elRecenterBar.classList.remove('visible');
    if (elPendingCard) elPendingCard.style.display = 'none';
    if (elExpiredCard) elExpiredCard.style.display = 'block';
    if (traveledLine && map && map.hasLayer(traveledLine)) map.removeLayer(traveledLine);
    if (routeLine && map && map.hasLayer(routeLine)) map.removeLayer(routeLine);
    if (destMarker && map && map.hasLayer(destMarker)) map.removeLayer(destMarker);
  }

  function updateLangIndicator() {
    const ind = document.getElementById('lang-indicator');
    if (ind && window.I18n) {
      ind.textContent = I18n.getLang() === 'fr' ? 'FR' : 'EN';
    }
  }

  document.addEventListener('languageChanged', function () {
    updateLangIndicator();
    if (lastTelemetry) {
      handleTelemetryUpdate(lastTelemetry);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    const langBtn = document.getElementById('btn-lang-toggle');
    if (langBtn) {
      langBtn.addEventListener('click', function () {
        const nextLang = I18n.getLang() === 'fr' ? 'en' : 'fr';
        I18n.setLang(nextLang);
      });
      updateLangIndicator();
    }

    if (window.TESLAMAP_IS_EXPIRED) {
      showExpiredScreen();
      initMap();
      return;
    }

    if (window.TESLAMAP_IS_PENDING) {
      if (elTelemetrySheet) elTelemetrySheet.style.display = 'none';
      if (elRecenterBar) elRecenterBar.classList.remove('visible');
      if (elPendingCard) elPendingCard.style.display = 'block';
    }

    initMap();
    connectSSE();
  });
})();
