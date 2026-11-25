// The tolerance slider is 0%, linear 1% steps from 5% to 100%, logarithmic
// to 300%, then one Unlimited stop. Tests still speak in fractions, so convert
// them to slider positions here.
function sliderPosition(value) {
  const tolerance = Math.max(0, Math.min(3.05, Number(value)));
  if (tolerance >= 3.05) return 201;
  if (tolerance <= 0) return 0;
  const percent = tolerance * 100;
  if (percent <= 5) return 1;
  if (percent <= 100) return Math.max(1, Math.min(96, Math.round(percent - 4)));
  const position = 96 + Math.round(Math.log(percent / 100) / Math.log(3) * 104);
  return Math.max(97, Math.min(200, position));
}

module.exports = { sliderPosition };
