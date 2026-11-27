// Only the canonical production host is meant to be indexed. Preview
// deployments and local builds get a client-side robots noindex meta tag, so
// crawlers that execute JavaScript see it. This is best-effort only: non-JS
// crawlers never run this script, and neither robots.txt nor the deployment
// headers send X-Robots-Tag, so previews are not guaranteed to stay out of
// search results. The hostname is a build-time config value defined in
// preview-config.js, whose script tag each source page places before this
// one. Change domains in that one file. If the config is absent (e.g. the raw
// source tree in dev), the comparison cannot match and noindex is applied,
// which is the safe direction. preview-config.js must be present in the
// deploy: without it every host is treated as a preview and gets noindex,
// including production.
const PRODUCTION_HOSTNAME = globalThis.ZG852_PRODUCTION_HOSTNAME;

if(location.hostname!==PRODUCTION_HOSTNAME){
  const meta=document.createElement('meta');
  meta.name='robots';
  meta.content='noindex,nofollow';
  document.head.appendChild(meta);
}
