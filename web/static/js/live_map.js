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
  let confirmedTraveledCoords = [];
  let fullRouteCoords = [];
  let lastRouteIdx = 0;

  function getRemainingRoute(carPos, fullRoute) {
    if (!fullRoute || fullRoute.length < 2) return fullRoute || [];
    if (!carPos) return fullRoute;

    const carLat = carPos[0];
    const carLon = carPos[1];

    let minD2 = Infinity;
    let bestIdx = lastRouteIdx;
    let bestT = 0;

    const searchStart = Math.max(0, lastRouteIdx - 2);
    for (let i = searchStart; i < fullRoute.length - 1; i++) {
      const a = fullRoute[i];
      const b = fullRoute[i + 1];
      const dy = b[0] - a[0];
      const dx = b[1] - a[1];
      const l2 = dx * dx + dy * dy;

      let t = 0;
      if (l2 > 0) {
        t = ((carLon - a[1]) * dx + (carLat - a[0]) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
      }
      const projLat = a[0] + t * dy;
      const projLon = a[1] + t * dx;
      const d2 = (carLat - projLat) * (carLat - projLat) + (carLon - projLon) * (carLon - projLon);

      if (d2 < minD2) {
        minD2 = d2;
        bestIdx = i;
        bestT = t;
      }
    }

    // If car deviates or resets, scan whole route if min distance is too large (> ~1km)
    if (minD2 > 0.0001) {
      for (let i = 0; i < searchStart; i++) {
        const a = fullRoute[i];
        const b = fullRoute[i + 1];
        const dy = b[0] - a[0];
        const dx = b[1] - a[1];
        const l2 = dx * dx + dy * dy;

        let t = 0;
        if (l2 > 0) {
          t = ((carLon - a[1]) * dx + (carLat - a[0]) * dy) / l2;
          t = Math.max(0, Math.min(1, t));
        }
        const projLat = a[0] + t * dy;
        const projLon = a[1] + t * dx;
        const d2 = (carLat - projLat) * (carLat - projLat) + (carLon - projLon) * (carLon - projLon);

        if (d2 < minD2) {
          minD2 = d2;
          bestIdx = i;
          bestT = t;
        }
      }
    }

    lastRouteIdx = bestIdx;

    const remaining = [carPos];
    const startOffset = (bestT <= 0.001) ? bestIdx : bestIdx + 1;
    for (let i = startOffset; i < fullRoute.length; i++) {
      remaining.push(fullRoute[i]);
    }
    return remaining;
  }

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
  const elClosedCard = document.getElementById('closed-card');
  const elTripSummarySection = document.getElementById('trip-summary-section');
  const elSummaryDistance = document.getElementById('summary-distance');
  const elSummaryDuration = document.getElementById('summary-duration');
  const elSummarySpeedBox = document.getElementById('summary-speed-box');
  const elSummarySpeed = document.getElementById('summary-speed');
  const elSummaryArrivalBox = document.getElementById('summary-arrival-box');
  const elSummaryArrival = document.getElementById('summary-arrival');
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
      if (routeLine && fullRouteCoords && fullRouteCoords.length > 1) {
        routeLine.setLatLngs(getRemainingRoute(currentLatLng, fullRouteCoords));
      }
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
      if (traveledLine && confirmedTraveledCoords && confirmedTraveledCoords.length > 0) {
        traveledLine.setLatLngs(confirmedTraveledCoords.concat([currentLatLng]));
      }
      if (routeLine && fullRouteCoords && fullRouteCoords.length > 1) {
        routeLine.setLatLngs(getRemainingRoute(currentLatLng, fullRouteCoords));
      }
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

      // Camera stays locked directly to the car's 60fps movement
      if (autoFollow && map) {
        isProgrammaticMove = true;
        map.panTo(currentLatLng, { animate: false });
      }

      // Smoothly update the end of the gray traveled line to the car's current animated point
      if (traveledLine && (confirmedTraveledCoords.length > 0 || currentLatLng)) {
        traveledLine.setLatLngs(confirmedTraveledCoords.concat([currentLatLng]));
      }

      // Smoothly update the upcoming blue route line so it shrinks seamlessly from the car's position at 60fps
      if (routeLine && fullRouteCoords && fullRouteCoords.length > 1) {
        routeLine.setLatLngs(getRemainingRoute(currentLatLng, fullRouteCoords));
      }

      if (progress < 1.0) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animStartHeading = animTargetHeading % 360;
        animFrameId = null;
        if (lastTelemetry && lastTelemetry.traveled_coordinates) {
          confirmedTraveledCoords = lastTelemetry.traveled_coordinates;
          if (traveledLine) {
            traveledLine.setLatLngs(confirmedTraveledCoords);
          }
        }
        setTimeout(function () {
          isProgrammaticMove = false;
        }, 50);
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

    if (token === 'admin') {
      fetch('/api/admin/zones').then(function(r) { return r.json(); }).then(updateSafeZones).catch(function() {});
    }
  }

  let safeZoneLayers = [];
  function updateSafeZones(zones) {
    if (!map || !zones) return;
    safeZoneLayers.forEach(function (l) { map.removeLayer(l); });
    safeZoneLayers = [];
    zones.forEach(function (z) {
      const circle = L.circle([z.latitude, z.longitude], {
        radius: z.radius_meters,
        color: '#e82127',
        fillColor: '#e82127',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4'
      }).bindTooltip(escapeHtml(z.name || 'Zone protégée'), { permanent: false, direction: 'top' });
      circle.addTo(map);
      safeZoneLayers.push(circle);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const streamUrl = (token === 'admin') ? '/api/admin/stream' : ('/api/stream/' + encodeURIComponent(token));
    const eventSource = new EventSource(streamUrl);

    eventSource.onmessage = function (e) {
      try {
        let data = JSON.parse(e.data);
        if (token === 'admin' && data.status) {
          if (data.zones) {
            updateSafeZones(data.zones);
          }
          const st = data.status;
          data = {
            state: st.state,
            latitude: st.latitude,
            longitude: st.longitude,
            heading: st.heading,
            speed: st.speed,
            battery_level: st.battery_level,
            in_safe_zone: false,
            has_active_route: st.has_active_route,
            destination: (st.route && st.route.destination) || '',
            distance_left_km: (st.route && st.route.distance_to_arrival_km) || 0,
            minutes_left: (st.route && Math.round(st.route.minutes_to_arrival)) || 0,
            progress_pct: (st.route && st.route.initial_distance_km > 0) ? Math.min(100, Math.max(0, Math.round(((st.route.initial_distance_km - st.route.distance_to_arrival_km) / st.route.initial_distance_km) * 100))) : 0,
            route_coordinates: (st.route && st.route.coordinates) || [],
            traveled_coordinates: st.traveled_coordinates || []
          };
        }
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
      fullRouteCoords = [];
      lastRouteIdx = 0;
      if (elRecenterBar) elRecenterBar.classList.remove('visible');
      updateStatusChip(I18n.t('private_zone'), 'm3-chip-warning');
    } else {
      if (elSafeZoneAlert) elSafeZoneAlert.style.display = 'none';
      if (data.latitude != null && data.longitude != null) {
        const serverCoords = data.traveled_coordinates || [];
        if (serverCoords.length > 1) {
          confirmedTraveledCoords = serverCoords.slice(0, -1);
        } else if (serverCoords.length === 1) {
          confirmedTraveledCoords = serverCoords;
        } else {
          confirmedTraveledCoords = [];
        }

        // Smoothly interpolate vehicle position, heading, and map pan at 60fps
        animateVehicleTo(data.latitude, data.longitude, data.heading || 0);

        // Ensure traveledLine is created and displayed ending at car's current position
        const pts = confirmedTraveledCoords.concat([currentLatLng || [data.latitude, data.longitude]]);
        if (pts.length > 0) {
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

      // Draw Route Polyline with 60fps slicing
      if (data.route_coordinates && data.route_coordinates.length > 1) {
        const isNew = fullRouteCoords.length !== data.route_coordinates.length ||
          (fullRouteCoords.length > 0 && (
            fullRouteCoords[0][0] !== data.route_coordinates[0][0] ||
            fullRouteCoords[fullRouteCoords.length - 1][0] !== data.route_coordinates[data.route_coordinates.length - 1][0]
          ));
        if (isNew) {
          fullRouteCoords = data.route_coordinates;
          lastRouteIdx = 0;
        }

        const remaining = getRemainingRoute(currentLatLng || fullRouteCoords[0], fullRouteCoords);
        if (!routeLine) {
          routeLine = L.polyline(remaining, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.8,
            lineJoin: 'round',
            lineCap: 'round'
          }).addTo(map);
        } else {
          if (!map.hasLayer(routeLine)) {
            routeLine.addTo(map);
          }
          routeLine.setLatLngs(remaining);
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
      fullRouteCoords = [];
      lastRouteIdx = 0;
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

    if (window.TESLAMAP_IS_DEFINITELY_CLOSED) {
      if (elExpiredCard) elExpiredCard.style.display = 'none';
      if (elClosedCard) elClosedCard.style.display = 'block';
      if (carMarker && map && map.hasLayer(carMarker)) map.removeLayer(carMarker);
      if (routeLine && map && map.hasLayer(routeLine)) map.removeLayer(routeLine);
      if (traveledLine && map && map.hasLayer(traveledLine)) map.removeLayer(traveledLine);
      if (destMarker && map && map.hasLayer(destMarker)) map.removeLayer(destMarker);
      return;
    }

    if (elClosedCard) elClosedCard.style.display = 'none';
    if (elExpiredCard) elExpiredCard.style.display = 'block';

    // Render trip summary stats if available
    const telem = lastTelemetry || window.TESLAMAP_INITIAL_TELEMETRY;
    if (telem && telem.trip_summary && elTripSummarySection) {
      const summary = telem.trip_summary;
      elTripSummarySection.style.display = 'block';

      if (elSummaryDistance) {
        elSummaryDistance.textContent = (summary.total_distance_km !== undefined ? summary.total_distance_km.toFixed(1) : '0.0') + ' ' + I18n.t('km_unit');
      }

      if (elSummaryDuration) {
        const mins = summary.total_duration_minutes || 0;
        if (mins >= 60) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          elSummaryDuration.textContent = `${h}h ${m < 10 ? '0' : ''}${m}m`;
        } else {
          elSummaryDuration.textContent = `${mins} ${I18n.t('min_unit')}`;
        }
      }

      if (elSummarySpeedBox && elSummarySpeed) {
        if (summary.avg_speed_kmh !== undefined && summary.avg_speed_kmh !== null) {
          elSummarySpeedBox.style.display = 'block';
          elSummarySpeed.textContent = Math.round(summary.avg_speed_kmh) + ' km/h';
        } else {
          elSummarySpeedBox.style.display = 'none';
        }
      }

      if (elSummaryArrivalBox && elSummaryArrival) {
        if (summary.completed_at) {
          elSummaryArrivalBox.style.display = 'block';
          elSummaryArrival.textContent = summary.completed_at;
        } else {
          elSummaryArrivalBox.style.display = 'none';
        }
      }
    }

    // Keep carMarker, traveledLine, routeLine and destMarker intact on the map!
    // Center map view on vehicle's last known position
    if (currentLatLng && map) {
      map.setView(currentLatLng, Math.max(map.getZoom(), 15), { animate: false });
    }
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
    if (window.TESLAMAP_IS_EXPIRED || window.TESLAMAP_IS_DEFINITELY_CLOSED) {
      showExpiredScreen();
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

    initMap();

    if (window.TESLAMAP_IS_DEFINITELY_CLOSED) {
      showExpiredScreen();
      return;
    }

    // Render initial telemetry snapshot if provided by server (for both live and expired links)
    if (window.TESLAMAP_INITIAL_TELEMETRY) {
      handleTelemetryUpdate(window.TESLAMAP_INITIAL_TELEMETRY);
    }

    if (window.TESLAMAP_IS_EXPIRED) {
      showExpiredScreen();
      return;
    }

    if (window.TESLAMAP_IS_PENDING) {
      if (elTelemetrySheet) elTelemetrySheet.style.display = 'none';
      if (elRecenterBar) elRecenterBar.classList.remove('visible');
      if (elPendingCard) elPendingCard.style.display = 'block';
    }

    connectSSE();
  });
})();
