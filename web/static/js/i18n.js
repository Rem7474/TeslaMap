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
      private_zone_desc: "Zone Privée : position exacte masquée pour préserver la vie privée.",
      private_zone_info: "position exacte masquée pour préserver la vie privée.",
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
      recenter: "Recentrer",
      trip_summary_title: "Résumé du trajet",
      total_distance: "Distance totale",
      total_duration: "Temps total",
      avg_speed: "Vitesse moyenne",
      arrival_time: "Arrivée",
      closed_title: "Lien définitivement clôturé",
      closed_desc: "Ce lien a expiré depuis plus de 2 heures. Par mesure de confidentialité, le suivi et les données de ce trajet ne sont plus consultables.",

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
      opt_revoke_arrival_sub: "Expire à destination ou après 5 min stationné",
      opt_show_speed: "Afficher la vitesse réelle",
      opt_show_speed_sub: "Visible en km/h sur la carte",
      opt_show_battery: "Afficher le niveau de batterie",
      opt_show_battery_sub: "Pourcentage restant",
      cancel: "Annuler",
      create: "Créer le lien",
      link_created: "Lien de partage créé et copié !",

      // TeslaMate Geofences Sync & Safe Zone Dialog
      teslamate_sync_title: "Synchronisation TeslaMate active :",
      teslamate_sync_desc: "Toutes vos géofences créées dans TeslaMate (Domicile, Travail, etc.) sont automatiquement reconnues et protégées en direct via MQTT, sans aucune saisie manuelle.",
      teslamate_in_geofence: "Véhicule actuellement dans la géofence TeslaMate : {zone} (Position masquée)",
      create_zone_title: "Ajouter une zone protégée",
      create_zone_subtitle: "Masque automatiquement la position exacte et la vitesse lorsque la voiture est dans cette zone.",
      zone_name_label: "Nom de la zone",
      zone_radius_label: "Rayon de protection (mètres)",
      use_current_pos_btn: "📍 Utiliser la position actuelle du véhicule",
      save_zone_btn: "Enregistrer la zone",
      confirm_revoke_title: "Révoquer le lien",
      confirm_revoke_desc: "Voulez-vous révoquer ce lien immédiatement ? Les personnes qui regardent la carte ne pourront plus suivre le trajet.",
      confirm_delete_link_title: "Supprimer le lien",
      confirm_delete_link_desc: "Voulez-vous supprimer définitivement ce lien de partage ?",
      confirm_delete_zone_title: "Supprimer la zone protégée",
      confirm_delete_zone_desc: "Voulez-vous supprimer cette zone protégée ? Les coordonnées GPS ne seront plus masquées à cet endroit.",
      confirm_btn: "Confirmer",
      err_zone_fields: "Veuillez renseigner le nom, la latitude, la longitude et le rayon de la zone.",
      err_zone_gps: "Coordonnées GPS ou rayon invalides.",
      pos_fetched: "Position actuelle appliquée !",
      no_car_pos: "Position du véhicule non disponible pour le moment.",

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
      private_zone_desc: "Private Zone: exact position hidden to protect privacy.",
      private_zone_info: "exact position hidden to protect privacy.",
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
      recenter: "Re-center",
      trip_summary_title: "Trip Summary",
      total_distance: "Total Distance",
      total_duration: "Total Duration",
      avg_speed: "Average Speed",
      arrival_time: "Arrival Time",
      closed_title: "Share Link Closed",
      closed_desc: "This share link expired over 2 hours ago. For privacy reasons, tracking and telemetry data are no longer accessible.",

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
      opt_revoke_arrival_sub: "Expires at destination or after 5 min parked",
      opt_show_speed: "Show real speed",
      opt_show_speed_sub: "Visible in km/h on the map",
      opt_show_battery: "Show battery level",
      opt_show_battery_sub: "Remaining percentage",
      cancel: "Cancel",
      create: "Create Link",
      link_created: "Share link created and copied!",

      // TeslaMate Geofences Sync & Safe Zone Dialog
      teslamate_sync_title: "TeslaMate synchronization active:",
      teslamate_sync_desc: "All geofences configured in TeslaMate (Home, Work, etc.) are automatically detected and protected in real time via MQTT, without any manual entry.",
      teslamate_in_geofence: "Vehicle currently inside TeslaMate geofence: {zone} (Position masked)",
      create_zone_title: "Add protected zone",
      create_zone_subtitle: "Automatically hides exact position and speed whenever the vehicle is inside this area.",
      zone_name_label: "Zone name",
      zone_radius_label: "Protection radius (meters)",
      use_current_pos_btn: "📍 Use vehicle's current position",
      save_zone_btn: "Save zone",
      confirm_revoke_title: "Revoke share link",
      confirm_revoke_desc: "Do you want to revoke this link immediately? People currently viewing the map will no longer be able to track the vehicle.",
      confirm_delete_link_title: "Delete share link",
      confirm_delete_link_desc: "Are you sure you want to permanently delete this share link?",
      confirm_delete_zone_title: "Delete protected zone",
      confirm_delete_zone_desc: "Are you sure you want to delete this protected zone? GPS coordinates will no longer be obfuscated in this area.",
      confirm_btn: "Confirm",
      err_zone_fields: "Please fill in the zone name, latitude, longitude, and radius.",
      err_zone_gps: "Invalid GPS coordinates or radius.",
      pos_fetched: "Current vehicle position applied!",
      no_car_pos: "Vehicle position is not available yet.",

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
