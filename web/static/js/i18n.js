// TeslaMap - Internationalization (i18n) Engine
(function () {
  const translations = {
    fr: {
      brand_name: "TeslaMap",
      admin: "ADMIN",
      connecting: "Connexion...",
      reconnecting: "Reconnexion...",
      parked: "À l'arrêt",
      driving: "En route",
      charging: "En charge",
      private_zone: "Zone Privée",
      active: "Actif",
      scheduled: "Programmé",
      expired: "Expiré / Inactif",
      logout: "Déconnexion",

      // Live Map
      destination: "Destination",
      loading_route: "Chargement du trajet...",
      free_nav: "Navigation libre",
      private_zone_desc: "Zone Privée : position exacte masquée ({zone}).",
      arrival: "Arrivée",
      remaining: "Restant",
      distance: "Distance",
      battery: "Batterie",
      trip_progress: "Progression du trajet",
      scheduled_title: "Créneau programmé",
      scheduled_desc: "Ce lien de partage s'activera au début du créneau prévu :",
      expired_title: "Lien expiré",
      expired_desc: "Ce lien de partage temporaire n'est plus actif. Le trajet est soit terminé, soit le temps de partage autorisé s'est écoulé.",
      min_unit: "min",
      km_unit: "km",

      // Admin Dashboard
      mqtt_connected: "MQTT Connecté",
      car_status_title: "État du véhicule en direct",
      speed: "Vitesse",
      active_dest: "Destination active",
      none_free_nav: "Aucune (Navigation libre)",
      ephemeral_links: "Liens de partage éphémères",
      new_link_btn: "+ Nouveau lien",
      no_links: "Aucun lien partagé pour le moment.",
      copy_url: "📋 Copier l'URL",
      copied_toast: "URL copiée dans le presse-papiers !",
      link_revoked: "Lien révoqué",
      link_deleted: "Lien supprimé",
      zone_deleted: "Zone supprimée",
      zone_saved: "Zone protégée enregistrée",
      revoke: "Révoquer",
      delete: "Supprimer",
      views: "vues",
      unlimited: "Illimité",
      or_arrival: " (ou à l'arrivée)",
      from_date: "Du",
      to_date: "au",
      expires_on: "Expire le",
      at_hour: "à",
      safe_zones_title: "Zones protégées (Geofencing)",
      add_zone_btn: "+ Ajouter une zone",
      safe_zones_desc: "Lorsque votre véhicule se trouve dans l'une de ces zones, sa position exacte et sa vitesse sont masquées sur tous les liens partagés.",
      no_zones: "Aucune zone protégée définie.",
      radius: "Rayon",
      gps: "GPS",

      // Dialog
      create_link_title: "Créer un lien de partage",
      create_link_subtitle: "Générez une URL temporaire sécurisée pour partager votre trajet en direct.",
      link_label: "Nom ou libellé du lien",
      link_label_placeholder: "Ex: Trajet vacances, Partage famille...",
      mode_duration: "⏱ Durée relative",
      mode_slot: "📅 Créneau horaire",
      duration_validity: "Durée de validité (à partir de maintenant)",
      preset_1h: "1 Heure",
      preset_4h: "4 Heures",
      preset_12h: "12 Heures",
      preset_24h: "24 Heures",
      preset_48h: "48 Heures",
      preset_unlimited: "Sans limite",
      slot_start: "Début du partage (ex: 14h00)",
      slot_end: "Fin du partage (ex: 16h30)",
      opt_revoke_arrival: "Révoquer à l'arrivée",
      opt_revoke_arrival_sub: "Expire dès que la voiture est stationnée",
      opt_show_speed: "Afficher la vitesse réelle",
      opt_show_speed_sub: "Visible en km/h sur la carte",
      opt_show_battery: "Afficher le niveau de batterie",
      opt_show_battery_sub: "Pourcentage restant",
      cancel: "Annuler",
      create: "Créer le lien",
      link_created: "Lien de partage créé !",

      // Login
      login_title: "TeslaMap Admin",
      login_subtitle: "Veuillez saisir votre mot de passe administrateur",
      password: "Mot de passe",
      login_btn: "Se connecter",
      login_error: "Mot de passe incorrect."
    },
    en: {
      brand_name: "TeslaMap",
      admin: "ADMIN",
      connecting: "Connecting...",
      reconnecting: "Reconnecting...",
      parked: "Parked",
      driving: "Driving",
      charging: "Charging",
      private_zone: "Private Zone",
      active: "Active",
      scheduled: "Scheduled",
      expired: "Expired / Inactive",
      logout: "Log out",

      // Live Map
      destination: "Destination",
      loading_route: "Loading route...",
      free_nav: "Free Driving",
      private_zone_desc: "Private Zone: exact position hidden ({zone}).",
      arrival: "Arrival",
      remaining: "Remaining",
      distance: "Distance",
      battery: "Battery",
      trip_progress: "Trip Progress",
      scheduled_title: "Scheduled Time Window",
      scheduled_desc: "This share link will activate at the start of the scheduled window:",
      expired_title: "Link Expired",
      expired_desc: "This temporary share link is no longer active. The trip has either finished, or the allowed sharing time has elapsed.",
      min_unit: "min",
      km_unit: "km",

      // Admin Dashboard
      mqtt_connected: "MQTT Connected",
      car_status_title: "Live Vehicle Status",
      speed: "Speed",
      active_dest: "Active Destination",
      none_free_nav: "None (Free Driving)",
      ephemeral_links: "Ephemeral Share Links",
      new_link_btn: "+ New Link",
      no_links: "No shared links yet.",
      copy_url: "📋 Copy URL",
      copied_toast: "URL copied to clipboard!",
      link_revoked: "Link revoked",
      link_deleted: "Link deleted",
      zone_deleted: "Zone deleted",
      zone_saved: "Protected zone saved",
      revoke: "Revoke",
      delete: "Delete",
      views: "views",
      unlimited: "Unlimited",
      or_arrival: " (or upon arrival)",
      from_date: "From",
      to_date: "to",
      expires_on: "Expires on",
      at_hour: "at",
      safe_zones_title: "Protected Zones (Geofencing)",
      add_zone_btn: "+ Add Zone",
      safe_zones_desc: "When your vehicle is inside one of these zones, its exact coordinates and speed are hidden on all shared links.",
      no_zones: "No protected zones defined.",
      radius: "Radius",
      gps: "GPS",

      // Dialog
      create_link_title: "Create Share Link",
      create_link_subtitle: "Generate a secure temporary URL to share your live trip.",
      link_label: "Link name or label",
      link_label_placeholder: "Ex: Road trip, Family share...",
      mode_duration: "⏱ Relative Duration",
      mode_slot: "📅 Time Slot",
      duration_validity: "Validity duration (starting now)",
      preset_1h: "1 Hour",
      preset_4h: "4 Hours",
      preset_12h: "12 Hours",
      preset_24h: "24 Hours",
      preset_48h: "48 Hours",
      preset_unlimited: "No limit",
      slot_start: "Share start (e.g. 2:00 PM)",
      slot_end: "Share end (e.g. 4:30 PM)",
      opt_revoke_arrival: "Revoke upon arrival",
      opt_revoke_arrival_sub: "Expires as soon as car is parked",
      opt_show_speed: "Show real speed",
      opt_show_speed_sub: "Visible in km/h on the map",
      opt_show_battery: "Show battery level",
      opt_show_battery_sub: "Remaining percentage",
      cancel: "Cancel",
      create: "Create Link",
      link_created: "Share link created!",

      // Login
      login_title: "TeslaMap Admin",
      login_subtitle: "Please enter your administrator password",
      password: "Password",
      login_btn: "Log In",
      login_error: "Incorrect password."
    }
  };

  // Determine current language
  function getPreferredLanguage() {
    const saved = localStorage.getItem('teslamap_lang');
    if (saved && (saved === 'fr' || saved === 'en')) {
      return saved;
    }
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('fr') ? 'fr' : 'en';
  }

  let currentLang = getPreferredLanguage();

  function t(key, params) {
    const dict = translations[currentLang] || translations.en;
    let val = dict[key] || translations.en[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return val;
  }

  function setLanguage(lang) {
    if (lang !== 'fr' && lang !== 'en') return;
    currentLang = lang;
    localStorage.setItem('teslamap_lang', lang);
    applyTranslations();
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });

    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      if (lang === currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.documentElement.lang = currentLang;
  }

  window.I18n = {
    t,
    getLang: () => currentLang,
    setLang: setLanguage,
    apply: applyTranslations
  };

  document.addEventListener('DOMContentLoaded', applyTranslations);
})();
