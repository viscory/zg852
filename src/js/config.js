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
export const ACCESS_RADIUS_M=1200;
export const MAX_ACCESS_NODES=12;
export const CELL_SIZE=0.005;
export const WALK_SPEED_KMH=4.5;
export const WALK_DETOUR=1.3;
export const MAX_CLOUD_CELLS=600;
export const TRAVEL_BUDGET_MINUTES=90;
export const DEFAULT_INCLUDE_HEADWAY=true;
// Fairness is a percentage of disparity. The slider starts at 5%, runs linear
// in 1% steps to 100%, then logarithmic to 300%, then one unbounded stop.
// Settings and share links keep the fraction, not the slider position.
export const FAIRNESS_METRICS=['time','fare'];
export const FAIRNESS_DEFAULT='time';
export function activeFairnessMetric(value){return FAIRNESS_METRICS.includes(value)?value:FAIRNESS_DEFAULT;}
export const TRAVEL_TOLERANCE_MIN=0.05;
export const TRAVEL_TOLERANCE_MAX=3.0;
export const TRAVEL_TOLERANCE_UNBOUNDED=3.05;
export const TRAVEL_TOLERANCE_DEFAULT=0.1;
export const FARE_TOLERANCE_DEFAULT=0.25;
export const FARE_GAP_FLOOR=1.0;
export const TOLERANCE_SLIDER_MAX=201;
export const TOLERANCE_LINEAR_END=96;
export function travelTolerance(value){
  const n=Number(value);
  if(!Number.isFinite(n))return TRAVEL_TOLERANCE_DEFAULT;
  if(n>=TRAVEL_TOLERANCE_UNBOUNDED)return TRAVEL_TOLERANCE_UNBOUNDED;
  const clamped=Math.min(TRAVEL_TOLERANCE_MAX,Math.max(0,Math.round(n*100)/100));
  return clamped<TRAVEL_TOLERANCE_MIN?TRAVEL_TOLERANCE_MIN:clamped;
}
export function fareTolerance(value){
  const n=Number(value);
  if(!Number.isFinite(n))return FARE_TOLERANCE_DEFAULT;
  if(n>=TRAVEL_TOLERANCE_UNBOUNDED)return TRAVEL_TOLERANCE_UNBOUNDED;
  const clamped=Math.min(TRAVEL_TOLERANCE_MAX,Math.max(0,Math.round(n*100)/100));
  return clamped<TRAVEL_TOLERANCE_MIN?TRAVEL_TOLERANCE_MIN:clamped;
}
export function isUnboundedTolerance(value){return travelTolerance(value)>=TRAVEL_TOLERANCE_UNBOUNDED;}
export function toleranceFromSlider(position){
  const p=Math.max(1,Math.min(TOLERANCE_SLIDER_MAX,Math.round(Number(position)||1)));
  if(p>=TOLERANCE_SLIDER_MAX)return TRAVEL_TOLERANCE_UNBOUNDED;
  if(p<=TOLERANCE_LINEAR_END)return travelTolerance((4+p)/100);
  return travelTolerance(Math.pow(TRAVEL_TOLERANCE_MAX,(p-TOLERANCE_LINEAR_END)/(TOLERANCE_SLIDER_MAX-1-TOLERANCE_LINEAR_END)));
}
export function sliderPositionForTolerance(value){
  const tolerance=travelTolerance(value);
  if(tolerance>=TRAVEL_TOLERANCE_UNBOUNDED)return TOLERANCE_SLIDER_MAX;
  const pct=tolerance*100;
  if(pct<=100)return Math.max(1,Math.min(TOLERANCE_LINEAR_END,Math.round(pct-4)));
  const position=TOLERANCE_LINEAR_END+Math.round(Math.log(pct/100)/Math.log(3)*(TOLERANCE_SLIDER_MAX-1-TOLERANCE_LINEAR_END));
  return Math.max(TOLERANCE_LINEAR_END+1,Math.min(TOLERANCE_SLIDER_MAX-1,position));
}
// Cost ranking keeps the top time-feasible cells and ranks those by fare.
export const MAX_COST_CELLS=300;
// Used only if the bundled fare snapshot has not loaded yet. The live scale is
// derived from that snapshot so every published fare has its own colour.
export const FARE_HEAT_FALLBACK_MAX=25;
// Standard MTR line colours, keyed by the line code used in network.json.
export const MTR_LINE_COLORS={
  AEL:'#00857D',DRL:'#F283B6',EAL:'#5EB7E6',ISL:'#2475A0',KTL:'#3FA34D',
  SIL:'#008264',TCL:'#F5A623',TKL:'#9C5FB8',TML:'#923011',TWL:'#ED1D24',
};
export const MTR_LINE_DEFAULT_COLOR='#8A8A8A';
export const WALK_TOLERANCE_DEFAULT=20;
export const WALK_TOLERANCE_MAX=60;
export const VECTOR_KEYS=['food','drinks','activities','culture','outdoors','shopping'];
export const VECTOR_BONUS_MINUTES=6;
export const RECOMPUTE_DELAY=500;
export const RAIL_FARE_BANDS=[[2,4.9],[5,6.5],[9,8.2],[14,10.6],[20,13.2],[30,16.8],[Infinity,20.5]];
// Adult Octopus Light Rail fares by number of stops travelled, including the
// boarding and alighting stops (MTR Light Rail Fare Chart, effective 25 Aug 2024).
export const LIGHT_RAIL_FARES=[[3,5.1],[6,5.3],[9,5.4],[12,5.4],[15,6.1],[18,6.5],[21,7.4],[Infinity,7.7]];
// Only used when a bus, minibus or ferry line is missing from the bundled
// Transport Department full-fare snapshot. Such fares are flagged as estimates.
export const BUS_FARE_BANDS=[[4,5.5],[8,7.2],[15,9.6],[25,13.2],[Infinity,17.7]];
export const FARE_INTERCHANGE_WALK_MINUTES=15;
