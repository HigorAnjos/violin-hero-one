// Lembrete de prática dentro do service worker (importado pelo Workbox: vite.config.ts > workbox.importScripts).
// Sem servidor de push: a sincronização periódica do navegador acorda o worker (só PWA instalada, Chrome/Edge);
// ele confere se passou da hora num dia escolhido e se o lembrete de hoje ainda não saiu.
// A escolha vem de src/services/reminder.ts pelo Cache Storage (o worker não lê o localStorage).
const CACHE = 'vh-lembrete';
const CONFIG = '/__lembrete.json';
const LAST = '/__lembrete-ultimo';
const TAG = 'vh-lembrete';

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

async function remindIfDue() {
  const cache = await caches.open(CACHE);
  const config = await cache.match(CONFIG).then((r) => (r ? r.json() : null));
  if (!config || !config.enabled || !Array.isArray(config.days)) return;
  const now = new Date();
  const [h, m] = String(config.time).split(':').map(Number);
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (!config.days.includes(now.getDay()) || now < at) return;
  const last = await cache.match(LAST).then((r) => (r ? r.text() : ''));
  if (last === dayKey(now)) return;
  await cache.put(LAST, new Response(dayKey(now)));
  await self.registration.showNotification(config.title, { body: config.body, icon: '/icons/icon-192.png', tag: TAG });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === TAG) event.waitUntil(remindIfDue());
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== TAG) return;
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('/');
    })
  );
});
