// TeslaMap - Admin Dashboard Client with i18n
(function () {
  let selectedDuration = 240; // 4 hours in minutes default
  let cachedLinks = [];
  let cachedZones = [];
  let lastStatus = null;

  const elModal = document.getElementById('new-link-modal');
  const elOpenModalBtn = document.getElementById('btn-open-create-modal');
  const elCancelModalBtn = document.getElementById('btn-cancel-create');
  const elSubmitModalBtn = document.getElementById('btn-submit-create');
  const elLinksContainer = document.getElementById('links-container');
  const elZonesContainer = document.getElementById('zones-container');
  const elToast = document.getElementById('toast');

  // Telemetry DOM elements
  const elCarState = document.getElementById('stat-state');
  const elCarSpeed = document.getElementById('stat-speed');
  const elCarBattery = document.getElementById('stat-battery');
  const elCarDest = document.getElementById('stat-dest');

  function showToast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.classList.add('show');
    setTimeout(() => elToast.classList.remove('show'), 3000);
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
              <span>${escapeHtml(link.label || 'Share link')}</span>
              ${statusBadge}
            </div>
            <div class="link-card-meta">
              <span>⏱ ${expText}</span>
              <span>👁 ${link.view_count || 0} ${I18n.t('views')}</span>
              <span style="font-family:monospace;font-size:12px;opacity:0.8;">${link.token}</span>
            </div>
          </div>
          <div class="link-card-actions">
            <button class="m3-button m3-button-filled" onclick="TeslaAdmin.copyLink('${fullUrl}')">
              ${I18n.t('copy_url')}
            </button>
            ${!isExpired ? `
              <button class="m3-button m3-button-outlined" onclick="TeslaAdmin.revokeLink(${link.id})">
                ${I18n.t('revoke')}
              </button>
            ` : ''}
            <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteLink(${link.id})">
              ${I18n.t('delete')}
            </button>
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
        <div>
          <strong>${escapeHtml(z.name)}</strong>
          <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-left:8px;">
            (${I18n.t('radius')}: ${z.radius_meters}m • ${I18n.t('gps')}: ${z.latitude.toFixed(4)}, ${z.longitude.toFixed(4)})
          </span>
        </div>
        <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteZone(${z.id})">
          ${I18n.t('delete')}
        </button>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // Modal setup
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

      // Pre-fill datetime inputs if empty
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

  // Preset button handling
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
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
          alert(I18n.getLang() === 'fr' ? "Veuillez sélectionner l'heure de début et l'heure de fin du créneau." : "Please select start and end time for the slot.");
          return;
        }
        if (new Date(inputExpiresAt.value) <= new Date(inputStartsAt.value)) {
          alert(I18n.getLang() === 'fr' ? "L'heure de fin doit être postérieure à l'heure de début." : "End time must be after start time.");
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
          elModal.classList.remove('open');
          showToast(I18n.t('link_created'));
          loadLinks();
        } else {
          alert("Error creating link");
        }
      } catch (e) {
        console.error("Create link error", e);
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
    copyLink: function (url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast(I18n.t('copied_toast'));
      });
    },
    revokeLink: async function (id) {
      const confirmMsg = I18n.getLang() === 'fr' ? "Voulez-vous révoquer ce lien immédiatement ?" : "Do you want to revoke this link immediately?";
      if (!confirm(confirmMsg)) return;
      await fetch('/api/admin/links/' + id + '/revoke', { method: 'POST' });
      showToast(I18n.t('link_revoked'));
      loadLinks();
    },
    deleteLink: async function (id) {
      const confirmMsg = I18n.getLang() === 'fr' ? "Supprimer définitivement ce lien ?" : "Permanently delete this link?";
      if (!confirm(confirmMsg)) return;
      await fetch('/api/admin/links/' + id, { method: 'DELETE' });
      showToast(I18n.t('link_deleted'));
      loadLinks();
    },
    deleteZone: async function (id) {
      const confirmMsg = I18n.getLang() === 'fr' ? "Supprimer cette zone protégée ?" : "Delete this protected zone?";
      if (!confirm(confirmMsg)) return;
      await fetch('/api/admin/zones/' + id, { method: 'DELETE' });
      showToast(I18n.t('zone_deleted'));
      loadZones();
    },
    createZone: async function () {
      const isFr = I18n.getLang() === 'fr';
      const name = prompt(isFr ? "Nom de la zone (ex: Domicile, Travail) :" : "Zone name (e.g. Home, Office):");
      if (!name) return;
      const lat = parseFloat(prompt(isFr ? "Latitude (ex: 48.8584) :" : "Latitude (e.g. 48.8584):"));
      const lon = parseFloat(prompt(isFr ? "Longitude (ex: 2.2945) :" : "Longitude (e.g. 2.2945):"));
      const radius = parseFloat(prompt(isFr ? "Rayon en mètres (ex: 400) :" : "Radius in meters (e.g. 400):", "400"));
      if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
        alert(isFr ? "Valeurs GPS ou rayon invalides" : "Invalid GPS or radius values");
        return;
      }
      await fetch('/api/admin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude: lat, longitude: lon, radius_meters: radius })
      });
      showToast(I18n.t('zone_saved'));
      loadZones();
    },
    logout: async function () {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    fetchStatus();
    loadLinks();
    loadZones();
    setInterval(fetchStatus, 4000);
  });
})();
