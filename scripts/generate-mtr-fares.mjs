// Regenerate the bundled Adult Octopus MTR fare matrix from MTR open data.
// Usage: node scripts/generate-mtr-fares.mjs
// The generated JSON is committed; the app never calls the API at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metroUrl = 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv';
const aelUrl = 'https://opendata.mtr.com.hk/data/airport_express_fares.csv';

// Small RFC-4180-style CSV reader with named states. No dependency is added:
// the upstream feeds are simple, but a full reader is still needed so a comma
// or newline inside a quoted field cannot shift every following column. States:
//   FIELD      - ordinary unquoted characters
//   QUOTED     - inside a double-quoted field (commas/newlines are data)
//   AFTER_QUOTE - a closing quote was just consumed; only , newline or " follows
// Tests by construction (checked against the state table above, no test lib):
//   'a,b\r\n1,"x,y"'  -> [{a:'1', b:'x,y'}]       (comma inside quotes is data)
//   'a\n"say ""hi"""' -> [{a:'say "hi"'}]          (doubled quote is an escape)
//   'a,b\r\n1,\r\n'    -> [{a:'1', b:''}]           (empty trailing field, CRLF)
//   'a,b\n"multi\nline",2' -> [{a:'multi\nline', b:'2'}] (quoted newline)
// A missing required header is a build error, not a row of undefined values.
const CSV_STATE = Object.freeze({
  FIELD: 'field',
  QUOTED: 'quoted',
  AFTER_QUOTE: 'afterQuote',
});

function parseCsv(text, requiredHeaders, label = '') {
  const rows = [];
  let row = [];
  let field = '';
  let state = CSV_STATE.FIELD;
  const source = text.trim().replace(/^\uFEFF/, '');

  const finishRow = () => {
    row.push(field);
    field = '';
    rows.push(row);
    row = [];
    state = CSV_STATE.FIELD;
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (state === CSV_STATE.QUOTED) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          state = CSV_STATE.AFTER_QUOTE;
        }
      } else {
        field += char; // includes newlines inside a quoted field
      }
      continue;
    }
    if (state === CSV_STATE.AFTER_QUOTE) {
      if (char === ',') {
        row.push(field);
        field = '';
        state = CSV_STATE.FIELD;
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        finishRow();
      } else if (char === '"') {
        field += '"';
        state = CSV_STATE.QUOTED;
      } else {
        field += char;
        state = CSV_STATE.FIELD;
      }
      continue;
    }
    // CSV_STATE.FIELD
    if (char === '"') {
      state = CSV_STATE.QUOTED;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      finishRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) finishRow();

  const header = rows[0] || [];
  const missing = requiredHeaders.filter(key => !header.includes(key));
  if (missing.length) throw new Error(`CSV ${label} missing required headers: ${missing.join(', ')}`);
  return rows.slice(1).map(cells => Object.fromEntries(header.map((key, i) => [key, cells[i]])));
}

async function csv(url, requiredHeaders) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return parseCsv(await response.text(), requiredHeaders, url);
}

// MTR open data spells two station names differently from nodes.json. Each
// entry is a reviewed, deliberate translation; adding one changes which fares
// get generated, so keep this map minimal rather than guessing normalisations.
const alias = {
  'Lohas Park': 'LOHAS Park',
  'Hong Kong': 'HongKong',
};
const canonical = name => alias[name] || name;

// Stations reviewed as legitimately absent from BOTH MTR feeds belong here.
// The list is empty today: every station in nodes.json matches once the alias
// map above is applied. A *new* unmatched station is data drift and must fail
// the build instead of silently emitting a partial fare matrix.
const REVIEWED_UNMATCHED_STATIONS = new Set();

const stripSuffix = name => {
  const value = String(name || '');
  const marker = value.indexOf(' · ');
  return marker < 0 ? value : value.slice(0, marker);
};

