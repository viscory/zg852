export const ACCENT='#C8102E';
export const PERSON_COLORS=['#F97316','#0E7490','#7C3AED','#B45309','#0F766E','#BE185D','#0891B2','#4D7C0F'];
export const HEAT_COLORS=['#7F1D1D','#991B1B','#B91C1C','#DC2626','#EF4444','#FCA5A5'];
export const LETTERS='ABCDEFGH';
export const LOCALES=['en','zh-Hant','zh-Hans','ja','ko','hi','ur','fil','id','fr','th','vi','ne','es','de'];
export const RTL_LOCALES=new Set(['ur']);
export const KEY={people:'hkfair.v2.people',settings:'hkfair.v2.settings',geocache:'hkfair.v2.geocache',directory:'hkfair.v2.directory',locale:'hkfair.v2.locale',oldLoc:'hkfair.v1.locations',oldModes:'hkfair.v1.modes'};
export const HK_BBOX=[113.83,22.15,114.45,22.58];
export const HK_BBOX_STR=HK_BBOX.join(',');
export const HK_CENTER={lat:22.31,lon:114.17};
export const ACCESS_RADIUS_M=1200;
export const MAX_ACCESS_NODES=12;
export const CELL_SIZE=0.005;
export const WALK_SPEED_KMH=4.5;
export const WALK_DETOUR=1.3;
export const MAX_CLOUD_CELLS=600;
export const TRAVEL_BUDGET_MINUTES=60;
export const WALK_TOLERANCE_DEFAULT=20;
export const WALK_TOLERANCE_MAX=60;
export const VECTOR_KEYS=['food','drinks','activities','culture','outdoors','shopping'];
export const VECTOR_BONUS_MINUTES=6;
export const RECOMPUTE_DELAY=500;
export const RAIL_FARE_BANDS=[[2,4.9],[5,6.5],[9,8.2],[14,10.6],[20,13.2],[30,16.8],[Infinity,20.5]];
// Adult Octopus fares for the Airport Express. The shared rail band tops out at HK$20.5.
export const AEL_FARES=[
  ['Airport','Tsing Yi',64.5],
  ['Airport','Kowloon',100],
  ['Airport','Hong Kong',115],
  ['Airport','AsiaWorld-Expo',6.5],
  ['AsiaWorld-Expo','Tsing Yi',70],
  ['AsiaWorld-Expo','Kowloon',105],
  ['AsiaWorld-Expo','Hong Kong',120],
];
export const BUS_FARE_BANDS=[[4,5.5],[8,7.2],[15,9.6],[25,13.2],[Infinity,17.7]];
export const FARE_INTERCHANGE_WALK_MINUTES=15;
