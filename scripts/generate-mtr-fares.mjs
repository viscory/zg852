// Regenerate the bundled Adult Octopus MTR fare matrix from MTR open data.
// Usage: node scripts/generate-mtr-fares.mjs
// The generated JSON is committed; the app never calls the API at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metroUrl = 'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv';
const aelUrl = 'https://opendata.mtr.com.hk/data/airport_express_fares.csv';

function parseLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      out.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  out.push(value);
  return out;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = parseLine(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(header.map((key, i) => [key, parseLine(line)[i]])));
}

async function csv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return parseCsv(await response.text());
}

const alias = {
  'Lohas Park': 'LOHAS Park',
  'Hong Kong': 'HongKong',
};
const canonical = name => alias[name] || name;
const stripSuffix = name => {
  const value = String(name || '');
  const marker = value.indexOf(' · ');
  return marker < 0 ? value : value.slice(0, marker);
};

const nodes = JSON.parse(await readFile(resolve(root, 'static/data/nodes.json'), 'utf8'));
const metroRows = await csv(metroUrl);
const aelRows = await csv(aelUrl);

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

const unmatched = stationIndices.filter(index => stationIds[index] === undefined && !aelStations.some(s => s.index === index)).map(index => nodes.names[index]);

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
if (unmatched.length) console.log('unmatched:', unmatched.join(', '));
