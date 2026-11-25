// The tolerance slider is logarithmic: 0%, 1–300%, then Unlimited.
// Tests still speak in fractions, so convert them to slider positions here.
function sliderPosition(value) {
  const tolerance = Math.max(0, Math.min(3.05, Number(value)));
  if (tolerance >= 3.05) return 101;
  if (tolerance <= 0) return 0;
  return Math.max(1, Math.min(100, 1 + Math.round(Math.log(tolerance * 100) / Math.log(300) * 99)));
}

module.exports = { sliderPosition };
