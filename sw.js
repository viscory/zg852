const CACHE='zg852-v16';
const ASSETS=['./index.html','./styles.css','./app.js','./sw.js','./vendor/leaflet.css','./vendor/lucide/globe.svg','./vendor/lucide/arrow-up.svg','./vendor/lucide/arrow-down.svg','./vendor/lucide/map-pin.svg','./vendor/lucide/scan.svg','./vendor/lucide/bookmark-plus.svg','./vendor/lucide/trash-2.svg','./vendor/lucide/user-plus.svg','./vendor/lucide/users.svg','./vendor/lucide/search.svg','./vendor/lucide/rotate-ccw.svg','./vendor/lucide/plus.svg','./vendor/lucide/pencil.svg','./vendor/lucide/x.svg','./vendor/lucide/train-front.svg','./vendor/lucide/bus.svg','./vendor/lucide/share-2.svg','./vendor/lucide/utensils-crossed.svg','./vendor/lucide/martini.svg','./vendor/lucide/ticket.svg','./vendor/lucide/landmark.svg','./vendor/lucide/trees.svg','./vendor/lucide/shopping-bag.svg',
'./preview-noindex.js','./vendor/leaflet-src.esm.js','./vendor/maplibre-gl.mjs','./vendor/maplibre-gl-worker.mjs','./vendor/maplibre-gl-shared.mjs','./vendor/leaflet-maplibre-gl.mjs','./vendor/maplibre-gl.css','./favicon.ico','./favicon.svg','./og-image.png','./privacy.html','./terms.html','./credits.html','./data/nodes.json','./data/network.json','./data/districts.json','./data/poi-index.json','./i18n/en.json','./i18n/zh-Hant.json','./i18n/zh-Hans.json','./i18n/ja.json','./i18n/ko.json','./i18n/hi.json','./i18n/ur.json','./i18n/fil.json','./i18n/id.json','./i18n/fr.json','./i18n/th.json','./i18n/vi.json','./i18n/ne.json','./i18n/es.json','./i18n/de.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  const cacheFirst=['/data/','/vendor/lucide/'].some(prefix=>new URL(e.request.url).pathname.includes(prefix));
  if(cacheFirst){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
      const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;
    })));
    return;
  }
  if(new URL(e.request.url).pathname.includes('/i18n/')){
    e.respondWith(fetch(e.request).then(res=>{
      const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then(res=>{
    const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;
  }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html'))));
});
