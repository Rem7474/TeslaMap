// TeslaMap - Admin Dashboard Client
(function () {
  let selectedDuration = 240; // 4 hours in minutes default

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
      const data = await res.json();
      if (elCarState) elCarState.textContent = data.state || 'Inconnu';
      if (elCarSpeed) elCarSpeed.textContent = Math.round(data.speed || 0) + ' km/h';
      if (elCarBattery) elCarBattery.textContent = Math.round(data.battery_level || 0) + '%';
      if (elCarDest) {
        if (data.has_active_route && data.route) {
          elCarDest.textContent = data.route.destination + ' (' + Math.round(data.route.distance_to_arrival_km) + ' km)';
        } else {
          elCarDest.textContent = 'Aucune (Navigation libre)';
        }
      }
    } catch (e) {
      console.warn("Status fetch failed", e);
    }
  }

  async function loadLinks() {
    try {
      const res = await fetch('/api/admin/links');
      if (!res.ok) return;
      const links = await res.json();
      renderLinks(links || []);
    } catch (e) {
      console.error("Links fetch failed", e);
    }
  }

  function renderLinks(links) {
    if (!elLinksContainer) return;
    if (links.length === 0) {
      elLinksContainer.innerHTML = '<div style="color:var(--md-sys-color-on-surface-variant);font-size:14px;padding:12px 0;">Aucun lien partagé pour le moment.</div>';
      return;
    }

    const now = new Date();
    elLinksContainer.innerHTML = links.map(link => {
      const isPending = link.starts_at && new Date(link.starts_at) > now;
      const isExpired = !link.is_active || (link.expires_at && new Date(link.expires_at) < now);
      const fullUrl = window.location.origin + '/share/' + link.token;
      
      let expText = "Illimité";
      if (link.starts_at && link.expires_at) {
        const startDate = new Date(link.starts_at);
        const expDate = new Date(link.expires_at);
        expText = "Du " + startDate.toLocaleDateString() + " " + startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) +
                  " au " + expDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      } else if (link.expires_at) {
        const expDate = new Date(link.expires_at);
        expText = "Expire le " + expDate.toLocaleDateString() + " à " + expDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }
      if (link.expire_on_arrival) {
        expText += " (ou à l'arrivée)";
      }

      let statusBadge = '<span class="m3-chip m3-chip-success">Actif</span>';
      if (isPending) {
        statusBadge = '<span class="m3-chip m3-chip-warning">Programmé</span>';
      } else if (isExpired) {
        statusBadge = '<span class="m3-chip m3-chip-error">Expiré / Inactif</span>';
      }

      return `
        <div class="link-card ${isExpired ? 'expired' : ''}">
          <div class="link-card-main">
            <div class="link-card-title">
              <span>${escapeHtml(link.label || 'Lien de partage')}</span>
              ${statusBadge}
            </div>
            <div class="link-card-meta">
              <span>⏱ ${expText}</span>
              <span>👁 ${link.view_count || 0} vues</span>
              <span style="font-family:monospace;font-size:12px;opacity:0.8;">${link.token}</span>
            </div>
          </div>
          <div class="link-card-actions">
            <button class="m3-button m3-button-filled" onclick="TeslaAdmin.copyLink('${fullUrl}')">
              📋 Copier l'URL
            </button>
            ${!isExpired ? `
              <button class="m3-button m3-button-outlined" onclick="TeslaAdmin.revokeLink(${link.id})">
                Révoquer
              </button>
            ` : ''}
            <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteLink(${link.id})">
              Supprimer
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
      const zones = await res.json();
      renderZones(zones || []);
    } catch (e) {
      console.error("Zones fetch failed", e);
    }
  }

  function renderZones(zones) {
    if (!elZonesContainer) return;
    if (zones.length === 0) {
      elZonesContainer.innerHTML = '<div style="color:var(--md-sys-color-on-surface-variant);font-size:14px;padding:8px 0;">Aucune zone protégée définie.</div>';
      return;
    }

    elZonesContainer.innerHTML = zones.map(z => `
      <div class="zone-chip">
        <div>
          <strong>${escapeHtml(z.name)}</strong>
          <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-left:8px;">
            (Rayon: ${z.radius_meters}m • GPS: ${z.latitude.toFixed(4)}, ${z.longitude.toFixed(4)})
          </span>
        </div>
        <button class="m3-button m3-button-text m3-button-danger" onclick="TeslaAdmin.deleteZone(${z.id})">
          Supprimer
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
        label: label || 'Partage de trajet',
        expire_on_arrival: expireOnArrival,
        show_speed: showSpeed,
        show_battery: showBattery
      };

      if (currentMode === 'duration') {
        payload.duration_minutes = selectedDuration;
      } else {
        if (!inputStartsAt.value || !inputExpiresAt.value) {
          alert("Veuillez sélectionner l'heure de début et l'heure de fin du créneau.");
          return;
        }
        if (new Date(inputExpiresAt.value) <= new Date(inputStartsAt.value)) {
          alert("L'heure de fin doit être postérieure à l'heure de début.");
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
          showToast('Lien de partage créé !');
          loadLinks();
        } else {
          alert("Erreur lors de la création du lien");
        }
      } catch (e) {
        console.error("Create link error", e);
      }
    });
  }

  // Public admin namespace
  window.TeslaAdmin = {
    copyLink: function (url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('URL copiée dans le presse-papiers !');
      });
    },
    revokeLink: async function (id) {
      if (!confirm("Voulez-vous révoquer ce lien immédiatement ?")) return;
      await fetch('/api/admin/links/' + id + '/revoke', { method: 'POST' });
      showToast('Lien révoqué');
      loadLinks();
    },
    deleteLink: async function (id) {
      if (!confirm("Supprimer définitivement ce lien ?")) return;
      await fetch('/api/admin/links/' + id, { method: 'DELETE' });
      showToast('Lien supprimé');
      loadLinks();
    },
    deleteZone: async function (id) {
      if (!confirm("Supprimer cette zone protégée ?")) return;
      await fetch('/api/admin/zones/' + id, { method: 'DELETE' });
      showToast('Zone supprimée');
      loadZones();
    },
    createZone: async function () {
      const name = prompt("Nom de la zone (ex: Domicile, Travail) :");
      if (!name) return;
      const lat = parseFloat(prompt("Latitude (ex: 48.8584) :"));
      const lon = parseFloat(prompt("Longitude (ex: 2.2945) :"));
      const radius = parseFloat(prompt("Rayon en mètres (ex: 400) :", "400"));
      if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
        alert("Valeurs GPS ou rayon invalides");
        return;
      }
      await fetch('/api/admin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude: lat, longitude: lon, radius_meters: radius })
      });
      showToast('Zone protégée enregistrée');
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
