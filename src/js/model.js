import { travelTolerance, fareTolerance } from './config.js';

// One definition of the rules the interface describes. Ranking, colouring,
// matching and messages import from here so a hidden factor cannot creep back
// into one consumer without changing the rule that every other consumer uses.

export const GAP_FLOOR_STATION_MIN = 8;
export const GAP_FLOOR_STOP_MIN = 5;
export const WALK_STEP_MIN = 5;
export const WALK_STEP_MAX = 60;
export const WALK_STEP_DEFAULT = 20;

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

// The visible ordering. Every field here is one the user can see on the card:
// the whole-minute score (longest + spread), then the displayed longest and
// spread as tie-breaks, then a stable area key. Interest ratings are disclosed
// as information only and never change this order. In fare mode the displayed
// fare spread comes first, then the largest visible fare chip and the same
// displayed time numbers. The heat colour follows the largest fare chip.
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
// default. A mixed-type slot (only possible with a ragged tuple) stays equal,
// matching the old numeric coercion, which produced NaN for such a pair.
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
