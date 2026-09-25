// TeslaMap - Internationalization (i18n) Engine
(function () {
  const dictionary = [
    // [key, fr, en]
    ["brand_name", "TeslaMap", "TeslaMap"],
    ["admin", "ADMIN", "ADMIN"],
    ["connecting", "Connexion...", "Connecting..."],
    ["reconnecting", "Reconnexion...", "Reconnecting..."],
    ["parked", "À l'arrêt", "Parked"],
    ["driving", "En route", "Driving"],
    ["charging", "En charge", "Charging"],
    ["private_zone", "Zone Privée", "Private Zone"],
    ["active", "Actif", "Active"],
    ["scheduled", "Programmé", "Scheduled"],
    ["expired", "Expiré / Inactif", "Expired / Inactive"],
    ["logout", "Déconnexion", "Log out"],

    // Live Map
    ["destination", "Destination", "Destination"],
    ["loading_route", "Chargement du trajet...", "Loading route..."],
    ["free_nav", "Navigation libre", "Free Driving"],
    ["private_zone_desc", "Zone Privée : position exacte masquée pour préserver la vie privée.", "Private Zone: exact position hidden to protect privacy."],
    ["private_zone_info", "position exacte masquée pour préserver la vie privée.", "exact position hidden to protect privacy."],
    ["arrival", "Arrivée", "Arrival"],
    ["remaining", "Restant", "Remaining"],
    ["distance", "Distance", "Distance"],
    ["battery", "Batterie", "Battery"],
    ["trip_progress", "Progression du trajet", "Trip Progress"],
    ["scheduled_title", "Créneau programmé", "Scheduled Time Window"],
    ["scheduled_desc", "Ce lien de partage s'activera au début du créneau prévu :", "This share link will activate at the start of the scheduled window:"],
    ["expired_title", "Lien expiré", "Link Expired"],
    ["expired_desc", "Ce lien de partage temporaire n'est plus actif. Le trajet est soit terminé, soit le temps de partage autorisé s'est écoulé.", "This temporary share link is no longer active. The trip has either finished, or the allowed sharing time has elapsed."],
    ["min_unit", "min", "min"],
    ["km_unit", "km", "km"],
    ["recenter", "Recentrer", "Re-center"],
    ["trip_summary_title", "Résumé du trajet", "Trip Summary"],
    ["total_distance", "Distance totale", "Total Distance"],
    ["total_duration", "Temps total", "Total Duration"],
    ["avg_speed", "Vitesse moyenne", "Average Speed"],
    ["arrival_time", "Arrivée", "Arrival Time"],
    ["closed_title", "Lien définitivement clôturé", "Share Link Closed"],
    ["closed_desc", "Ce lien a expiré depuis plus de 2 heures. Par mesure de confidentialité, le suivi et les données de ce trajet ne sont plus consultables.", "This share link expired over 2 hours ago. For privacy reasons, tracking and telemetry data are no longer accessible."],

    // Admin Dashboard
    ["mqtt_connected", "MQTT Connecté", "MQTT Connected"],
    ["car_status_title", "État du véhicule en direct", "Live Vehicle Status"],
    ["speed", "Vitesse", "Speed"],
    ["active_dest", "Destination active", "Active Destination"],
    ["none_free_nav", "Aucune (Navigation libre)", "None (Free Driving)"],
    ["ephemeral_links", "Liens de partage éphémères", "Ephemeral Share Links"],
    ["new_link_btn", "+ Nouveau lien", "+ New Link"],
    ["no_links", "Aucun lien partagé pour le moment.", "No shared links yet."],
    ["copy_url", "📋 Copier l'URL", "📋 Copy URL"],
    ["copied_toast", "URL copiée dans le presse-papiers !", "URL copied to clipboard!"],
    ["link_revoked", "Lien révoqué", "Link revoked"],
    ["link_deleted", "Lien supprimé", "Link deleted"],
    ["zone_deleted", "Zone supprimée", "Zone deleted"],
    ["zone_saved", "Zone protégée enregistrée", "Protected zone saved"],
    ["revoke", "Révoquer", "Revoke"],
    ["delete", "Supprimer", "Delete"],
    ["views", "vues", "views"],
    ["unlimited", "Illimité", "Unlimited"],
    ["or_arrival", " (ou à l'arrivée)", " (or upon arrival)"],
    ["from_date", "Du", "From"],
    ["to_date", "au", "to"],
    ["expires_on", "Expire le", "Expires on"],
    ["at_hour", "à", "at"],
    ["safe_zones_title", "Zones protégées (Geofencing)", "Protected Zones (Geofencing)"],
    ["add_zone_btn", "+ Ajouter une zone", "+ Add Zone"],
    ["safe_zones_desc", "Lorsque votre véhicule se trouve dans l'une de ces zones, sa position exacte et sa vitesse sont masquées sur tous les liens partagés.", "When your vehicle is inside one of these zones, its exact coordinates and speed are hidden on all shared links."],
    ["no_zones", "Aucune zone protégée définie.", "No protected zones defined."],
    ["radius", "Rayon", "Radius"],
    ["gps", "GPS", "GPS"],

    // Dialog
    ["create_link_title", "Créer un lien de partage", "Create Share Link"],
    ["create_link_subtitle", "Générez une URL temporaire sécurisée pour partager votre trajet en direct.", "Generate a secure temporary URL to share your live trip."],
    ["link_label", "Nom ou libellé du lien", "Link name or label"],
    ["link_label_placeholder", "Ex: Trajet vacances, Partage famille...", "Ex: Road trip, Family share..."],
    ["mode_duration", "⏱ Durée relative", "⏱ Relative Duration"],
    ["mode_slot", "📅 Créneau horaire", "📅 Time Slot"],
    ["duration_validity", "Durée de validité (à partir de maintenant)", "Validity duration (starting now)"],
    ["preset_1h", "1 Heure", "1 Hour"],
    ["preset_4h", "4 Heures", "4 Hours"],
    ["preset_12h", "12 Heures", "12 Hours"],
    ["preset_24h", "24 Heures", "24 Hours"],
    ["preset_48h", "48 Heures", "48 Hours"],
    ["preset_unlimited", "Sans limite", "No limit"],
    ["slot_start", "Début du partage (ex: 14h00)", "Share start (e.g. 2:00 PM)"],
    ["slot_end", "Fin du partage (ex: 16h30)", "Share end (e.g. 4:30 PM)"],
    ["opt_revoke_arrival", "Révoquer à l'arrivée", "Revoke upon arrival"],
    ["opt_revoke_arrival_sub", "Expire à destination ou après 5 min stationné", "Expires at destination or after 5 min parked"],
    ["opt_show_speed", "Afficher la vitesse réelle", "Show real speed"],
    ["opt_show_speed_sub", "Visible en km/h sur la carte", "Visible in km/h on the map"],
    ["opt_show_battery", "Afficher le niveau de batterie", "Show battery level"],
    ["opt_show_battery_sub", "Pourcentage restant", "Remaining percentage"],
    ["cancel", "Annuler", "Cancel"],
    ["create", "Créer le lien", "Create Link"],
    ["link_created", "Lien de partage créé et copié !", "Share link created and copied!"],

    // TeslaMate Geofences Sync & Safe Zone Dialog
    ["teslamate_sync_title", "Géofences automatiques TeslaMate :", "TeslaMate automatic geofences:"],
    ["teslamate_sync_desc", "Toutes vos géofences créées dans TeslaMate (Domicile, Travail, etc.) sont automatiquement reconnues et protégées en direct via MQTT, sans aucune saisie manuelle.", "All geofences configured in TeslaMate (Home, Work, etc.) are automatically detected and protected in real time via MQTT, without any manual entry."],
    ["teslamate_in_geofence", "Véhicule actuellement dans la géofence TeslaMate : {zone} (Position masquée)", "Vehicle currently inside TeslaMate geofence: {zone} (Position masked)"],
    ["teslamate_in_geofence_unmasked", "Véhicule dans la géofence TeslaMate : {zone} (Protection désactivée)", "Vehicle inside TeslaMate geofence: {zone} (Protection disabled)"],
    ["teslamate_switch_tooltip", "Activer ou désactiver la protection automatique des géofences TeslaMate", "Enable or disable automatic protection for TeslaMate geofences"],
    ["teslamate_geofences_enabled_toast", "Géofences TeslaMate activées", "TeslaMate geofences enabled"],
    ["teslamate_geofences_disabled_toast", "Géofences TeslaMate désactivées", "TeslaMate geofences disabled"],
    ["create_zone_title", "Ajouter une zone protégée", "Add protected zone"],
    ["create_zone_subtitle", "Masque automatiquement la position exacte et la vitesse lorsque la voiture est dans cette zone.", "Automatically hides exact position and speed whenever the vehicle is inside this area."],
    ["zone_name_label", "Nom de la zone", "Zone name"],
    ["zone_radius_label", "Rayon de protection (mètres)", "Protection radius (meters)"],
    ["use_current_pos_btn", "📍 Utiliser la position actuelle du véhicule", "📍 Use vehicle's current position"],
    ["save_zone_btn", "Enregistrer la zone", "Save zone"],
    ["confirm_revoke_title", "Révoquer le lien", "Revoke share link"],
    ["confirm_revoke_desc", "Voulez-vous révoquer ce lien immédiatement ? Les personnes qui regardent la carte ne pourront plus suivre le trajet.", "Do you want to revoke this link immediately? People currently viewing the map will no longer be able to track the vehicle."],
    ["confirm_delete_link_title", "Supprimer le lien", "Delete share link"],
    ["confirm_delete_link_desc", "Voulez-vous supprimer définitivement ce lien de partage ?", "Are you sure you want to permanently delete this share link?"],
    ["confirm_delete_zone_title", "Supprimer la zone protégée", "Delete protected zone"],
    ["confirm_delete_zone_desc", "Voulez-vous supprimer cette zone protégée ? Les coordonnées GPS ne seront plus masquées à cet endroit.", "Are you sure you want to delete this protected zone? GPS coordinates will no longer be obfuscated in this area."],
    ["confirm_btn", "Confirmer", "Confirm"],
    ["err_zone_fields", "Veuillez renseigner le nom, la latitude, la longitude et le rayon de la zone.", "Please fill in the zone name, latitude, longitude, and radius."],
    ["err_zone_gps", "Coordonnées GPS ou rayon invalides.", "Invalid GPS coordinates or radius."],
    ["pos_fetched", "Position actuelle appliquée !", "Current vehicle position applied!"],
    ["no_car_pos", "Position du véhicule non disponible pour le moment.", "Vehicle position is not available yet."],

    // Login
    ["login_title", "TeslaMap Admin", "TeslaMap Admin"],
    ["login_subtitle", "Veuillez saisir votre mot de passe administrateur", "Please enter your administrator password"],
    ["password", "Mot de passe", "Password"],
    ["login_btn", "Se connecter", "Log In"],
    ["login_error", "Mot de passe incorrect.", "Incorrect password."]
  ];

  const translations = { fr: {}, en: {} };
  for (let i = 0; i < dictionary.length; i++) {
    const item = dictionary[i];
    translations.fr[item[0]] = item[1];
    translations.en[item[0]] = item[2];
  }

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
