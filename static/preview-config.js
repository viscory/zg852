// Single source of truth for the preview noindex check's canonical hostname.
// Each source page authors the <script src="preview-config.js"> tag before
// preview-noindex.js, and Vite copies it verbatim into public/, so the global
// below is defined before the noindex check runs. finalize.mjs adds no tag. Other SEO metadata (canonical/OG URLs,
// sitemap, robots, llms.txt, README) is maintained separately.
globalThis.ZG852_PRODUCTION_HOSTNAME = 'zg852.pages.dev';
