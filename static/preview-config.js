// Single source of truth for the preview noindex check's canonical hostname.
// finalize.mjs injects a <script src="preview-config.js"> tag before
// preview-noindex.js in every built HTML page, so the global below is defined
// before the noindex check runs. Other SEO metadata (canonical/OG URLs,
// sitemap, robots, llms.txt, README) is maintained separately.
globalThis.ZG852_PRODUCTION_HOSTNAME = 'zg852.pages.dev';
