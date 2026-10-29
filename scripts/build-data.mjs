// Builds the pre-projected map files in public/data/ from open map data.
// Run with: npm run data   (needs scripts/raw/*.geojson, see README)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as d3 from 'd3-geo';
import * as topo from 'topojson-client';

const require = createRequire(import.meta.url);
const countries = require('world-countries');
const w50 = require('world-atlas/countries-50m.json');
const w110 = require('world-atlas/countries-110m.json');
const usTopo = require('us-atlas/states-albers-10m.json');

const OUT = 'public/data';
fs.mkdirSync(`${OUT}/maps`, { recursive: true });
const W = 1000;

// ---------- country helpers ----------
const byCcn3 = new Map(countries.map((c) => [c.ccn3, c]));
const byName = new Map(countries.map((c) => [c.name.common, c]));
const EXTRA_OK = new Set(['Kosovo', 'Taiwan', 'Vatican City', 'Palestine']);
const EXTRA_ALIASES = {
  'United States': ['America', 'USA', 'US', 'United States of America'],
  'United Kingdom': ['UK', 'Britain', 'Great Britain'],
  Czechia: ['Czech Republic'],
  'DR Congo': ['Democratic Republic of the Congo', 'DRC', 'Congo-Kinshasa', 'Congo Kinshasa'],
  'Republic of the Congo': ['Congo', 'Congo-Brazzaville', 'Congo Brazzaville'],
  'Ivory Coast': ["Cote d'Ivoire", 'Côte d’Ivoire'],
  Netherlands: ['Holland'],
  'Türkiye': ['Turkey', 'Turkiye'],
  Eswatini: ['Swaziland'],
  'North Macedonia': ['Macedonia'],
  Myanmar: ['Burma'],
  'Vatican City': ['Vatican', 'Holy See'],
  'Timor-Leste': ['East Timor'],
  'Cape Verde': ['Cabo Verde'],
  'Bosnia and Herzegovina': ['Bosnia'],
  'Central African Republic': ['CAR'],
  'United Arab Emirates': ['UAE', 'Emirates'],
  'South Korea': ['Korea'],
};

function countryOf(feature) {
  return byCcn3.get(feature.id) || byName.get(feature.properties?.name) || null;
}
function isCountry(c) {
  return c && (c.unMember || EXTRA_OK.has(c.name.common));
}
function aliasesOf(c) {
  const name = c.name.common;
  const set = new Set([c.name.official, ...(c.altSpellings || []), ...(EXTRA_ALIASES[name] || [])]);
  set.delete(name);
  return [...set].filter((s) => s && s.length >= 2 && s.length < 60);
}

function assignTiers(list, easyNames, sizeOf) {
  const easy = new Set(easyNames);
  for (const n of easy) if (!list.find((x) => x.name === n)) console.warn('  ! easy name not found:', n);
  const rest = list.filter((x) => !easy.has(x.name)).sort((a, b) => sizeOf(b) - sizeOf(a));
  rest.forEach((x, i) => (x.tier = 2 + Math.min(2, Math.floor((i * 3) / rest.length))));
  list.forEach((x) => easy.has(x.name) && (x.tier = 1));
}

// A lon/lat rectangle as points, for fitting projections.
function bboxGeo(x0, y0, x1, y1) {
  const pts = [];
  for (let x = x0; x <= x1; x += 2.5) pts.push([x, y0], [x, y1]);
  for (let y = y0; y <= y1; y += 2.5) pts.push([x0, y], [x1, y]);
  return { type: 'MultiPoint', coordinates: pts };
}

function setup(projection, extentGeo) {
  projection.fitWidth(W - 20, extentGeo);
  const b = d3.geoPath(projection).bounds(extentGeo);
  const h = Math.ceil(b[1][1] - b[0][1]) + 20;
  projection.fitExtent([[10, 10], [W - 10, h - 10]], extentGeo);
  projection.clipExtent([[0, 0], [W, h]]);
  const path = d3.geoPath(projection).digits(1);
  return { path, h };
}

function item(path, feature, extra) {
  const d = path(feature);
  if (!d) return null;
  const area = path.area(feature);
  const [cx, cy] = path.centroid(feature);
  const out = { ...extra, d, c: [+cx.toFixed(1), +cy.toFixed(1)] };
  if (extra.kind !== 'line' && area < 60) out.dot = out.c;
  delete out.kind;
  return out;
}

function write(name, data) {
  const json = JSON.stringify(data);
  fs.writeFileSync(`${OUT}/maps/${name}.json`, json);
  console.log(`  ${name}.json  ${(json.length / 1024).toFixed(0)} KB, ${data.items.length} items`);
}

