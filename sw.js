/* Service worker de la Agenda UTU: funciona sin conexión y manda avisos. */
var CACHE = 'agenda-utu-v1';
var DATA_CACHE = 'agenda-utu-data';
var FILES = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== DATA_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
      return self.clients.openWindow('./');
    })
  );
});

/* Aviso diario con la app cerrada (Chrome en Android, con la agenda instalada en la pantalla de inicio). */
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function whenText(d) {
  if (d < 0) return 'Venció hace ' + (-d) + (d === -1 ? ' día' : ' días');
  if (d === 0) return '¡Es hoy!';
  if (d === 1) return '¡Es mañana!';
  return 'Faltan ' + d + ' días';
}

function dailyCheck() {
  return caches.open(DATA_CACHE).then(function (c) {
    return Promise.all([c.match('./__recordatorio.json'), c.match('./__sw_ultimo.json')]).then(function (r) {
      if (!r[0]) return;
      return Promise.all([r[0].json(), r[1] ? r[1].json() : {}]).then(function (v) {
        var data = v[0], last = v[1] || {};
        var today = ymd(new Date());
        if (!data.notify || data.lastNotified === today || last.day === today) return;
        var t0 = parseYmd(today);
        var list = (data.tasks || []).map(function (t) {
          return { title: t.title, d: Math.round((parseYmd(t.due) - t0) / 86400000) };
        }).filter(function (t) { return t.d <= data.reminderDays; })
          .sort(function (a, b) { return a.d - b.d; });
        if (!list.length) return;
        var body = list.slice(0, 5).map(function (t) { return '• ' + t.title + ' — ' + whenText(t.d); }).join('\n');
        if (list.length > 5) body += '\ny ' + (list.length - 5) + ' más…';
        return c.put('./__sw_ultimo.json', new Response(JSON.stringify({ day: today }))).then(function () {
          return self.registration.showNotification(
            list.length === 1 ? 'Agenda UTU: 1 entrega cerca' : 'Agenda UTU: ' + list.length + ' entregas cerca',
            { body: body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'agenda-utu' }
          );
        });
      });
    });
  });
}

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'agenda-utu-recordatorio') e.waitUntil(dailyCheck());
});
