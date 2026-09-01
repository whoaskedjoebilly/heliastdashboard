// Heliast dashboard — live visitor tracking snippet (dashboard-live-setup.md
// Phase 9, Option B). Add this to the client's actual site (e.g. the
// MigraineMend site), NOT to this dashboard repo. It pings the Supabase
// Edge Function on every page view so the "Live" tab shows real visitors.
//
// Replace CLIENT_ID with this client's dashboard_clients.id — find it on
// the dashboard's Settings tab. Add a <script> tag loading this file (or
// paste its contents inline) just before </body>.
(function () {
  var CLIENT_ID = "REPLACE_WITH_DASHBOARD_CLIENTS_ID";
  var TRACK_URL = "https://kkvqlplqhdtylwryttpi.supabase.co/functions/v1/track";

  function send(position) {
    var payload = {
      client_id: CLIENT_ID,
      page: window.location.pathname,
      device: /Mobi|Android/i.test(navigator.userAgent) ? "Mobile" : "Desktop",
      lat: position ? position.coords.latitude : null,
      lng: position ? position.coords.longitude : null,
    };
    fetch(TRACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function () {
      // Best-effort — a failed ping shouldn't affect the visitor's page.
    });
  }

  // Geolocation is optional and most visitors will decline the browser
  // prompt — the dashboard still shows the visit, just without a pin on the
  // globe. Swap this for a geo-IP lookup (e.g. in the Edge Function itself,
  // using request headers) if you want location without asking permission.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(send, function () {
      send(null);
    }, { timeout: 2000 });
  } else {
    send(null);
  }

  // Re-ping periodically so long page visits don't fall out of the 2-minute
  // "still here" window the Edge Function prunes against.
  setInterval(function () {
    send(null);
  }, 60 * 1000);
})();
