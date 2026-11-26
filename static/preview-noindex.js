// Only the canonical production host may be indexed. Preview deployments and
// local builds must carry noindex so they never surface in search results.
const PRODUCTION_HOSTNAME = 'zg852.pages.dev';

if(location.hostname!==PRODUCTION_HOSTNAME){
  const meta=document.createElement('meta');
  meta.name='robots';
  meta.content='noindex,nofollow';
  document.head.appendChild(meta);
}