// ---------- country maps ----------
function countryMap({ id, title, topoData, keep, projection, extentGeo, easy }) {
  const fc = topo.feature(topoData, topoData.objects.countries);
  const feats = fc.features.filter((f) => f.id !== '010'); // no Antarctica
  const itemFeats = feats.filter((f) => {
    const c = countryOf(f);
    return isCountry(c) && keep(c);
  });
  const { path, h } = setup(projection, extentGeo || { type: 'FeatureCollection', features: itemFeats });
  const base = feats
    .filter((f) => !itemFeats.includes(f))
    .map((f) => path(f))
    .filter(Boolean)
    .join('');
  const items = [];
  for (const f of itemFeats) {
    const c = countryOf(f);
    const it = item(path, f, { id: c.cca3.toLowerCase(), name: c.name.common, aliases: aliasesOf(c) });
    if (it) items.push({ ...it, _area: c.area });
  }
  assignTiers(items, easy, (x) => x._area);
  items.forEach((x) => delete x._area);
  write(id, { id, title, kind: 'area', w: W, h, base, items });
}

console.log('Building maps…');

// US states (already projected to 975x610 Albers)
{
  const fc = topo.feature(usTopo, usTopo.objects.states);
  const path = d3.geoPath(null).digits(1);
  const tiers = {
    1: ['California', 'Texas', 'Florida', 'New York', 'Alaska', 'Hawaii', 'Washington', 'Nevada', 'Arizona', 'Colorado', 'Michigan', 'Illinois'],
    2: ['Oregon', 'Utah', 'Montana', 'Georgia', 'Pennsylvania', 'Ohio', 'Louisiana', 'New Mexico', 'Idaho', 'Wyoming', 'North Carolina', 'Virginia', 'Massachusetts', 'Minnesota'],
    3: ['Kansas', 'Nebraska', 'Oklahoma', 'Tennessee', 'Kentucky', 'Alabama', 'Mississippi', 'Wisconsin', 'Iowa', 'Missouri', 'South Carolina', 'North Dakota', 'South Dakota', 'Maine', 'Indiana', 'New Jersey', 'Arkansas'],
    4: ['West Virginia', 'Maryland', 'Delaware', 'Connecticut', 'Rhode Island', 'Vermont', 'New Hampshire'],
  };
  const tierOf = {};
  for (const [t, names] of Object.entries(tiers)) for (const n of names) tierOf[n] = +t;
  const items = [];
  let base = '';
  for (const f of fc.features) {
    const name = f.properties.name;
    if (!tierOf[name]) {
      base += path(f);
      continue;
    }
    const it = item(path, f, { id: name.toLowerCase().replace(/\s+/g, '-'), name, aliases: [], tier: tierOf[name] });
    items.push(it);
  }
  if (items.length !== 50) console.warn('  ! expected 50 states, got', items.length);
  write('us-states', { id: 'us-states', title: 'US States', kind: 'area', w: 975, h: 610, base, items });
}

const europeProj = () => d3.geoConicConformal().rotate([-15, 0]).parallels([43, 62]);
const europeBox = bboxGeo(-24, 34, 45, 71);
const EU_EXTRA = new Set(['Türkiye', 'Cyprus']);

countryMap({
  id: 'europe-countries',
  title: 'European Countries',
  topoData: w50,
  keep: (c) => c.region === 'Europe' || EU_EXTRA.has(c.name.common),
  projection: europeProj(),
  extentGeo: europeBox,
  easy: ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom', 'Portugal', 'Poland', 'Norway', 'Sweden', 'Finland', 'Greece', 'Ireland', 'Russia', 'Ukraine', 'Iceland', 'Switzerland', 'Netherlands', 'Austria'],
});

countryMap({
  id: 'world-countries',
  title: 'World Countries',
  topoData: w110,
  keep: () => true,
  projection: d3.geoNaturalEarth1(),
  extentGeo: bboxGeo(-180, -58, 180, 84),
  easy: ['United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Australia', 'China', 'India', 'Russia', 'Japan', 'France', 'Germany', 'Italy', 'Spain', 'United Kingdom', 'Egypt', 'South Africa', 'Saudi Arabia', 'Türkiye', 'Indonesia', 'Chile', 'Peru', 'Colombia', 'Nigeria', 'Kenya', 'Iran', 'Mongolia', 'Kazakhstan', 'New Zealand', 'Madagascar', 'Norway', 'Sweden', 'Thailand', 'Pakistan', 'Algeria', 'Morocco'],
});

countryMap({
  id: 'africa-countries',
  title: 'African Countries',
  topoData: w50,
  keep: (c) => c.region === 'Africa',
  projection: d3.geoAzimuthalEqualArea().rotate([-18, -2]),
  extentGeo: bboxGeo(-26, -36, 58, 38),
  easy: ['Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco', 'Algeria', 'Libya', 'Ethiopia', 'Madagascar', 'Sudan', 'DR Congo', 'Tanzania', 'Somalia'],
});

