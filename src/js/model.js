import { travelTolerance, fareTolerance, GAP_FLOOR_STATION_MIN, GAP_FLOOR_STOP_MIN, WALK_STEP_MIN, WALK_STEP_MAX, WALK_STEP_DEFAULT } from './config.js';
import { clamp } from './util.js';

// One definition of the rules the interface describes. Ranking, colouring,
// matching and messages import from here so a hidden factor cannot creep back
// into one consumer without changing the rule that every other consumer uses.

export { GAP_FLOOR_STATION_MIN, GAP_FLOOR_STOP_MIN, WALK_STEP_MIN, WALK_STEP_MAX, WALK_STEP_DEFAULT };

export function snapWalkMinutes(value){
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : WALK_STEP_DEFAULT;
  return Math.min(WALK_STEP_MAX, Math.max(0, Math.round(safe / WALK_STEP_MIN) * WALK_STEP_MIN));
}

// Time and fare tolerance are fractions of the relevant disparity, not slider
// positions. The active metric picks which stored setting applies.
export function fairnessTolerance(metric, settings){
  return metric === 'fare' ? fareTolerance(settings?.fareTolerance) : travelTolerance(settings?.tolerance);
}

export function gapFloor(kind){return kind === 1 ? GAP_FLOOR_STATION_MIN : GAP_FLOOR_STOP_MIN;}
export function overFairnessBand(cell,tolerance){
  const floor = gapFloor(cell?.kind);
  const fastest = Number(cell?.fastest) || 0;
  const gap = Number(cell?.gap) || 0;
  return gap > Math.max(fastest * tolerance, floor);
}

// The ordering used for areas. The first key is a stored fit score derived
// from the whole-minute longest + spread, not a figure shown on the card; the
// displayed longest and spread follow as tie-breaks, then a stable area key.
// Interest ratings are disclosed as information only and never change this
// order. In fare mode the displayed fare spread comes first, then the largest
// visible fare chip and the same displayed time numbers. The heat colour
// follows the largest fare chip.
export function areaRank(area,metric='time'){
  if(metric === 'fare')return [
    Number(area?.fareGap) || 0,
    Number(area?.maxFare) || 0,
    Number(area?.shownSlowest ?? area?.slowest) || 0,
    Number(area?.shownGap ?? area?.gap) || 0,
    String(area?.key ?? ''),
  ];
  return [
    Number(area?.fitScore ?? area?.score ?? 0),
    Number(area?.shownSlowest ?? area?.slowest) || 0,
    Number(area?.shownGap ?? area?.gap) || 0,
    String(area?.key ?? ''),
  ];
}
// Rank tuples are positionally typed: numbers first, the string area key last.
// Compare each position within its own type rather than coercing through one
// default. A mixed-type slot (only possible with a ragged tuple) stays equal:
// the old numeric coercion had both comparisons false for such a pair, so it
// produced no ordering rather than a literal NaN.
function compareRankValue(left,right){
  if(typeof left === 'number' && typeof right === 'number'){
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if(typeof left === 'string' && typeof right === 'string'){
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return 0;
}
export function compareAreaRank(a,b,metric='time'){
  const left = areaRank(a,metric), right = areaRank(b,metric);
  for(let i = 0; i < Math.max(left.length, right.length); i++){
    const l = i < left.length ? left[i] : 0, r = i < right.length ? right[i] : 0;
    const order = compareRankValue(l,r);
    if(order)return order;
  }
  return 0;
}
export const heatValue = (area,metric='time') => metric === 'fare'
  ? Number(area?.maxFare) || 0
  : Number(area?.slowest) || 0;
// Heat swatches use a logarithmic scale so short trips spread across the
// palette instead of collapsing into the darkest bucket. log1p keeps zero at
// the bottom of the scale and makes the mapping defined for an empty value.
export function heatRatio(value,ceiling){
  const amount=Number(value),top=Number(ceiling);
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(top)||top<=0)return 0;
  return clamp(Math.log1p(amount)/Math.log1p(top),0,1);
}
export const rankInputs = (area,metric='time') => ({metric,values:areaRank(area,metric)});

// A start is matched to the closest stop. Node kind never changes that walk
// time; grouping by station is only a way to avoid listing every exit twice.
export const sourceRankMinutes = minutes => Number(minutes) || 0;

export function noReachErrorKey(reason){
  return reason === 'no-common-area' ? 'error.noCommonArea' : 'error.noReach';
}
export function noFitErrorKey(modes){
  const enabled = Array.isArray(modes) ? modes.filter(mode => ['rail','bus','lightRail','ferry'].includes(mode)) : [];
  if(enabled.length === 1)return {
    rail:'results.noFitMtr',bus:'results.noFitBus',
    lightRail:'results.noFitLightRail',ferry:'results.noFitFerry',
  }[enabled[0]];
  if(enabled.length === 0)return 'error.noMode';
  return 'results.noFitTolerance';
}
