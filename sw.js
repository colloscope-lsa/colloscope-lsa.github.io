/* Colloscope — service worker : démarrage immédiat et notifications. Version b8730c67d101
   - La page et les icônes de cette version sont gardées sur le téléphone : le site s'ouvre sans attendre le réseau.
   - À chaque ouverture, la page est aussi redemandée au serveur en arrière-plan : si elle a changé, le site propose de recharger.
   - Les données (créneaux, inscriptions) ne passent jamais par ici : elles viennent toujours du serveur. */
"use strict";
var VERSION = "b8730c67d101";
var CACHE = "colloscope-" + VERSION, POLICES = "colloscope-polices";
var FICHIERS = ["./", "manifest.webmanifest", "apple-touch-icon.png", "icone-192.png"];

self.addEventListener("install", function (e) {
  // La page est indispensable ; les icônes, si elles manquent, ne bloquent rien
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.add(new Request("./", { cache: "reload" })).then(function () {
      return Promise.all(FICHIERS.slice(1).map(function (f) { return c.add(new Request(f, { cache: "reload" })).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
// Prévient les pages ouvertes qu'une nouvelle version du site est arrivée
function signalerNouvelleVersion() {
  return self.clients.matchAll({ type: "window" }).then(function (fenetres) {
    fenetres.forEach(function (f) { f.postMessage({ type: "nouvelle-version" }); });
  });
}
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf("colloscope-") === 0 && k !== CACHE && k !== POLICES; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.slice(-6) === "/sw.js") return;
    if (req.mode === "navigate") {
      // La page : la copie de l'appareil tout de suite, et la version du serveur en arrière-plan pour la prochaine ouverture
      e.respondWith(caches.open(CACHE).then(function (c) {
        return c.match("./").then(function (copie) {
          var avant = copie ? copie.clone().text() : null;
          // Nouvelle page enregistrée d'abord, puis comparée : « Mettre à jour » affiche bien la nouvelle
          var reseau = fetch(url.origin + url.pathname, { cache: "no-cache", credentials: "same-origin" }).then(function (r) {
            if (!(r && r.ok && r.type === "basic")) return r;
            var pourCache = r.clone(), pourComparer = r.clone();
            return c.put("./", pourCache).then(function () {
              return avant ? Promise.all([avant, pourComparer.text()]).then(function (t) { if (t[0] !== t[1]) return signalerNouvelleVersion(); }) : null;
            }).then(function () { return r; });
          });
          if (copie) { e.waitUntil(reseau.then(function () {}, function () {})); return copie; }
          return reseau;
        });
      }).catch(function () { return fetch(req); }));
      return;
    }
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (copie) { return copie || fetch(req); });
    }).catch(function () { return fetch(req); }));
    return;
  }
  // Polices : téléchargées une fois, puis gardées
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(POLICES).then(function (c) {
      return c.match(req).then(function (copie) {
        return copie || fetch(req).then(function (r) { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; });
      });
    }).catch(function () { return fetch(req); }));
  }
});

/* ---------- Notifications ---------- */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { body: e.data.text() }; } catch (y) { d = {}; } }
  // Safari exige d'afficher chaque notification reçue
  e.waitUntil(self.registration.showNotification(d.title || "Colloscope", {
    body: d.body || "", tag: d.tag || undefined, data: { url: d.url || "./" }, icon: "icone-192.png", badge: "icone-192.png", lang: "fr"
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var cible = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (fenetres) {
    for (var i = 0; i < fenetres.length; i++) {
      var f = fenetres[i];
      if (f.url.indexOf(self.registration.scope) === 0 && "focus" in f) {
        f.postMessage({ type: "ouvrir", url: cible });
        return f.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(cible) : null;
  }));
});
