const CACHE='zg852-v22';
const ASSETS=['./index.html','./app.js','./app.css','./legal.css','./sw.js','./preview-noindex.js','./maplibre-gl-worker.mjs','./favicon.ico','./favicon.svg','./og-image.png','./privacy.html','./terms.html','./credits.html','./data/nodes.json','./data/network.json','./data/districts.json','./data/poi-index.json','./i18n/en.json','./i18n/zh-Hant.json','./i18n/zh-Hans.json','./i18n/ja.json','./i18n/ko.json','./i18n/hi.json','./i18n/ur.json','./i18n/fil.json','./i18n/id.json','./i18n/fr.json','./i18n/th.json','./i18n/vi.json','./i18n/ne.json','./i18n/es.json','./i18n/de.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  const cacheFirst=new URL(e.request.url).pathname.includes('/data/');
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
