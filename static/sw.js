const CACHE='zg852-v60';
const ASSETS=['./index.html','./app.js','./app.css','./legal.css','./sw.js','./preview-noindex.js','./maplibre-gl-worker.mjs','./favicon.ico','./favicon.svg','./icon-180.png','./icon-512.png','./manifest.webmanifest','./og-image.png','./privacy.html','./terms.html','./credits.html','./process.html','./data/nodes.json','./data/network.json','./data/districts.json','./data/poi-index.json','./data/hkbus.json','./i18n/en.json','./i18n/zh-Hant.json','./i18n/zh-Hans.json','./i18n/ja.json','./i18n/ko.json','./i18n/hi.json','./i18n/ur.json','./i18n/fil.json','./i18n/id.json','./i18n/fr.json','./i18n/th.json','./i18n/vi.json','./i18n/ne.json','./i18n/es.json','./i18n/de.json'];
const cacheKey=request=>new URL(request.url||request,self.location.href).pathname;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  const path=url.pathname;
  if(e.request.method!=='GET'||url.origin!==self.location.origin||path==='/sw.js')return;
  const key=cacheKey(e.request);
  e.respondWith(fetch(e.request).then(res=>{
    if(res.ok&&res.type==='basic'&&new URL(res.url||e.request.url).origin===self.location.origin){
      const copy=res.clone();
      e.waitUntil(caches.open(CACHE).then(c=>c.put(key,copy)).catch(()=>{}));
    }
    return res;
  }).catch(()=>caches.open(CACHE).then(c=>c.match(key).then(hit=>hit||((path==='/'||path==='/index.html')?c.match('/index.html'):undefined)))));
});
