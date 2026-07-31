/* 器械台帳 — 控え（オフライン保持）
 *
 * 方針:
 *   apps.json ... 通信優先 / 失敗時は控えを出す
 *   その他     ... 通信優先 + 成功したものは控える
 *                  → 一度でも開いた器械は、以後 機外でも開く
 */

const VERSION = 'kikai-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // 1つ落ちても install を止めない
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return notKeptPage();
        return new Response('', { status: 503 });
      })
  );
});

/** 機外で、まだ控えていない器械を開いたときの画面 */
function notKeptPage() {
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>控えなし</title><style>
body{margin:0;background:#0E1621;color:#DCD3BE;
     font-family:"Hiragino Sans",system-ui,sans-serif;
     padding:calc(80px + env(safe-area-inset-top)) 22px 22px;line-height:1.7}
h1{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;
   font-size:19px;font-weight:600;letter-spacing:.16em;margin:0 0 12px}
p{color:#7E8898;font-size:13.5px;margin:0 0 10px;max-width:40ch}
a{display:inline-block;margin-top:20px;color:#C08A3E;
  font-size:13px;letter-spacing:.1em;text-decoration:none;
  border-bottom:1px solid #C08A3E;padding-bottom:2px}
</style></head><body>
<h1>控えがありません</h1>
<p>この器械はまだ一度も開いていないため、機外では表示できません。</p>
<p>通信できる場所で一度開けば、以後は控えから開けます。</p>
<a href="${self.registration.scope}">台帳へ戻る</a>
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