countryMap({
  id: 'asia-countries',
  title: 'Asian Countries',
  topoData: w50,
  keep: (c) => c.region === 'Asia' && c.name.common !== 'Türkiye' && c.name.common !== 'Cyprus',
  projection: d3.geoAzimuthalEqualArea().rotate([-90, -30]),
  extentGeo: bboxGeo(30, -11, 150, 55),
  easy: ['China', 'India', 'Japan', 'Mongolia', 'Saudi Arabia', 'Iran', 'Thailand', 'Indonesia', 'Pakistan', 'Kazakhstan', 'Afghanistan', 'Iraq', 'Vietnam', 'Philippines', 'South Korea', 'North Korea'],
});

countryMap({
  id: 'americas-countries',
  title: 'Countries of the Americas',
  topoData: w50,
  keep: (c) => c.region === 'Americas',
  projection: d3.geoAzimuthalEqualArea().rotate([80, -10]),
  extentGeo: bboxGeo(-140, -56, -35, 72),
  easy: ['United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Venezuela', 'Cuba', 'Bolivia'],
});

// ---------- European rivers ----------
{
  const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const raw = [
    ...rd('scripts/raw/ne_10m_rivers_lake_centerlines.geojson').features,
    ...rd('scripts/raw/ne_10m_rivers_europe.geojson').features,
  ].filter((f) => f.geometry);
  const pts = (c, o = []) => {
    if (typeof c[0] === 'number') o.push(c);
    else for (const x of c) pts(x, o);
    return o;
  };
  const inEu = (f) => pts(f.geometry.coordinates).some(([x, y]) => x > -12 && x < 45 && y > 35 && y < 71);
  const eu = raw.filter(inEu);
  const namesOf = (p) => [p.name, p.name_en, p.name_de, p.name_alt].filter(Boolean);

  // [display name, tier, data names, extra answer aliases]
  const RIVERS = [
    ['Danube', 1, ['Danube'], ['Donau', 'Duna', 'Dunav', 'Dunarea']],
    ['Rhine', 1, ['Rhine', 'Rhein'], ['Rhein', 'Rijn', 'Rhin']],
    ['Volga', 1, ['Volga'], []],
    ['Elbe', 1, ['Elbe'], ['Labe']],
    ['Seine', 1, ['Seine'], []],
    ['Thames', 1, ['Thames'], []],
    ['Loire', 1, ['Loire'], []],
    ['Vistula', 1, ['Vistula'], ['Wisla', 'Weichsel']],
    ['Dnieper', 1, ['Dnieper', 'Dnepre', 'Dnipro', 'Dnepr'], ['Dnipro', 'Dnepr']],
    ['Po', 1, ['Po'], []],
    ['Oder', 2, ['Oder'], ['Odra']],
    ['Ebro', 2, ['Ebro'], []],
    ['Tagus', 2, ['Tagus', 'Tajo'], ['Tajo', 'Tejo']],
    ['Rhône', 2, ['Rhône', 'Rhone'], ['Rhone']],
    ['Don', 2, ['Don'], []],
    ['Douro', 2, ['Duero', 'Douro'], ['Duero']],
    ['Garonne', 2, ['Garonne'], []],
    ['Dniester', 2, ['Dniester'], ['Dnister', 'Nistru']],
    ['Tiber', 2, ['Tiber'], ['Tevere']],
    ['Weser', 2, ['Weser'], []],
    ['Meuse', 2, ['Maas', 'Meuse'], ['Maas']],
    ['Main', 2, ['Main'], []],
    ['Shannon', 2, ['Shannon'], []],
    ['Moselle', 2, ['Mosel', 'Moselle'], ['Mosel']],
    ['Guadalquivir', 3, ['Guadalquivir'], []],
    ['Guadiana', 3, ['Guadiana'], []],
    ['Sava', 3, ['Sava'], []],
    ['Drava', 3, ['Drava', 'Drau'], ['Drau']],
    ['Tisza', 3, ['Tisa', 'Tisza'], ['Tisa', 'Theiss']],
    ['Inn', 3, ['Inn'], []],
    ['Morava', 3, ['Morava'], ['March']],
    ['Prut', 3, ['Prut'], []],
    ['Neva', 3, ['Neva'], []],
    ['Daugava', 3, ['Zapadnaya Dvina', 'Daugava'], ['Western Dvina', 'Zapadnaya Dvina']],
    ['Neman', 3, ['Nemunas', 'Neman'], ['Nemunas', 'Memel']],
    ['Severn', 3, ['Severn'], []],
    ['Scheldt', 3, ['Schelde', 'Scheldt'], ['Schelde', 'Escaut']],
    ['Maritsa', 3, ['Maritsa'], ['Evros', 'Meric']],
    ['Pripyat', 3, ['Pripyat', 'Prypiat'], ['Prypiat']],
    ['Southern Bug', 3, ['Southern Bug'], ['Pivdennyi Buh']],
    ['Northern Dvina', 3, ['Severnaya Dvina'], ['Severnaya Dvina']],
    ['Vltava', 3, ['Vltava'], ['Moldau']],
    ['Saône', 3, ['Saône'], ['Saone']],
    ['Dordogne', 3, ['Dordogne'], []],
    ['Adige', 3, ['Adige'], ['Etsch']],
    ['Mureș', 3, ['Mures'], ['Mures', 'Maros']],
    ['Olt', 3, ['Olt'], []],
    ['Warta', 3, ['Warta'], []],
    ['Ems', 4, ['Ems'], []],
    ['Mur', 4, ['Mur'], ['Mura']],
    ['Ticino', 4, ['Ticino'], []],
    ['Siret', 4, ['Siret'], []],
    ['Neretva', 4, ['Neretva'], []],
    ['Drina', 4, ['Drina'], []],
    ['Trent', 4, ['Trent'], []],
    ['Tweed', 4, ['Tweed'], []],
    ['Marne', 4, ['Marne'], []],
    ['Durance', 4, ['Durance'], []],
    ['Tarn', 4, ['Tarn'], []],
    ['Charente', 4, ['Charente'], []],
    ['Adour', 4, ['Adour'], []],
    ['Saar', 4, ['Saar'], ['Sarre']],
    ['Salzach', 4, ['Salzach'], []],
    ['Enns', 4, ['Enns'], []],
    ['San', 4, ['San'], []],
    ['Narva', 4, ['Narva'], []],
    ['Kemijoki', 4, ['Kemijoki'], []],
    ['Iskar', 4, ['Iskar'], []],
    ['Vjosë', 4, ['Vjosë'], ['Vjosa', 'Aoos']],
    ['Drin', 4, ['Drin'], []],
    ['Minho', 4, ['Minho', 'Mino'], ['Miño', 'Mino']],
    ['Mondego', 4, ['Mondego'], []],
    ['Volturno', 4, ['Volturno'], []],
    ['Desna', 4, ['Desna'], []],
    ['Sozh', 4, ['Sozh'], []],
    ['Donets', 4, ['Donets'], ['Seversky Donets', 'Siverskyi Donets']],
    ['Kuban', 4, ['Kuban'], []],
    ['Oka', 4, ['Oka'], []],
    ['Volkhov', 4, ['Volkhov'], []],
    ['Onega', 4, ['Onega'], []],
    ['Glomma', 4, ['Glomma', 'Glma'], []],
    ['Hron', 4, ['Hron'], ['Gran']],
    ['Lippe', 4, ['Lippe'], []],
    ['Fulda', 4, ['Fulda'], []],
    ['Unstrut', 4, ['Unstrut'], []],
    ['Tormes', 4, ['Tormes'], []],
    ['Jalón', 4, ['Jalón'], ['Jalon']],
  ];

  const { path, h } = setup(europeProj(), europeBox);
  const fc = topo.feature(w50, w50.objects.countries);
  const base = fc.features.map((f) => path(f)).filter(Boolean).join('');
  const used = new Set();
  const items = [];
  for (const [name, tier, dataNames, aliases] of RIVERS) {
    const want = new Set(dataNames);
    const feats = eu.filter((f) => namesOf(f.properties).some((n) => want.has(n)));
    if (!feats.length) {
      console.warn('  ! river not found:', name);
      continue;
    }
    feats.forEach((f) => used.add(f));
    const geom = { type: 'MultiLineString', coordinates: [] };
    for (const f of feats) {
      if (f.geometry.type === 'LineString') geom.coordinates.push(f.geometry.coordinates);
      else geom.coordinates.push(...f.geometry.coordinates);
    }
    const it = item(path, { type: 'Feature', geometry: geom }, { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, aliases, tier, kind: 'line' });
    if (it) items.push(it);
  }
  const baseLines = eu
    .filter((f) => !used.has(f) && f.properties.scalerank <= 8)
    .map((f) => path(f))
    .filter(Boolean)
    .join('');
  write('europe-rivers', { id: 'europe-rivers', title: 'European Rivers', kind: 'line', w: W, h, base, baseLines, items });
}

// ---------- capitals ----------
{
  const list = countries
    .filter((c) => isCountry(c) && c.capital?.length)
    .map((c) => ({
      id: c.cca3.toLowerCase(),
      country: c.name.common,
      capital: c.capital[0],
      region: c.region,
      area: c.area,
    }));
  fs.writeFileSync(`${OUT}/capitals.json`, JSON.stringify(list));
  console.log(`  capitals.json  ${list.length} countries`);
}
console.log('Done.');
