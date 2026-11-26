// Single source of truth for the canonical production hostname.
// Changing domains requires editing this one file: finalize.mjs injects a
// <script src="preview-config.js"> tag before preview-noindex.js in every built
// HTML page, so the global below is defined before the noindex check runs.
globalThis.ZG852_PRODUCTION_HOSTNAME = 'zg852.pages.dev';
