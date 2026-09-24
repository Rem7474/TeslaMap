// TeslaMap - Admin Dashboard Client with Material 3 Dialogs and i18n
(function () {
  let selectedDuration = 240; // 4 hours in minutes default
  let cachedLinks = [];
  let cachedZones = [];
  let lastStatus = null;

  // New Link Modal DOM
  const elModal = document.getElementById('new-link-modal');
  const elOpenModalBtn = document.getElementById('btn-open-create-modal');
  const elCancelModalBtn = document.getElementById('btn-cancel-create');
  const elSubmitModalBtn = document.getElementById('btn-submit-create');

  // Safe Zone Modal DOM
  const elZoneModal = document.getElementById('new-zone-modal');
  const elOpenZoneModalBtn = document.getElementById('btn-open-create-zone-modal');
  const elCancelZoneModalBtn = document.getElementById('btn-cancel-create-zone');
  const elSubmitZoneModalBtn = document.getElementById('btn-submit-create-zone');
  const elUseCurrentPosBtn = document.getElementById('btn-use-current-pos');
  const inputZoneName = document.getElementById('input-zone-name');
  const inputZoneLat = document.getElementById('input-zone-lat');
  const inputZoneLon = document.getElementById('input-zone-lon');
  const inputZoneRadius = document.getElementById('input-zone-radius');
  let selectedZoneRadius = 400;

  // Universal Confirmation Dialog DOM
  const elConfirmModal = document.getElementById('confirm-dialog-modal');
  const elConfirmTitle = document.getElementById('confirm-dialog-title');
  const elConfirmDesc = document.getElementById('confirm-dialog-desc');
  const elConfirmCancelBtn = document.getElementById('btn-confirm-cancel');
  const elConfirmActionBtn = document.getElementById('btn-confirm-action');
  let confirmResolver = null;

  // Containers
  const elLinksContainer = document.getElementById('links-container');
  const elZonesContainer = document.getElementById('zones-container');
  const elToast = document.getElementById('toast');
  const elTmActiveChip = document.getElementById('teslamate-active-chip');

  // Telemetry DOM elements
  const elCarState = document.getElementById('stat-state');
  const elCarSpeed = document.getElementById('stat-speed');
  const elCarBattery = document.getElementById('stat-battery');
  const elCarDest = document.getElementById('stat-dest');

  function showToast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.classList.add('show');
    setTimeout(() => elToast.classList.remove('show'), 3200);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("navigator.clipboard failed, using fallback:", e);
      }
    }
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      textArea.remove();
      return success;
    } catch (e) {
      console.error("Clipboard copy failed:", e);
      return false;
    }
  }

  // Material 3 Confirmation Dialog Promise
  function confirmM3({ title, message, confirmText, isDanger = true }) {
    return new Promise((resolve) => {
      confirmResolver = resolve;
      if (elConfirmTitle) elConfirmTitle.textContent = title || I18n.t('confirm_btn');
      if (elConfirmDesc) elConfirmDesc.textContent = message || '';
      if (elConfirmActionBtn) {
        elConfirmActionBtn.textContent = confirmText || I18n.t('confirm_btn');
        elConfirmActionBtn.className = isDanger ? 'm3-button m3-button-danger-filled' : 'm3-button m3-button-tesla';
      }
      if (elConfirmModal) elConfirmModal.classList.add('open');
    });
  }

  if (elConfirmCancelBtn) {
    elConfirmCancelBtn.addEventListener('click', () => {
      if (elConfirmModal) elConfirmModal.classList.remove('open');
      if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
    });
  }
  if (elConfirmActionBtn) {
    elConfirmActionBtn.addEventListener('click', () => {
      if (elConfirmModal) elConfirmModal.classList.remove('open');
      if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
    });
  }
  if (elConfirmModal) {
    elConfirmModal.addEventListener('click', (e) => {
      if (e.target === elConfirmModal) {
        elConfirmModal.classList.remove('open');
        if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
      }
    });
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/admin/status');
      if (!res.ok) return;
      lastStatus = await res.json();
      renderStatus(lastStatus);
    } catch (e) {
      console.warn("Status fetch failed", e);
    }
  }

  function renderStatus(data) {
    if (!data) return;
    if (elCarState) {
      const stateMap = {
        driving: I18n.t('driving'),
        parked: I18n.t('parked'),
        charging: I18n.t('charging')
      };
      elCarState.textContent = stateMap[data.state] || data.state || '--';
    }
    if (elCarSpeed) elCarSpeed.textContent = Math.round(data.speed || 0) + ' km/h';
    if (elCarBattery) elCarBattery.textContent = Math.round(data.battery_level || 0) + '%';
    if (elCarDest) {
      if (data.has_active_route && data.route) {
        elCarDest.textContent = data.route.destination + ' (' + Math.round(data.route.distance_to_arrival_km) + ' ' + I18n.t('km_unit') + ')';
      } else {
        elCarDest.textContent = I18n.t('none_free_nav');
      }
    }

    // TeslaMate geofence active chip
    if (elTmActiveChip) {
      if (data.teslamate_geofence) {
        elTmActiveChip.style.display = 'inline-block';
        elTmActiveChip.innerHTML = `<span class="m3-chip m3-chip-success" style="font-size:12px;margin-top:6px;">${I18n.t('teslamate_in_geofence', { zone: escapeHtml(data.teslamate_geofence) })}</span>`;
      } else {
        elTmActiveChip.style.display = 'none';
        elTmActiveChip.innerHTML = '';
      }
    }
  }

  async function loadLinks() {
    try {
      const res = await fetch('/api/admin/links');
      if (!res.ok) return;
      cachedLinks = await res.json() || [];
      renderLinks(cachedLinks);
    } catch (e) {
      console.error("Links fetch failed", e);
    }
  }

  function renderLinks(links) {
    if (!elLinksContainer) return;
    if (!links || links.length === 0) {
      elLinksContainer.innerHTML = `<div style="color:var(--md-sys-color-on-surface-variant);font-size:14px;padding:12px 0;">${I18n.t('no_links')}</div>`;
      return;
    }

    const now = new Date();
    elLinksContainer.innerHTML = links.map(link => {
      const isPending = link.starts_at && new Date(link.starts_at) > now;
      const isExpired = !link.is_active || (link.expires_at && new Date(link.expires_at) < now);
      const fullUrl = window.location.origin + '/share/' + link.token;
      
      let expText = I18n.t('unlimited');
      if (link.starts_at && link.expires_at) {
        const startDate = new Date(link.starts_at);
        const expDate = new Date(link.expires_at);
        expText = I18n.t('from_date') + " " + startDate.toLocaleDateString() + " " + startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) +
                  " " + I18n.t('to_date') + " " + expDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      } else if (link.expires_at) {
        const expDate = new Date(link.expires_at);
        expText = I18n.t('expires_on') + " " + expDate.toLocaleDateString() + " " + I18n.t('at_hour') + " " + expDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }
      if (link.expire_on_arrival) {
        expText += I18n.t('or_arrival');
      }

      let statusBadge = `<span class="m3-chip m3-chip-success">${I18n.t('active')}</span>`;
      if (isPending) {
        statusBadge = `<span class="m3-chip m3-chip-warning">${I18n.t('scheduled')}</span>`;
      } else if (isExpired) {
        statusBadge = `<span class="m3-chip m3-chip-error">${I18n.t('expired')}</span>`;
      }

      return `
        <div class="link-card ${isExpired ? 'expired' : ''}">
          <div class="link-card-main">
            <div class="link-card-title">
              <span>${escapeHtml(link.label || 'Trip Share')}</span>
              ${statusBadge}
            </div>
            <div class="link-card-meta">
              <span><span class="material-symbols-outlined" style="font-size: 16px;">schedule</span> ${expText}</span>
              <span><span class="material-symbols-outlined" style="font-size: 16px;">visibility</span> ${link.view_count || 0} ${I18n.t('views')}</span>
              ${link.show_speed ? `<span><span class="material-symbols-outlined" style="font-size: 16px;">speed</span> ${I18n.t('speed')}</span>` : ''}
              ${link.show_battery ? `<span><span class="material-symbols-outlined" style="font-size: 16px;">battery_charging_full</span> ${I18n.t('battery')}</span>` : ''}
            </div>
          </div>
          <div class="link-card-actions">
            ${!isExpired ? `
              <button class="m3-button m3-button-filled" onclick="TeslaAdmin.copyLink('${fullUrl}')">
                <span class="material-symbols-outlined" style="font-size: 18px;">content_copy</span>
                <span>${I18n.t('copy_url')}</span>
              </button>
              <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.revokeLink(${link.id})">
                <span class="material-symbols-outlined" style="font-size: 18px;">block</span>
                <span>${I18n.t('revoke')}</span>
              </button>
            ` : `
              <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteLink(${link.id})">
                <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                <span>${I18n.t('delete')}</span>
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadZones() {
    try {
      const res = await fetch('/api/admin/zones');
      if (!res.ok) return;
      cachedZones = await res.json() || [];
      renderZones(cachedZones);
    } catch (e) {
      console.error("Zones fetch failed", e);
    }
  }

  function renderZones(zones) {
    if (!elZonesContainer) return;
    if (!zones || zones.length === 0) {
      elZonesContainer.innerHTML = `<div style="color:var(--md-sys-color-on-surface-variant);font-size:14px;padding:8px 0;">${I18n.t('no_zones')}</div>`;
      return;
    }

    elZonesContainer.innerHTML = zones.map(z => `
      <div class="zone-chip">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-outlined" style="font-size:20px;color:var(--md-sys-color-primary);">shield</span>
          <div>
            <strong>${escapeHtml(z.name)}</strong>
            <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-left:8px;">
              (${I18n.t('radius')}: ${z.radius_meters}m • ${I18n.t('gps')}: ${z.latitude.toFixed(4)}, ${z.longitude.toFixed(4)})
            </span>
          </div>
        </div>
        <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteZone(${z.id})">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
          <span>${I18n.t('delete')}</span>
        </button>
      </div>
    `).join('');
    updateAdminMapZones(zones);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // --- Modal: Create Link ---
  let currentMode = 'duration'; // 'duration' | 'slot'
  const tabDuration = document.getElementById('tab-mode-duration');
  const tabSlot = document.getElementById('tab-mode-slot');
  const secDuration = document.getElementById('section-duration');
  const secSlot = document.getElementById('section-slot');
  const inputStartsAt = document.getElementById('input-starts-at');
  const inputExpiresAt = document.getElementById('input-expires-at');

  function setMode(mode) {
    currentMode = mode;
    if (mode === 'duration') {
      tabDuration.className = 'm3-button m3-button-filled';
      tabSlot.className = 'm3-button m3-button-outlined';
      secDuration.style.display = 'block';
      secSlot.style.display = 'none';
    } else {
      tabDuration.className = 'm3-button m3-button-outlined';
      tabSlot.className = 'm3-button m3-button-filled';
      secDuration.style.display = 'none';
      secSlot.style.display = 'block';

      if (!inputStartsAt.value) {
        const d1 = new Date();
        d1.setMinutes(Math.ceil(d1.getMinutes() / 15) * 15, 0, 0);
        inputStartsAt.value = formatDateTimeLocal(d1);

        const d2 = new Date(d1.getTime() + 2.5 * 60 * 60 * 1000); // +2h30
        inputExpiresAt.value = formatDateTimeLocal(d2);
      }
    }
  }

  function formatDateTimeLocal(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  if (tabDuration) tabDuration.addEventListener('click', () => setMode('duration'));
  if (tabSlot) tabSlot.addEventListener('click', () => setMode('slot'));

  if (elOpenModalBtn) {
    elOpenModalBtn.addEventListener('click', () => {
      setMode('duration');
      elModal.classList.add('open');
    });
  }
  if (elCancelModalBtn) {
    elCancelModalBtn.addEventListener('click', () => elModal.classList.remove('open'));
  }
  if (elModal) {
    elModal.addEventListener('click', (e) => {
      if (e.target === elModal) elModal.classList.remove('open');
    });
  }

  // Link preset buttons
  document.querySelectorAll('#section-duration .preset-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#section-duration .preset-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedDuration = parseInt(this.getAttribute('data-mins'), 10);
    });
  });

  if (elSubmitModalBtn) {
    elSubmitModalBtn.addEventListener('click', async () => {
      const label = document.getElementById('input-label').value.trim();
      const expireOnArrival = document.getElementById('input-expire-arrival').checked;
      const showSpeed = document.getElementById('input-show-speed').checked;
      const showBattery = document.getElementById('input-show-battery').checked;

      const payload = {
        label: label || 'Trip Share',
        expire_on_arrival: expireOnArrival,
        show_speed: showSpeed,
        show_battery: showBattery
      };

      if (currentMode === 'duration') {
        payload.duration_minutes = selectedDuration;
      } else {
        if (!inputStartsAt.value || !inputExpiresAt.value) {
          showToast(I18n.getLang() === 'fr' ? "Veuillez sélectionner l'heure de début et de fin du créneau." : "Please select start and end time for the slot.");
          return;
        }
        if (new Date(inputExpiresAt.value) <= new Date(inputStartsAt.value)) {
          showToast(I18n.getLang() === 'fr' ? "L'heure de fin doit être postérieure à l'heure de début." : "End time must be after start time.");
          return;
        }
        payload.starts_at = inputStartsAt.value;
        payload.expires_at = inputExpiresAt.value;
      }

      try {
        const res = await fetch('/api/admin/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const newLink = await res.json();
          elModal.classList.remove('open');
          if (newLink && newLink.token) {
            const fullUrl = window.location.origin + '/share/' + newLink.token;
            await copyToClipboard(fullUrl);
          }
          showToast(I18n.t('link_created'));
          loadLinks();
        } else {
          showToast(I18n.getLang() === 'fr' ? "Erreur lors de la création du lien." : "Error creating share link.");
        }
      } catch (e) {
        console.error("Create link error", e);
      }
    });
  }

  // --- Modal: Create Safe Zone ---
  document.querySelectorAll('.zone-radius-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.zone-radius-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedZoneRadius = parseInt(this.getAttribute('data-radius'), 10);
      if (inputZoneRadius) inputZoneRadius.value = selectedZoneRadius;
    });
  });

  if (inputZoneRadius) {
    inputZoneRadius.addEventListener('input', function () {
      selectedZoneRadius = parseInt(this.value, 10) || 400;
      document.querySelectorAll('.zone-radius-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-radius'), 10) === selectedZoneRadius);
      });
    });
  }

  if (elOpenZoneModalBtn) {
    elOpenZoneModalBtn.addEventListener('click', () => {
      if (inputZoneName) inputZoneName.value = '';
      if (inputZoneLat) {
        inputZoneLat.value = (lastStatus && lastStatus.latitude) ? lastStatus.latitude.toFixed(6) : '';
      }
      if (inputZoneLon) {
        inputZoneLon.value = (lastStatus && lastStatus.longitude) ? lastStatus.longitude.toFixed(6) : '';
      }
      if (inputZoneRadius) inputZoneRadius.value = '400';
      selectedZoneRadius = 400;
      document.querySelectorAll('.zone-radius-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-radius') === '400');
      });
      if (elZoneModal) elZoneModal.classList.add('open');
    });
  }

  if (elCancelZoneModalBtn) {
    elCancelZoneModalBtn.addEventListener('click', () => {
      if (elZoneModal) elZoneModal.classList.remove('open');
    });
  }

  if (elZoneModal) {
    elZoneModal.addEventListener('click', (e) => {
      if (e.target === elZoneModal) elZoneModal.classList.remove('open');
    });
  }

  if (elUseCurrentPosBtn) {
    elUseCurrentPosBtn.addEventListener('click', () => {
      if (lastStatus && lastStatus.latitude && lastStatus.longitude) {
        if (inputZoneLat) inputZoneLat.value = lastStatus.latitude.toFixed(6);
        if (inputZoneLon) inputZoneLon.value = lastStatus.longitude.toFixed(6);
        showToast(I18n.t('pos_fetched'));
      } else {
        showToast(I18n.t('no_car_pos'));
      }
    });
  }

  if (elSubmitZoneModalBtn) {
    elSubmitZoneModalBtn.addEventListener('click', async () => {
      const name = inputZoneName ? inputZoneName.value.trim() : '';
      const lat = inputZoneLat ? parseFloat(inputZoneLat.value) : NaN;
      const lon = inputZoneLon ? parseFloat(inputZoneLon.value) : NaN;
      const radius = inputZoneRadius ? (parseFloat(inputZoneRadius.value) || selectedZoneRadius) : selectedZoneRadius;

      if (!name || isNaN(lat) || isNaN(lon)) {
        showToast(I18n.t('err_zone_fields'));
        return;
      }
      if (isNaN(radius) || radius <= 0) {
        showToast(I18n.t('err_zone_gps'));
        return;
      }

      try {
        const res = await fetch('/api/admin/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, latitude: lat, longitude: lon, radius_meters: radius })
        });
        if (res.ok) {
          if (elZoneModal) elZoneModal.classList.remove('open');
          showToast(I18n.t('zone_saved'));
          loadZones();
        } else {
          showToast(I18n.t('err_zone_gps'));
        }
      } catch (e) {
        console.error("Save zone error", e);
      }
    });
  }

  // Re-render when language changes
  document.addEventListener('languageChanged', () => {
    renderLinks(cachedLinks);
    renderZones(cachedZones);
    renderStatus(lastStatus);
  });

  // Public admin namespace
  window.TeslaAdmin = {
    copyLink: async function (url) {
      await copyToClipboard(url);
      showToast(I18n.t('copied_toast'));
    },
    revokeLink: async function (id) {
      const ok = await confirmM3({
        title: I18n.t('confirm_revoke_title'),
        message: I18n.t('confirm_revoke_desc'),
        confirmText: I18n.t('revoke'),
        isDanger: true
      });
      if (!ok) return;
      await fetch('/api/admin/links/' + id + '/revoke', { method: 'POST' });
      showToast(I18n.t('link_revoked'));
      loadLinks();
    },
    deleteLink: async function (id) {
      const ok = await confirmM3({
        title: I18n.t('confirm_delete_link_title'),
        message: I18n.t('confirm_delete_link_desc'),
        confirmText: I18n.t('delete'),
        isDanger: true
      });
      if (!ok) return;
      await fetch('/api/admin/links/' + id, { method: 'DELETE' });
      showToast(I18n.t('link_deleted'));
      loadLinks();
    },
    deleteZone: async function (id) {
      const ok = await confirmM3({
        title: I18n.t('confirm_delete_zone_title'),
        message: I18n.t('confirm_delete_zone_desc'),
        confirmText: I18n.t('delete'),
        isDanger: true
      });
      if (!ok) return;
      await fetch('/api/admin/zones/' + id, { method: 'DELETE' });
      showToast(I18n.t('zone_deleted'));
      loadZones();
    },
    logout: async function () {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }
  };

  let lastLinksJson = "";
  let sseSource = null;

  function connectAdminSSE() {
    if (window.EventSource) {
      if (sseSource) {
        try { sseSource.close(); } catch (_) {}
      }
      sseSource = new EventSource('/api/admin/stream');

      sseSource.onmessage = function (event) {
        try {
          const payload = JSON.parse(event.data);
          if (payload.status) {
            lastStatus = payload.status;
            renderStatus(lastStatus);
          }
          if (payload.links) {
            const jsonStr = JSON.stringify(payload.links);
            if (jsonStr !== lastLinksJson) {
              lastLinksJson = jsonStr;
              cachedLinks = payload.links;
              renderLinks(cachedLinks);
            }
          }
        } catch (e) {
          console.error("Error processing admin SSE stream message", e);
        }
      };

      sseSource.onerror = function () {
        // EventSource will automatically attempt reconnection.
        // Fallback polling will ensure freshness.
      };
    }
  }

  // Periodic expiration checker: updates badge from 'Actif' to 'Expiré' in real time
  // as soon as link.expires_at < now without waiting for server response.
  function checkLinkExpirations() {
    if (!cachedLinks || cachedLinks.length === 0) return;
    const now = new Date();
    let hasStateChange = false;
    for (const link of cachedLinks) {
      if (link.is_active && link.expires_at) {
        const exp = new Date(link.expires_at);
        if (exp <= now) {
          hasStateChange = true;
          break;
        }
      }
      if (link.is_active && link.starts_at) {
        const start = new Date(link.starts_at);
        if (start <= now) {
          // Changed from scheduled to active
          hasStateChange = true;
          break;
        }
      }
    }
    if (hasStateChange) {
      renderLinks(cachedLinks);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    fetchStatus();
    loadLinks();
    loadZones();
    connectAdminSSE();

    // Fallback polling every 8s in case SSE is interrupted or unsupported
    setInterval(() => {
      if (!sseSource || sseSource.readyState !== EventSource.OPEN) {
        fetchStatus();
        loadLinks();
      }
    }, 8000);

    // Live second-by-second expiration check
    setInterval(checkLinkExpirations, 1000);
  });
})();
