/* 购物价格记录 —— Service Worker
 * 更新策略：
 *   - HTML / 页面导航  → 网络优先（永远拿 Netlify 上的最新版，断网才用缓存）
 *   - 图标、manifest   → 缓存优先（几乎不变，省流量）
 * 你改完 index.html 上传 GitHub，Netlify 部署后，用户下次打开就是新版，
 * 不需要改这里的版本号。
 */

const VERSION = 'v1.0.0';
const CACHE_NAME = 'shop-price-' + VERSION;

// 预缓存：首次安装时先存起来，保证断网也能打开
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

/* ---------- 安装：立刻接管，不等旧标签页关闭 ---------- */
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 逐个添加，单个失败不影响整体
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        })
      );
    })
  );
});

/* ---------- 激活：清掉所有旧版本缓存 ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME && key.indexOf('shop-price-') === 0) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- 请求拦截 ---------- */
self.addEventListener('fetch', function (event) {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  /* ---- 页面导航 / HTML：网络优先 ---- */
  if (isHTML) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put('./index.html', copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        // 断网 → 回退缓存
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./') || new Response(
            '<!doctype html><meta charset="utf-8"><title>离线</title>' +
            '<body style="font-family:sans-serif;padding:40px;text-align:center;color:#16211b">' +
            '<h2>当前处于离线状态</h2><p style="color:#6b7a72">连上网络后重新打开即可。</p></body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  /* ---- 静态资源：缓存优先 ---- */
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

/* ---------- 收到消息：可手动触发跳过等待 ---------- */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});