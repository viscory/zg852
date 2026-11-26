// Tests speak in tolerance fractions; the slider mapping itself lives in
// src/js/config.js so there is only one implementation to keep correct.
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
