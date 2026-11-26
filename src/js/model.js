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

// The visible ordering. Time mode uses the vector-adjusted fairness score
// (the displayed spread and longest, with the disclosed interest preference as
// a final tie-break). Fare mode starts with the displayed fare spread, then
// the largest visible fare chip and the displayed time numbers. The heat
// colour still follows the largest fare chip, as the map key states.
export function areaRank(area,metric='time'){
  if(metric === 'fare')return [
    Number(area?.fareGap) || 0,
    Number(area?.maxFare) || 0,
    Number(area?.slowest) || 0,
    Number(area?.gap) || 0,
    Number(area?.vectorAdjustment) || 0,
    String(area?.key ?? ''),
  ];
  return [Number(area?.fitScore ?? area?.score ?? 0), String(area?.key ?? '')];
}
export function compareAreaRank(a,b,metric='time'){
  const left = areaRank(a,metric), right = areaRank(b,metric);
  for(let i = 0; i < Math.max(left.length, right.length); i++){
    const l = left[i] ?? 0, r = right[i] ?? 0;
    if(l < r)return -1;
    if(l > r)return 1;
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
  const enabled = Array.isArray(modes) ? modes.filter(mode => mode === 'rail' || mode === 'bus') : [];
  if(enabled.length === 1)return enabled[0] === 'rail' ? 'results.noFitMtr' : 'results.noFitBus';
  if(enabled.length === 0)return 'error.noMode';
  return 'results.noFitTolerance';
}