const nodes = JSON.parse(await readFile(resolve(root, 'static/data/nodes.json'), 'utf8'));
const metroRows = await csv(metroUrl, ['SRC_STATION_NAME', 'DEST_STATION_NAME', 'SRC_STATION_ID', 'DEST_STATION_ID', 'OCT_ADT_FARE']);
const aelRows = await csv(aelUrl, ['ST_FROM', 'ST_TO', 'ST_FROM_ID', 'ST_TO_ID', 'OCT_ADT_FARE']);

const metroIdByName = new Map();
const fareByOfficialId = new Map();
for (const row of metroRows) {
  metroIdByName.set(row.SRC_STATION_NAME, Number(row.SRC_STATION_ID));
  metroIdByName.set(row.DEST_STATION_NAME, Number(row.DEST_STATION_ID));
  const key = `${row.SRC_STATION_ID}|${row.DEST_STATION_ID}`;
  fareByOfficialId.set(key, Number(row.OCT_ADT_FARE));
}

const aelIdByName = new Map();
const fareByAelId = new Map();
for (const row of aelRows) {
  aelIdByName.set(row.ST_FROM, Number(row.ST_FROM_ID));
  aelIdByName.set(row.ST_TO, Number(row.ST_TO_ID));
  fareByAelId.set(`${row.ST_FROM_ID}|${row.ST_TO_ID}`, Number(row.OCT_ADT_FARE));
}

const stationIndices = [];
nodes.names.forEach((name, index) => {
  if (nodes.kind[index] === 1) stationIndices.push(index);
});
const stationByName = new Map();
for (const index of stationIndices) stationByName.set(nodes.names[index], index);

const stationIds = {};
const fares = {};
for (const from of stationIndices) {
  const fromId = metroIdByName.get(canonical(nodes.names[from]));
  if (fromId === undefined) continue;
  stationIds[from] = fromId;
  for (const to of stationIndices) {
    const toId = metroIdByName.get(canonical(nodes.names[to]));
    if (toId === undefined) continue;
    const fare = fareByOfficialId.get(`${fromId}|${toId}`) ?? fareByOfficialId.get(`${toId}|${fromId}`);
    if (fare !== undefined) fares[`${from}|${to}`] = Math.round(fare * 10) / 10;
  }
}

const aelStations = [];
nodes.names.forEach((name, index) => {
  if (nodes.kind[index] !== 1) return;
  const id = aelIdByName.get(canonical(name));
  if (id !== undefined) aelStations.push({ index, id });
});
const aelFares = {};
for (const from of aelStations) {
  for (const to of aelStations) {
    const fare = fareByAelId.get(`${from.id}|${to.id}`) ?? fareByAelId.get(`${to.id}|${from.id}`);
    if (fare !== undefined) aelFares[`${from.index}|${to.index}`] = Math.round(fare * 10) / 10;
  }
}

const nodeStation = {};
nodes.names.forEach((name, index) => {
  const station = stationByName.get(stripSuffix(name));
  if (station !== undefined) nodeStation[index] = station;
});

const unmatched = stationIndices
  .filter(index => stationIds[index] === undefined
    && !aelStations.some(s => s.index === index)
    && !REVIEWED_UNMATCHED_STATIONS.has(nodes.names[index]))
  .map(index => nodes.names[index]);
if (unmatched.length) {
  console.error(`Unmatched MTR stations (review aliases/feeds before regenerating): ${unmatched.join(', ')}`);
  process.exit(1);
}

const output = {
  source: {
    metro: metroUrl,
    airportExpress: aelUrl,
    field: 'OCT_ADT_FARE',
    note: 'Adult Octopus fares from MTR open data; bundled as a build-time snapshot.',
  },
  generatedAt: new Date().toISOString(),
  stationIds,
  fares,
  aelFares,
  nodeStation,
};
await writeFile(resolve(root, 'static/data/mtr-fares.json'), `${JSON.stringify(output, null, 0)}\n`);
console.log(`stations ${stationIndices.length}, metro fares ${Object.keys(fares).length}, AEL stations ${aelStations.length}, AEL fares ${Object.keys(aelFares).length}, node mappings ${Object.keys(nodeStation).length}`);
