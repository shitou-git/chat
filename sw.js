/* ============================================================
 * 灵知 Service Worker
 * - 预缓存核心静态资源 (install)
 * - 导航请求：网络优先，失败回退 index.html (SPA)
 * - 静态资源：缓存优先 (Cache First)
 * - API 请求：仅网络，不缓存
 * ============================================================ */

const CACHE_VERSION = "lingzhi-v22";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./Z.webp",
  "./icon-192.webp",
  "./icon-512.webp",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css",
  "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js",
];

// 判断是否为跨域资源
function isCrossOrigin(urlStr) {
  try {
    var u = new URL(urlStr, self.location.href);
    return u.origin !== self.location.origin;
  } catch (e) {
    return false;
  }
}

// ---------- install：预缓存核心资源 ----------
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        // 同源资源使用默认 mode (cors)，跨域 CDN 也使用 cors
        // （jsdelivr 支持 CORS），避免 opaque response 的不确定状态
        var requests = PRECACHE_URLS.map(function (url) {
          if (isCrossOrigin(url)) {
            return new Request(url, { mode: "cors", credentials: "omit" });
          }
          return url;
        });
        return cache.addAll(requests);
      })
      .then(function () {
        return self.skipWaiting(); // 激活新 SW，不等待旧 SW 交出控制权
      })
      .catch(function (err) {
        console.warn("[SW] install precache error:", err);
      })
  );
});

// ---------- activate：清理旧版本缓存 ----------
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_VERSION;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim(); // 立即接管所有页面
      })
  );
});

// ---------- fetch：按请求类型分流 ----------
self.addEventListener("fetch", function (event) {
  const req = event.request;

  // 只处理 GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1) API 请求：只走网络，不缓存
  if (url.hostname.indexOf("agnes-ai.com") !== -1) {
    return;
  }

  // 2) 导航请求（页面刷新 / 进入）：网络优先，失败回退离线页
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (response) {
          // 成功时更新缓存中的 index.html
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put("./index.html", copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match("./index.html").then(function (cached) {
            return cached || caches.match("./");
          });
        })
    );
    return;
  }

  // 3) 其他静态资源：Cache First，命中失败回源
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (response) {
          // 只缓存成功响应 (status 200)，且类型为 basic/cors
          // 注意：不缓存 opaque response —— 其 status 不可读，
          // CDN 返回的 4xx/5xx 会被误认为成功缓存下来
          if (
            response &&
            response.status === 200 &&
            (response.type === "basic" || response.type === "cors")
          ) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return response;
        })
        .catch(function () {
          // 彻底失败：如果是图片类请求返回空响应，避免页面挂住
          if (req.destination === "image") {
            return new Response("", { status: 408, statusText: "Offline" });
          }
          return Response.error();
        });
    })
  );
});
