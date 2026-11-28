const CACHE='zg852-v93';
const ASSETS=['./index.html','./app.js','./app.css','./legal.css','./preview-noindex.js','./preview-config.js','./maplibre-gl-worker.mjs','./favicon.ico','./favicon.svg','./icon-180.png','./icon-512.png','./manifest.webmanifest','./og-image.png','./privacy.html','./terms.html','./credits.html','./process.html','./data/nodes.json','./data/network.json','./data/districts.json','./data/poi-index.json','./data/hkbus.json','./data/mtr-fares.json','./data/route-fares.json','./data/build-report.json','./i18n/en.json','./i18n/zh-Hant.json','./i18n/zh-Hans.json','./i18n/ja.json','./i18n/ko.json','./i18n/hi.json','./i18n/ur.json','./i18n/fil.json','./i18n/id.json','./i18n/fr.json','./i18n/th.json','./i18n/vi.json','./i18n/ne.json','./i18n/es.json','./i18n/de.json'];
// Cache keys are path-only (query strings are ignored) on purpose: the app
// requests the maplibre worker with a `?v=` cache-buster, and that request must
// still hit the bare precached entry when offline. Making keys query-aware
// would break offline worker loads unless the app URL changes in lockstep.
const cacheKey=request=>new URL(request.url||request,self.location.href).pathname;

// A failed fallback must resolve to a real Response, never bare `undefined`.
// respondWith() rejected with a non-Response turns into an opaque network
// error at the caller; an explicit 404 is deterministic and keeps offline
// misses honest.
function notFound(){
  return new Response('Not found',{status:404,statusText:'Not Found'});
}

// Cache fallback: exact path key first, then the SPA navigation fallback, then
// a real 404. Only same-origin GET requests reach this helper.
function cacheFallback(request,key){
  const path=new URL(request.url||request,self.location.href).pathname;
  return caches.open(CACHE).then(c=>c.match(key).then(hit=>hit
    ||((path==='/'||path==='/index.html')?c.match('/index.html'):undefined)
    ||notFound()));
}

// Network-first policy: serve the network response, refresh the cache from an
// OK same-origin basic response, and consult the cache only if the network
// fails. Same semantics as before, now split into named helpers.
function networkFirst(event,key){
  const request=event.request;
  return fetch(request).then(res=>{
    if(res.ok&&res.type==='basic'&&new URL(res.url||request.url).origin===self.location.origin){
      const copy=res.clone();
      event.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)).catch(err=>console.warn('cache write failed', err)));
    }
    return res;
  }).catch(()=>cacheFallback(request,key));
}

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  const path=url.pathname;
  if(e.request.method!=='GET'||url.origin!==self.location.origin||path==='/sw.js')return;
  e.respondWith(networkFirst(e,cacheKey(e.request)));
});
