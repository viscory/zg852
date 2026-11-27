// Only the canonical production host may be indexed. Preview deployments and
// local builds must carry noindex so they never surface in search results.
// The hostname is a build-time config value defined in preview-config.js, whose
// script tag each source page places before this one. Change domains in that
// one file. If the config is absent (e.g. the raw source tree in dev), the
// comparison cannot match and noindex is applied, which is the safe direction.
// preview-config.js must be present in the deploy: without it every host is
// treated as a preview and gets noindex, including production.
const PRODUCTION_HOSTNAME = globalThis.ZG852_PRODUCTION_HOSTNAME;

if(location.hostname!==PRODUCTION_HOSTNAME){
  const meta=document.createElement('meta');
  meta.name='robots';
  meta.content='noindex,nofollow';
  document.head.appendChild(meta);
}
