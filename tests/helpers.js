// Tests speak in tolerance fractions; the slider mapping itself lives in
// src/js/config.js so there is only one implementation to keep correct.
// Limitation (circular oracle): sliderPosition() derives positions from that
// same config module the app uses, so it cannot independently verify the
// mapping. The independent oracle is the hardcoded expected DOM values in
// fairness.spec.js; this helper only drives the slider to a known position.
const { loadSourceModule } = require('./source-modules');

let configPromise;
function config() {
  if (!configPromise) configPromise = loadSourceModule('config.js');
  return configPromise;
}

async function sliderPosition(value) {
  const { sliderPositionForTolerance } = await config();
  return sliderPositionForTolerance(value);
}

module.exports = { sliderPosition };
