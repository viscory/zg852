const { test, expect } = require('@playwright/test');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const source = path => readFileSync(join(root, 'src', 'js', path), 'utf8');
const catalogue = file => JSON.parse(readFileSync(join(root, 'static', 'i18n', file), 'utf8'));
const catalogues = () => readdirSync(join(root, 'static', 'i18n'))
  .filter(file => file.endsWith('.json'))
  .map(file => [file, catalogue(file)]);

test.use({ serviceWorkers: 'block' });

async function shareUrl(page, state) {
  const origin = await page.evaluate(() => location.origin);
  return `${origin}/#s=${Buffer.from(JSON.stringify(state)).toString('base64url')}`;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/sw.js', route => route.abort());
  await page.route('**/tiles.openfreemap.org/**', route => route.abort());
  await page.route('**/photon.komoot.io/api/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }),
  }));
});

// Finding 1: the heat colour, the card chips and the result order must all be
// driven by the worst fare anyone pays, not a hidden total/spread mix.
test('fare ranking, heat value and visible chips share one value', () => {
  const engine = source('engine.js');
  const model = source('model.js');
  const map = source('map.js');
  const ui = source('ui.js');

  expect(engine).toMatch(/compareAreaRank\(a\.cell,b\.cell,'fare'\)/);
  expect(model).toMatch(/if\(metric === 'fare'\)return \[\s*Number\(area\?\.maxFare\) \|\| 0,/);
  expect(model).toMatch(/export const heatValue = \(area,metric='time'\) => metric === 'fare'\s*\? Number\(area\?\.maxFare\) \|\| 0/);
  expect(map).toMatch(/const value=heatValue\(cell,metric\)/);
  expect(ui).toMatch(/fareMarkup\(route\)/);
  expect(engine).not.toMatch(/a\.cell\.totalFare-b\.cell\.totalFare/);
  expect(engine).not.toMatch(/meetingSuitability/);
});

// Finding 2: no undisclosed station-priority tie-break may reorder areas that
// the visible spread/longest numbers say are equally fair.
test('meeting suitability is no longer a ranking factor', () => {
  const model = source('model.js');
  const routing = source('routing.js');
  const engine = source('engine.js');

  expect(model).toMatch(/return \[Number\(area\?\.fitScore \?\? area\?\.score \?\? 0\), String\(area\?\.key \?\? ''\)\]/);
  expect(routing).not.toMatch(/meetingSuitability|meetingTieBreak|MEETING_TIE_MINUTES/);
  expect(engine).not.toMatch(/meetingSuitability|meetingTieBreak|MEETING_TIE_MINUTES/);
  // nodePriority is still used only to label the chosen meeting point.
  expect(routing).toMatch(/priority=nodePriority\(kind\)/);
  expect(routing).toMatch(/keyCat:catKey\(priority\)/);
});

// Finding 3: Fare mode may reorder cells, but may not widen the 90-minute
// time-feasible set by dropping the time-difference filter.
test('fare mode keeps the time fairness filter', () => {
  const engine = source('engine.js');

  expect(engine).toMatch(/const timeTolerance=fairnessTolerance\('time',store\.settings\)/);
  expect(engine).toMatch(/buildCells\(effectiveGrids,timeTolerance,TRAVEL_BUDGET_MINUTES\)/);
  expect(engine).not.toMatch(/buildCells\(effectiveGrids,Infinity/);
});

// Finding 4: "no start reaches the network" and "no common area" are two
// different failures and must not share one misleading message.
test('unreachable starts and no common area use different error keys', () => {
  const engine = source('engine.js');
  const model = source('model.js');
  const fallback = source('i18n.js');

  expect(engine).toMatch(/showError\(t\('error\.noReach'\)\)/);
  expect(engine).toMatch(/showError\(t\(noReachErrorKey\('no-common-area'\)\)\)/);
  expect(model).toMatch(/reason === 'no-common-area' \? 'error\.noCommonArea' : 'error\.noReach'/);
  expect(fallback).toMatch(/'error\.noReach':'No start place reaches the network\.'/);
  expect(fallback).toMatch(/'error\.noCommonArea':'Your starts reach the network/);
  for(const [file, data] of catalogues()){
    expect(data['error.noReach'], file).toBeTruthy();
    expect(data['error.noCommonArea'], file).toBeTruthy();
    expect(data['error.noCommonArea'], file).not.toBe(data['error.noReach']);
  }
  expect(catalogue('en.json')['error.noReach']).toBe('No start place reaches the network.');
  expect(catalogue('en.json')['error.noCommonArea']).toContain('90 minutes');
});

// Finding 5: the Process page promises one fixed walking radius. No distant
// fallback may quietly extend it for coordinate/pinned starts.
test('source lookup stays inside the fixed access radius', () => {
  const routing = source('routing.js');
  const process = readFileSync(join(root, 'src', 'process.html'), 'utf8');

  expect(process).toMatch(/within a fixed walking radius/i);
  expect(routing).toMatch(/const pool=near\.filter\(\(\[d\]\)=>d<=ACCESS_RADIUS_M\)/);
  expect(routing).not.toMatch(/allowFallback/);
  expect(routing).not.toMatch(/near\.slice\(0,MAX_ACCESS_NODES\*2\)/);
});

// Finding 6: the advertised floors are gap floors (8/5 minutes, HK$1), not a
// percentage added on top of the 5-minute floor.
test('time and fare fairness floors match the legend', () => {
  const model = source('model.js');
  const routing = source('routing.js');
  const config = source('config.js');
  const engine = source('engine.js');

  expect(model).toMatch(/export const GAP_FLOOR_STATION_MIN = 8/);
  expect(model).toMatch(/export const GAP_FLOOR_STOP_MIN = 5/);
  expect(model).toMatch(/return gap > Math\.max\(fastest \* tolerance, floor\)/);
  expect(routing).toMatch(/overFairnessBand\(\{fastest,slowest,gap,kind\},tolerance\)/);
  expect(routing).not.toMatch(/slowest>Math\.max\(fastest,5\)\*\(1\+tolerance\)/);
  expect(config).toMatch(/export const FARE_GAP_FLOOR=1\.0/);
  expect(engine).toMatch(/Math\.max\(cached\.meanFare\*fareLimit,FARE_GAP_FLOOR\)/);
});

// Finding 7: recentering fits fair areas, not every start marker.
test('recenter fits only fair areas and the selected point', () => {
  const map = source('map.js');
  const fallback = source('i18n.js');

  expect(map).toMatch(/const points=store\.results\.flatMap\(result=>result\.paths\.flat\(\)\)/);
  expect(map).not.toMatch(/store\.activePeople\.filter\(person=>person\.origin\)/);
  expect(fallback).toMatch(/'map\.recenterKey':'Recenter fits fair areas; starts stay put'/);
});

// Finding 8: the 0..60 slider is in 5-minute steps, so persisted and shared
// values must be snapped at every boundary, not merely clamped.
test('walk tolerance is snapped to 5-minute steps at every boundary', () => {
  const model = source('model.js');
  const ui = source('ui.js');

  expect(model).toMatch(/export const WALK_STEP_MIN = 5/);
  expect(model).toMatch(/Math\.round\(safe \/ WALK_STEP_MIN\) \* WALK_STEP_MIN/);
  for(const name of ['state.js', 'ui.js', 'routing.js']){
    expect(source(name)).toMatch(/snapWalkMinutes\(/);
    expect(source(name)).not.toMatch(/clamp\(Number\([^)]*walkMinutes/);
  }
  expect(ui).toMatch(/step="5"/);
});

test('a shared walk tolerance of 17 is normalised to 15', async ({ page }) => {
  await page.goto('/');
  const origins = await page.evaluate(async () => {
    const nodes = await (await fetch('data/nodes.json')).json();
    return ['Tsuen Wan', 'North Point'].map(name => {
      const node = nodes.names.findIndex((value, i) => value === name && nodes.kind[i] === 1);
      return { kind: 'node', node, label: nodes.names[node], lat: nodes.lat[node], lon: nodes.lon[node] };
    });
  });
  const state = {
    v: 1,
    people: origins.map((origin, i) => ({ id: `p${i + 1}`, name: ['A', 'B'][i], origin, walkMinutes: 17 })),
    settings: { modes: ['rail', 'bus'], fairness: 'time', tolerance: 3.05, includeHeadway: true },
    locale: 'en',
    selected: { kind: 'result', index: 0 },
  };
  await page.goto(await shareUrl(page, state));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-net', 'ready');
  for(const slider of await page.locator('[data-walk]').all()){
    await expect(slider).toHaveValue('15');
  }
  expect(await page.evaluate(() => localStorage.getItem('hkfair.v2.people'))).toMatch(/"walkMinutes":15/);
});

// Finding 9: with both modes enabled, "enable another mode" is false; the
// message must only ask for a larger tolerance.
test('no-fit message follows the enabled modes', () => {
  const model = source('model.js');
  const engine = source('engine.js');
  const fallback = source('i18n.js');

  expect(model).toMatch(/if\(enabled\.length === 1\)return enabled\[0\] === 'rail' \? 'results\.noFitMtr' : 'results\.noFitBus'/);
  expect(model).toMatch(/return 'results\.noFitTolerance'/);
  expect(engine).toMatch(/noFitErrorKey\(store\.settings\.modes\)/);
  expect(fallback).toMatch(/'results\.noFitTolerance':'No areas fit this tolerance\. Increase it\.'/);
  for(const [file, data] of catalogues()){
    expect(data['results.noFitTolerance'], file).toBeTruthy();
    expect(data['results.noFitTolerance'], file).not.toMatch(/another mode|enable/i);
  }
});

// Finding 10: station/platform/exit bonuses used to distort walk matching;
// the closest stop within the radius is now the sole representative.
test('source ranking uses walk minutes only', () => {
  const model = source('model.js');
  const routing = source('routing.js');

  expect(model).toMatch(/export const sourceRankMinutes = minutes => Number\(minutes\) \|\| 0/);
  expect(routing).toMatch(/rank=sourceRankMinutes\(minutes\)/);
  expect(routing).not.toMatch(/sourcePenalty/);
  expect(routing).not.toMatch(/kind===2\?0\.2:kind===3\?0\.8/);
});
