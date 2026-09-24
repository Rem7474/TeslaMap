// TeslaMap - Admin Dedicated Live Map Client
(function () {
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
  let safeZoneLayers = [];

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

  // DOM Elements
  const elBadgeSpeed = document.getElementById('badge-speed');
  const elBadgeBattery = document.getElementById('badge-battery');
  const elBadgeDest = document.getElementById('badge-dest');
  const elBadgeDestSep = document.getElementById('badge-dest-sep');
  const elRecenterBar = document.getElementById('recenter-bar-container');
  const elRecenterBtn = document.getElementById('recenter-btn');
  const elBtnFullscreen = document.getElementById('btn-fullscreen-toggle');

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

  function setAutoFollow(enabled) {
    autoFollow = enabled;
    if (elRecenterBar) {
      if (autoFollow || !currentLatLng) {
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
      if (!carIconElement) carIconElement = document.getElementById('admin-car-svg');
      if (carIconElement) carIconElement.style.transform = `rotate(${targetH}deg)`;

      isProgrammaticMove = true;
      map.setView(currentLatLng, 15, { animate: false });
      setTimeout(() => { isProgrammaticMove = false; }, 150);

      if (routeLine && fullRouteCoords && fullRouteCoords.length > 1) {
        routeLine.setLatLngs(getRemainingRoute(currentLatLng, fullRouteCoords));
      }
      return;
    }

    if (lastServerUpdateTime > 0) {
      const delta = now - lastServerUpdateTime;
      if (delta >= 500 && delta <= 6000) {
        animDuration = delta;
      } else {
        animDuration = 1500;
      }
    }
    lastServerUpdateTime = now;

    // Check for large teleport (> 50 km)
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
        setTimeout(() => { isProgrammaticMove = false; }, 150);
      }
      return;
    }

    animStartPos = currentLatLng ? [currentLatLng[0], currentLatLng[1]] : [targetLat, targetLon];
    animTargetPos = targetPos;
    animStartTime = now;

    let diff = ((targetH - (animStartHeading % 360) + 540) % 360) - 180;
    animTargetHeading = animStartHeading + diff;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
    }

    function step(timestamp) {
      const elapsed = timestamp - animStartTime;
      const progress = Math.min(elapsed / animDuration, 1.0);

      const lat = animStartPos[0] + (animTargetPos[0] - animStartPos[0]) * progress;
      const lon = animStartPos[1] + (animTargetPos[1] - animStartPos[1]) * progress;
      const heading = animStartHeading + (animTargetHeading - animStartHeading) * progress;

      currentLatLng = [lat, lon];
      carMarker.setLatLng(currentLatLng);

      if (!carIconElement) carIconElement = document.getElementById('admin-car-svg');
      if (carIconElement) {
        carIconElement.style.transform = `rotate(${heading}deg)`;
      }

      if (autoFollow && map) {
        isProgrammaticMove = true;
        map.panTo(currentLatLng, { animate: false });
      }

      if (traveledLine && (confirmedTraveledCoords.length > 0 || currentLatLng)) {
        traveledLine.setLatLngs(confirmedTraveledCoords.concat([currentLatLng]));
      }

      if (routeLine && fullRouteCoords && fullRouteCoords.length > 1) {
        routeLine.setLatLngs(getRemainingRoute(currentLatLng, fullRouteCoords));
      }

      if (progress < 1.0) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animStartHeading = animTargetHeading % 360;
        isProgrammaticMove = false;
      }
    }

    animFrameId = requestAnimationFrame(step);
  }

  function updateSafeZones(zones) {
    if (!map || !zones) return;
    safeZoneLayers.forEach(l => map.removeLayer(l));
    safeZoneLayers = [];

    zones.forEach(z => {
      const circle = L.circle([z.latitude, z.longitude], {
        radius: z.radius_meters,
        color: '#e82127',
        fillColor: '#e82127',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4'
      }).bindTooltip(z.name || 'Zone protégée', { permanent: false, direction: 'top' });
      circle.addTo(map);
      safeZoneLayers.push(circle);
    });
  }

  function initMap() {
    const tileUrl = window.TESLAMAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = window.TESLAMAP_ATTRIBUTION || '';
    const maxZoom = window.TESLAMAP_MAX_ZOOM || 19;

    map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
      scrollWheelZoom: true,
      dragging: true,
    }).setView([48.8584, 2.2945], 13);

    L.tileLayer(tileUrl, {
      maxZoom: maxZoom,
      subdomains: 'abcd',
      attribution: attribution
    }).addTo(map);

    // Gray traveled path
    traveledLine = L.polyline([], {
      color: '#6b7280',
      weight: 4.5,
      opacity: 0.75,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Active remaining route
    routeLine = L.polyline([], {
      color: '#3b82f6',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Car Icon
    const carIcon = L.divIcon({
      className: 'car-marker-container',
      html: `
        <div id="admin-car-svg" class="car-marker-icon" style="transition: transform 0.08s linear; display:flex; align-items:center; justify-content:center;">
          <img src="/static/icons/car.svg" style="width:40px;height:40px;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.8));" alt="Tesla" />
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    carMarker = L.marker([48.8584, 2.2945], { icon: carIcon, zIndexOffset: 1000 });

    // Destination Pin
    const destIcon = L.divIcon({
      className: 'dest-marker-container',
      html: `
        <div class="dest-halo"></div>
        <div class="dest-pin">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5">
            <path d="M12 2v20M12 2l8 5-8 5"></path>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    destMarker = L.marker([0, 0], { icon: destIcon, zIndexOffset: 900 });

    // Drag / zoom interaction breaks auto-follow
    map.on('dragstart', () => {
      setAutoFollow(false);
    });

    map.on('zoomstart', () => {
      if (!isProgrammaticMove) {
        setAutoFollow(false);
      }
    });

    if (elRecenterBtn) {
      elRecenterBtn.addEventListener('click', () => {
        setAutoFollow(true);
        if (currentLatLng && map) {
          isProgrammaticMove = true;
          map.setView(currentLatLng, Math.max(map.getZoom(), 15), { animate: true });
          setTimeout(() => { isProgrammaticMove = false; }, 300);
        }
      });
    }

    if (elBtnFullscreen) {
      elBtnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {
            window.open('/admin/map', '_blank');
          });
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Connect SSE
    connectAdminStream();
  }

  function connectAdminStream() {
    if (!window.EventSource) return;

    const source = new EventSource('/api/admin/stream');

    source.onmessage = function (event) {
      try {
        const payload = JSON.parse(event.data);
        if (!payload) return;

        const status = payload.status;
        if (!status) return;

        // Telemetry badge
        if (elBadgeSpeed) {
          const spd = Math.round(status.speed || 0);
          elBadgeSpeed.innerHTML = `<strong class="stat-strong">${spd}</strong> km/h`;
        }
        if (elBadgeBattery) {
          const bat = Math.round(status.battery_level || 0);
          elBadgeBattery.innerHTML = `<strong class="stat-strong">${bat}</strong>%`;
        }

        // Active Route & Destination Pin
        if (status.has_active_route && status.route) {
          if (elBadgeDest && elBadgeDestSep) {
            elBadgeDest.textContent = status.route.destination || 'Destination';
            elBadgeDest.style.display = 'inline-block';
            elBadgeDestSep.style.display = 'inline-block';
          }

          if (status.route.latitude && status.route.longitude) {
            destMarker.setLatLng([status.route.latitude, status.route.longitude]);
            if (!map.hasLayer(destMarker)) {
              destMarker.addTo(map);
            }
          }

          if (status.route.coordinates && status.route.coordinates.length > 0) {
            fullRouteCoords = status.route.coordinates;
          }
        } else {
          if (elBadgeDest && elBadgeDestSep) {
            elBadgeDest.style.display = 'none';
            elBadgeDestSep.style.display = 'none';
          }
          if (map.hasLayer(destMarker)) {
            map.removeLayer(destMarker);
          }
          if (routeLine) {
            routeLine.setLatLngs([]);
          }
          fullRouteCoords = [];
        }

        // Traveled trail (gray)
        if (status.traveled_coordinates && status.traveled_coordinates.length > 0) {
          confirmedTraveledCoords = status.traveled_coordinates;
        }

        // Safe Zones
        if (payload.zones) {
          updateSafeZones(payload.zones);
        }

        // Animate vehicle position
        const lat = status.latitude;
        const lon = status.longitude;
        const heading = status.heading || 0;
        if (lat && lon && (lat !== 0 || lon !== 0)) {
          animateVehicleTo(lat, lon, heading);
        }
      } catch (err) {
        console.error("Admin map stream error:", err);
      }
    };

    source.onerror = function () {
      // EventSource will auto-reconnect
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);
  });
})();
