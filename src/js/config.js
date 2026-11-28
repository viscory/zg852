import C from '../../config/constants.json';

// All numeric policy lives in config/constants.json. This module re-exports the
// named constants every existing consumer imports, keeping the canonical file
// the single source of truth for values shared by the browser and build scripts.
const decodeInfinity=value=>value===C.shared.infinitySentinel?Infinity:value;
const bands=rows=>rows.map(([limit,fare])=>[decodeInfinity(limit),fare]);

export const ACCENT='#C8102E';
export const PERSON_COLORS=['#F97316','#0E7490','#7C3AED','#B45309','#0F766E','#BE185D','#0891B2','#4D7C0F'];
export const HEAT_COLORS=['#4C0519','#9F1239','#E11D48','#F97316','#FACC15','#FDE68A'];
export const LETTERS='ABCDEFGH';
export const LOCALES=['en','zh-Hant','zh-Hans','ja','ko','hi','ur','fil','id','fr','th','vi','ne','es','de'];
export const RTL_LOCALES=new Set(['ur']);
export const KEY={people:'hkfair.v2.people',settings:'hkfair.v2.settings',geocache:'hkfair.v2.geocache',directory:'hkfair.v2.directory',locale:'hkfair.v2.locale',previousScenario:'hkfair.v2.previousScenario',oldLoc:'hkfair.v1.locations',oldModes:'hkfair.v1.modes'};
export const HK_BBOX=[113.83,22.15,114.45,22.58];
export const HK_BBOX_STR=HK_BBOX.join(',');
export const HK_CENTER={lat:22.31,lon:114.17};
// Line categories in network.json map onto mode bits one-to-one. Every travel
// mode has its own chip; selecting MTR never silently enables light rail, and
// selecting bus never silently enables ferry.
export const MODE_BITS={...C.runtime.modeBits};
export function lineCategoryBit(category){return 1<<category;}
export function modesMask(modes){
  return (modes||[]).reduce((mask,mode)=>mask|(MODE_BITS[mode]||0),0);
}
export const NODE_KINDS={...C.runtime.nodeKinds};
export const ACCESS_RADIUS_M=C.runtime.accessRadiusM;
export const MAX_ACCESS_NODES=C.runtime.maxAccessNodes;
export const CELL_SIZE=C.runtime.cellSizeDeg;
export const WALK_SPEED_KMH=C.runtime.walkSpeedKmh;
export const WALK_DETOUR=C.runtime.walkDetour;
export const MAX_CLOUD_CELLS=C.runtime.maxCloudCells;
// There is no travel-time cap: journeys may take as long as the timetable
// allows. The key is kept as a documented unbounded marker for diagnostics and
// copy; routing code uses currentTravelCap() (Infinity) instead.
export const TRAVEL_BUDGET_MINUTES=C.runtime.travelBudgetMinutes;
// Only this many top-ranked areas are published in the results list. Shared
// with the mobile cap regression so the two cannot drift apart.
export const RESULTS_LIMIT=C.runtime.resultsLimit;
export const MIN_PEOPLE=C.runtime.minPeople;
export const MAX_PEOPLE=C.runtime.maxPeople;
export const SEARCH_LIMIT=C.runtime.searchLimit;
export const RANKING_WEIGHTS={...C.runtime.rankingWeights};
export const ROUNDING_SCALES={...C.runtime.roundingScales};
export const DEFAULT_INCLUDE_HEADWAY=true;
// Fairness is a percentage of disparity. The slider starts at 5%, runs linear
// in 1% steps to 100%, then logarithmic to 300%, then one unbounded stop.
// Settings and share links keep the fraction, not the slider position.
export const FAIRNESS_METRICS=['time','fare'];
export const FAIRNESS_DEFAULT='time';
export function activeFairnessMetric(value){return FAIRNESS_METRICS.includes(value)?value:FAIRNESS_DEFAULT;}
export const TRAVEL_TOLERANCE_MIN=C.runtime.travelToleranceMin;
export const TRAVEL_TOLERANCE_MAX=C.runtime.travelToleranceMax;
// The unbounded stop is a sentinel fraction (3.05 = 305%), not a real upper
// bound. Time and fare tolerances share this one sentinel so settings, slider
// positions and share links all agree on its meaning.
export const UNBOUNDED_TOLERANCE_SENTINEL=C.runtime.unboundedToleranceSentinel;
// Older name kept as an alias for existing consumers; the value is unchanged.
export const TRAVEL_TOLERANCE_UNBOUNDED=UNBOUNDED_TOLERANCE_SENTINEL;
export const TRAVEL_TOLERANCE_DEFAULT=C.runtime.travelToleranceDefault;
export const FARE_TOLERANCE_DEFAULT=C.runtime.fareToleranceDefault;
export const FARE_GAP_FLOOR=C.runtime.fareGapFloor;
export const TOLERANCE_SLIDER_MAX=C.runtime.toleranceSliderMax;
export const TOLERANCE_LINEAR_END=C.runtime.toleranceLinearEnd;
// Slider positions are one piecewise map: 1 starts at 5%, 96 is 100%, 97..200
// continue logarithmically to 300%, and 201 is the unbounded stop. The inverse
// derives its log base from TRAVEL_TOLERANCE_MAX so the two directions cannot
// drift when the published maximum changes. The slider DOM max attribute is
// set by UI code from these constants (TOLERANCE_SLIDER_MAX); this module stays
// the source of truth for the range. Settings and share links keep fractions,
// never slider positions.
export const TOLERANCE_SLIDER_MIN=C.runtime.toleranceSliderMin;
export const TOLERANCE_LINEAR_OFFSET=C.runtime.toleranceLinearOffset;
export const TOLERANCE_PERCENT_SCALE=C.runtime.tolerancePercentScale;
export const TOLERANCE_LINEAR_END_PERCENT=C.runtime.toleranceLinearEndPercent;
export const TOLERANCE_LOG_STEPS=TOLERANCE_SLIDER_MAX-TOLERANCE_SLIDER_MIN-TOLERANCE_LINEAR_END;
export function travelTolerance(value){
  const n=Number(value);
  if(!Number.isFinite(n))return TRAVEL_TOLERANCE_DEFAULT;
  if(n>=UNBOUNDED_TOLERANCE_SENTINEL)return UNBOUNDED_TOLERANCE_SENTINEL;
  const clamped=Math.min(TRAVEL_TOLERANCE_MAX,Math.max(0,Math.round(n*100)/100));
  return clamped<TRAVEL_TOLERANCE_MIN?TRAVEL_TOLERANCE_MIN:clamped;
}
export function fareTolerance(value){
  const n=Number(value);
  if(!Number.isFinite(n))return FARE_TOLERANCE_DEFAULT;
  if(n>=UNBOUNDED_TOLERANCE_SENTINEL)return UNBOUNDED_TOLERANCE_SENTINEL;
  const clamped=Math.min(TRAVEL_TOLERANCE_MAX,Math.max(0,Math.round(n*100)/100));
  return clamped<TRAVEL_TOLERANCE_MIN?TRAVEL_TOLERANCE_MIN:clamped;
}
export function isUnboundedTolerance(value){return travelTolerance(value)>=UNBOUNDED_TOLERANCE_SENTINEL;}
export function toleranceFromSlider(position){
  const p=Math.max(TOLERANCE_SLIDER_MIN,Math.min(TOLERANCE_SLIDER_MAX,Math.round(Number(position)||TOLERANCE_SLIDER_MIN)));
  if(p>=TOLERANCE_SLIDER_MAX)return UNBOUNDED_TOLERANCE_SENTINEL;
  if(p<=TOLERANCE_LINEAR_END)return travelTolerance((TOLERANCE_LINEAR_OFFSET+p)/TOLERANCE_PERCENT_SCALE);
  return travelTolerance(Math.pow(TRAVEL_TOLERANCE_MAX,(p-TOLERANCE_LINEAR_END)/TOLERANCE_LOG_STEPS));
}
export function sliderPositionForTolerance(value){
  const tolerance=travelTolerance(value);
  if(tolerance>=UNBOUNDED_TOLERANCE_SENTINEL)return TOLERANCE_SLIDER_MAX;
  const pct=tolerance*TOLERANCE_PERCENT_SCALE;
  if(pct<=TOLERANCE_LINEAR_END_PERCENT)return Math.max(TOLERANCE_SLIDER_MIN,Math.min(TOLERANCE_LINEAR_END,Math.round(pct-TOLERANCE_LINEAR_OFFSET)));
  const position=TOLERANCE_LINEAR_END+Math.round(Math.log(pct/TOLERANCE_PERCENT_SCALE)/Math.log(TRAVEL_TOLERANCE_MAX)*TOLERANCE_LOG_STEPS);
  return Math.max(TOLERANCE_LINEAR_END+TOLERANCE_SLIDER_MIN,Math.min(TOLERANCE_SLIDER_MAX-TOLERANCE_SLIDER_MIN,position));
}
// Used only until a search has produced displayed fares. The live scale follows
// the largest fare chip shown on the current heat cells, so an unvisited high
// fare in the bundled snapshot cannot flatten the map.
export const FARE_HEAT_FALLBACK_MAX=C.runtime.fareHeatFallbackMax;
// Standard MTR line colours, keyed by the line code used in network.json.
export const MTR_LINE_COLORS={
  AEL:'#00857D',DRL:'#F283B6',EAL:'#5EB7E6',ISL:'#2475A0',KTL:'#3FA34D',
  SIL:'#008264',TCL:'#F5A623',TKL:'#9C5FB8',TML:'#923011',TWL:'#ED1D24',
};
export const MTR_LINE_DEFAULT_COLOR='#8A8A8A';
export const DEFAULT_MODES=[...C.runtime.defaultModes];
export const FARE_WALK_LIMIT_MINUTES=C.runtime.fareWalkLimitMinutes;
export const VECTOR_KEYS=['food','drinks','activities','culture','outdoors','shopping'];
export const VECTOR_BONUS_MINUTES=C.runtime.vectorBonusMinutes;
export const RECOMPUTE_DELAY=C.runtime.recomputeDelayMs;
export const RAIL_FARE_BANDS=bands(C.fares.railBands);
// Adult Octopus Light Rail fares by number of stops travelled, including the
// boarding and alighting stops (MTR Light Rail Fare Chart, effective 25 Aug 2024).
export const LIGHT_RAIL_FARES=bands(C.fares.lightRailFares);
// Only used when a bus, minibus or ferry line is missing from the bundled
// Transport Department full-fare snapshot. Such fares are flagged as estimates.
export const BUS_FARE_BANDS=bands(C.fares.busBands);
export const FARE_INTERCHANGE_WALK_MINUTES=C.runtime.fareInterchangeWalkMinutes;
export const GAP_FLOOR_STATION_MIN=C.runtime.gapFloorStationMin;
export const GAP_FLOOR_STOP_MIN=C.runtime.gapFloorStopMin;
export const DEDUPE_RADIUS_M=C.runtime.dedupeRadiusM;
export const TAP_SNAP_RADIUS=C.runtime.tapSnapRadiusPx;
export const EARTH_RADIUS_M=C.shared.earthRadiusM;
export const DEFAULT_CONSTANTS=C;
export const SHARED_CONSTANTS=C.shared;
