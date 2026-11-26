// Only the canonical production host may be indexed. Preview deployments and
// local builds must carry noindex so they never surface in search results.
// The hostname is a build-time config value defined in preview-config.js, which
// finalize.mjs loads before this script in every built page. Change domains in
// that one file. If the config is absent (e.g. the raw source tree in dev), the
// comparison cannot match and noindex is applied, which is the safe direction.
const PRODUCTION_HOSTNAME = globalThis.ZG852_PRODUCTION_HOSTNAME;

if(location.hostname!==PRODUCTION_HOSTNAME){
  const meta=document.createElement('meta');
  meta.name='robots';
  meta.content='noindex,nofollow';
  document.head.appendChild(meta);
}
