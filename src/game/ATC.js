// Situational air traffic control, AWACS and crew coordination. Watches the
// player's flight and the battle, and talks on the shared Radio with real
// phraseology: take-off clearances, departure and approach hand-offs, ILS
// vectors, landing clearances, crew and radio-altimeter callouts, TCAS,
// traffic advisories, AWACS pictures and BRAA calls, splash confirmations,
// background chatter and the mission's story lines.
import * as THREE from 'three';

const FT = 3.28084;
const NM = 1852;
const KT = 1.94384;
const TAN3 = Math.tan(THREE.MathUtils.degToRad(3));

// ---------------------------------------------------------------- phrase helpers
const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const PHONETIC = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima'];
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// digit by digit, the way controllers read frequencies, headings and runways
export function sayDigits(v) {
  return String(v).split('').map((c) => (c === '.' ? 'decimal' : c >= '0' && c <= '9' ? DIG[+c] : '')).filter(Boolean).join(' ');
}

// plain English number for counts and ranges ("thirty-two")
export function sayNumber(n) {
  n = Math.round(Math.abs(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + sayNumber(n % 100) : '');
  if (n < 1e6) return sayNumber(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + sayNumber(n % 1000) : '');
  return String(n);
}

// "five thousand", "three thousand five hundred", "flight level one eight zero"
export function sayAltitude(ft) {
  ft = Math.max(0, Math.round(ft / 100) * 100);
  if (ft >= 18000) return 'flight level ' + sayDigits(String(Math.round(ft / 100)).padStart(3, '0'));
  const th = Math.floor(ft / 1000), hu = Math.round((ft % 1000) / 100);
  let s = th ? sayDigits(th) + ' thousand' : '';
  if (hu) s += (s ? ' ' : '') + DIG[hu] + ' hundred';
  return s || 'zero';
}

export function fmtAltitude(ft) {
  ft = Math.max(0, Math.round(ft / 100) * 100);
  if (ft >= 18000) return 'FL' + String(Math.round(ft / 100)).padStart(3, '0');
  return ft.toLocaleString('en-US') + ' ft';
}

export function normDeg(d) {
  return ((d % 360) + 360) % 360;
}

// heading convention: 0 = -Z ("north"), 90 = +X ("east")
export function bearingDeg(fromX, fromZ, toX, toZ) {
  return normDeg(THREE.MathUtils.radToDeg(Math.atan2(toX - fromX, -(toZ - fromZ))));
}

export function runwayDesignator(headingDeg) {
  let n = Math.round(normDeg(headingDeg) / 10);
  if (n === 0) n = 36;
  return String(n).padStart(2, '0');
}

export function sayHeading(deg) {
  const h = Math.round(normDeg(deg) / 10) * 10 || 360;
  return sayDigits(String(h).padStart(3, '0'));
}

export function fmtHeading(deg) {
  return String(Math.round(normDeg(deg) / 10) * 10 || 360).padStart(3, '0');
}

export function sayFreq(f) {
  const [a, b = '0'] = String(f).split('.');
  const dec = b.replace(/0+$/, '') || '0';
  return sayDigits(`${a}.${dec}`);
}

// relative bearing (deg, 0 = nose) -> clock position 1..12
export function clockPosition(relDeg) {
  let c = Math.round(normDeg(relDeg) / 30);
  if (c === 0) c = 12;
  return c;
}

export function compassDir(deg) {
  return COMPASS[Math.round(normDeg(deg) / 45) % 8];
}

// Bearing, range, altitude and aspect of a target as seen from `from`
export function braa(from, target, targetVel) {
  const bearing = bearingDeg(from.x, from.z, target.x, target.z);
  const range = Math.hypot(target.x - from.x, target.z - from.z);
  let aspect = 'hot';
  const sp = targetVel ? Math.hypot(targetVel.x, targetVel.z) : 0;
  if (sp > 5) {
    // angle between the target's track and the line from it to us
    const toUs = bearingDeg(target.x, target.z, from.x, from.z);
    const trk = bearingDeg(0, 0, targetVel.x, targetVel.z);
    const off = Math.abs(((trk - toUs + 540) % 360) - 180);
    aspect = off < 35 ? 'hot' : off > 145 ? 'cold' : off > 65 && off < 115 ? 'beaming' : 'flanking';
  }
  return { bearing, rangeNm: range / NM, altFt: target.y * FT, aspect };
}

// a phrase with a spoken form (TTS) and a display form (HUD transcript)
const P = (s, d = s) => ({ s, d });
function msg(strings, ...vals) {
  let s = '', d = '';
  strings.forEach((str, i) => {
    s += str;
    d += str;
    if (i < vals.length) {
      const v = vals[i];
      if (v && typeof v === 'object') { s += v.s; d += v.d; } else if (v !== undefined && v !== null) { s += v; d += v; }
    }
  });
  return { s: s.replace(/\s+/g, ' ').trim(), d: d.replace(/\s+/g, ' ').trim() };
}

// ---------------------------------------------------------------- facilities
const FACILITIES = {
  pacific: { name: 'Atoll', full: 'Atoll', tower: '118.700', ground: '121.800', approach: '119.450', departure: '124.350', awacs: '251.000', atis: '127.850' },
  canyon: { name: 'Red Rock', full: 'Red Rock', tower: '118.300', ground: '121.650', approach: '120.900', departure: '125.450', awacs: '264.300' },
  alps: { name: 'Alpine', full: 'Alpine', tower: '119.100', ground: '121.750', approach: '127.350', departure: '126.200', awacs: '255.600' },
  arctic: { name: 'Fjord', full: 'Fjord', tower: '118.950', ground: '121.900', approach: '123.800', departure: '124.700', awacs: '282.800' },
  highlands: { name: 'Highland', full: 'Highland', tower: '118.500', ground: '121.700', approach: '120.250', departure: '125.900', awacs: '269.100' },
  metro: { name: 'Metro Bay', full: 'Metro Bay International', tower: '119.250', ground: '121.925', approach: '124.550', departure: '127.150', awacs: '258.400', civil: true },
  desert: { name: 'Desert City', full: 'Desert City International', tower: '118.200', ground: '121.850', approach: '124.850', departure: '127.600', awacs: '276.400', civil: true },
};

const FIGHTER_CALLSIGN = {
  f16: 'Viper', fa18: 'Rhino', typhoon: 'Typhoon', mig29: 'Fulcrum', su35: 'Flanker', f22: 'Raptor', f15: 'Eagle',
  f35: 'Lightning', f14: 'Tomcat', rafale: 'Rafale', gripen: 'Gripen', tejas: 'Tejas', mirage: 'Mirage', su57: 'Felon',
  j20: 'Dragon', mig21: 'Fishbed', a10: 'Hawg',
};
const AIRLINE_CALLSIGN = {
  'AERO NOVA': 'Nova', SKYWARD: 'Skyward', 'PACIFIC AZURE': 'Azure', 'ROYAL SAHARA': 'Sahara', 'NORDIC STAR': 'Nordic',
  'AERO SST': 'Aero', ANTONOV: 'Antonov',
};
const HEAVY = new Set(['b777', 'b747', 'an124']);
const SUPER = new Set(['a380']);
const AIRBUS = new Set(['a320', 'a380']);
const TYPE_NAME = {
  a320: P('an Airbus A three twenty', 'A320'), b737: P('a Boeing seven three seven', 'B737'), b777: P('a Boeing triple seven', 'B777'),
  b747: P('a Boeing seven four seven', 'B747'), a380: P('an Airbus A three eighty', 'A380'), concorde: P('a Concorde', 'CONC'),
  an124: P('an Antonov one twenty-four', 'A124'),
};
const BRAKING = {
  wet: P('Runway wet, condition code five five five, braking action good.', 'RWY WET, RWYCC 5/5/5, braking action good.'),
  snow: P('Runway condition code three three three, snow, braking action medium.', 'RWYCC 3/3/3 snow, braking action medium.'),
  ice: P('Runway condition code one one one, ice, braking action poor.', 'RWYCC 1/1/1 ice, braking action poor.'),
};

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "SKYWARD 512" -> Skyward five one two (+ heavy / super)
function trafficCallsign(ac) {
  const label = String(ac.label || ac.callsign || 'TRAFFIC');
  const m = label.match(/^([A-Z ]*?[A-Z])\s*(\d+)$/i);
  const id = ac.spec && ac.spec.id;
  const suffix = HEAVY.has(id) ? P(' heavy', ' HEAVY') : SUPER.has(id) ? P(' super', ' SUPER') : P('', '');
  if (!m) return P(cap(label.toLowerCase()) + suffix.s, label + suffix.d);
  const name = m[1].trim().toLowerCase().split(/\s+/).map(cap).join(' ');
  return P(`${name} ${sayDigits(m[2])}${suffix.s}`, `${label}${suffix.d}`);
}

export class ATC {
  constructor(game, battle, mission, radio) {
    this.game = game;
    this.battle = battle;
    this.mission = mission;
    this.radio = radio;
    this.map = battle.map;
    const id = this.map.def.id;
    this.fac = FACILITIES[id] || FACILITIES.pacific;
    this.rand = rng(hashStr(`${mission.def.id}:${id}:${mission.options.jetId || ''}`));
    const f = this.fac;
    this.st = {
      tower: { id: 'tower', name: `${f.name} Tower`, short: 'TWR', freq: f.tower, kind: 'atc', voice: 'tower' },
      ground: { id: 'ground', name: `${f.name} Ground`, short: 'GND', freq: f.ground, kind: 'atc', voice: 'ground' },
      approach: { id: 'approach', name: `${f.name} Approach`, short: 'APP', freq: f.approach, kind: 'atc', voice: 'approach' },
      departure: { id: 'departure', name: `${f.name} Departure`, short: 'DEP', freq: f.departure, kind: 'atc', voice: 'departure' },
      awacs: { id: 'awacs', name: 'Overlord', short: 'AWACS', freq: f.awacs, kind: 'awacs', voice: 'awacs' },
      crew: { id: 'crew', name: 'First Officer', short: 'CREW', freq: '', kind: 'crew', voice: 'crew' },
      pf: { id: 'pf', name: 'Captain', short: 'YOU', freq: '', kind: 'player', voice: 'player' },
    };
    this.pilots = new Map();
    this.time = 0;
    this.timers = [];
    this.scanT = 0;
    this.slowT = 0.5;
    this.known = new WeakSet();
    this.trafficTimes = new WeakMap();
    this.checkedIn = false;
    this.groupHold = 0;
    this.quietT = 0;
    this.chatterGap = 22 + this.rand() * 25;
    this.lastReq = -99;
    this.ended = false;
    this.disposed = false;
    this.boomCity = false;
    this.boomField = false;
    this.boomGood = false;
    this.chuteNoted = false;
    this.escortFlags = new WeakMap();
    this.rangeFlags = new WeakMap();
    this.pictureT = 0;
    this.fieldThreat = false;
    this.g = { agl: 0, fieldAgl: 0, u: 0, v: 0, dist: 0, hdg: 0, gs: 0, vs: 0, altFt: 0 };
    this.p = null;
    this.s = null;
    this.cs = this._callsign(battle.player);
    this.ap = null;
    this.wx = this._weather();
    // current ATIS broadcast: pilots quote its letter on first contact
    this.atis = PHONETIC[Math.floor(this.rand() * PHONETIC.length)];
  }

  get level() {
    return (this.game.settings && this.game.settings.atc) || 'full';
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this._newSortie(this.battle.player);
    this._after(1.6, () => this._opening());
  }

  dispose() {
    this.disposed = true;
    this.timers.length = 0;
  }

  update(dt) {
    if (this.disposed) return;
    try {
      this.time += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i];
        t.t -= dt;
        if (t.t <= 0) {
          this.timers.splice(i, 1);
          t.fn();
        }
      }
      const p = this.battle.player;
      if (p !== this.p) this._respawned(p);
      if (!p || !this.s) return;
      if (!p.alive || p.dying) {
        if (!this.s.down) this._playerDown(p);
        return;
      }
      this._geom(p);
      this._fast(dt, p);
      this.scanT -= dt;
      if (this.scanT <= 0) {
        this.scanT = 0.25;
        this._scan(p);
      }
      this.slowT -= dt;
      if (this.slowT <= 0) {
        this.slowT = 1;
        this._slow(p);
      }
    } catch (e) {
      // the radio must never take the game down with it
      if (!this._warned) { this._warned = true; console.warn('ATC error', e); }
    }
  }

  _after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  _newSortie(p) {
    this.p = p;
    const civil = !!(p && p.spec.civil);
    this.cs = this._callsign(p);
    this.s = {
      phase: p && p.fm.onGround ? 'parked' : 'air',
      cleared: false, departedHere: false, handoff: false, wasAirborne: !!(p && !p.fm.onGround),
      maxRoll: 0, rto: false, tc: {}, posRate: false, gearUpCalled: false, td: null,
      landTime: 0, stoppedT: 0, vacate: false, groundCall: false, firm: false, decelPrev: false, seventy: false,
      hitLight: -99, hitBad: false, down: false, crashCalled: false, outCalled: false, ceilingT: -99,
      ra: new Set(), raPrev: 9999, tcas: 'none', missileT: -99, gearPrev: p ? p.controls.gear : false,
      vSpeeds: null, civil, flightTime: 0, abPrev: 'OFF',
    };
    this.ap = this._freshApproach();
  }

  _freshApproach() {
    return { stage: 'none', dir: 1, since: 0, vectors: 0, vectorT: -99, handoff: false, cleared: false, shortFinal: false, wheels: false, goAround: false, lowAltT: -99, high: false, reflyAt: 0, minAgl: 9999 };
  }

  _respawned(p) {
    const prev = this.p;
    this._newSortie(p);
    if (!p || !prev) return;
    // free-flight respawn: back on the runway, or a fresh air start
    if (p.fm.onGround) this._after(2.5, () => this._clearTakeoff());
  }

  // ---------------------------------------------------------------- callsigns / stations
  _callsign(p) {
    if (!p) return P('Viper one one', 'VIPER 11');
    const spec = p.spec;
    if (this.mission.def.id === 'm19') return P('Atlas one heavy', 'ATLAS 1 HEAVY');
    if (spec.civil) {
      const airline = spec.livery && spec.livery.airline;
      const name = AIRLINE_CALLSIGN[airline] || (airline ? cap(airline.split(' ')[0].toLowerCase()) : 'Civil');
      const num = String(100 + (hashStr(spec.id + this.map.def.id) % 899));
      const sfx = HEAVY.has(spec.id) ? P(' heavy', ' HEAVY') : SUPER.has(spec.id) ? P(' super', ' SUPER') : P('', '');
      return P(`${name} ${sayDigits(num)}${sfx.s}`, `${name.toUpperCase()} ${num}${sfx.d}`);
    }
    const name = FIGHTER_CALLSIGN[spec.id] || cap(String(spec.name || 'Viper').split(/[\s-]/)[0].toLowerCase());
    return P(`${name} one one`, `${name.toUpperCase()} 11`);
  }

  // the player's own station, tuned to whoever they are talking to
  _me(to) {
    return { id: 'player', name: this.cs.d, short: 'YOU', freq: to ? to.freq : '', kind: 'player', voice: 'player' };
  }

  _pilot(name) {
    let st = this.pilots.get(name);
    if (!st) {
      st = { id: 'pilot-' + name, name, short: name.split(' ')[0].slice(0, 5).toUpperCase(), freq: this.fac.awacs, kind: 'pilot', voice: /heavy/i.test(name) ? 'heavy' : 'wingman' };
      this.pilots.set(name, st);
    }
    return st;
  }

  _trafficStation(ac) {
    const name = String(ac.label || ac.callsign || 'TRAFFIC');
    return { id: 'tfc' + ac.id, name, short: 'TFC', freq: this.fac.approach, kind: 'traffic', voice: ac.id % 2 ? 'traffic1' : 'traffic2' };
  }

  // ---------------------------------------------------------------- talking
  _say(station, m, opts = {}) {
    if (this.disposed || !station || !m) return false;
    if (this.level === 'off' && !opts.story && station.kind !== 'crew') return false;
    const o = {
      display: m.d, priority: opts.priority ?? 1, key: opts.key, minInterval: opts.minInterval,
      expires: opts.expires, delay: opts.delay, squelch: opts.squelch, signal: opts.signal ?? this._signal(station),
    };
    if (opts.readback) o.readback = this._rb(opts.readback);
    return this.radio.transmit(station, m.s, o);
  }

  _rb(r) {
    return { station: r.st, text: r.m.s, display: r.m.d, readback: r.next ? this._rb(r.next) : undefined };
  }

  // How well we hear a station: ground stations fade with distance and when
  // terrain blocks line of sight down low; AWACS orbits high and stays strong.
  _signal(station) {
    const p = this.battle.player;
    if (!p || !station) return 1;
    if (station.kind === 'player' || station.kind === 'crew') return 1;
    if (station.kind === 'awacs') return 0.85;
    if (station.kind === 'traffic') return 0.45 + ((station.id.length * 7) % 5) * 0.08;
    if (station.kind === 'pilot') return 0.75;
    const ab = this.map.airbase;
    const km = Math.hypot(p.position.x - ab.x, p.position.z - ab.z) / 1000;
    let s = 1 - THREE.MathUtils.smoothstep(km, 12, 70) * 0.75;
    const agl = p.position.y - ab.elevation;
    if (km > 18 && agl < 400) s -= 0.2;
    return s;
  }

  _crew(text, opts = {}) {
    return this._say(this.st.crew, P(text), { priority: 2, expires: 4, ...opts });
  }

  _pfSay(text, opts = {}) {
    return this._say(this.st.pf, P(text), { priority: 2, expires: 4, squelch: false, ...opts });
  }

  // ---------------------------------------------------------------- weather / runways
  _weather() {
    const r = this.rand;
    const base = this._expectedLandingHeading();
    const dir = Math.round(normDeg(base + (r() - 0.5) * 50) / 10) * 10 || 360;
    const spd = 4 + Math.floor(r() * 11);
    const gust = r() < 0.3 ? spd + 6 + Math.floor(r() * 5) : 0;
    const qnh = 1003 + Math.floor(r() * 21);
    return { dir, spd, gust, qnh };
  }

  _expectedLandingHeading() {
    const ab = this.map.airbase;
    const st = this.mission.start;
    if (st && !st.runway && st.pos) {
      const { u } = this.map.toAirbaseLocal(st.pos.x, st.pos.z);
      if (u > ab.length / 2 + 1000) return normDeg(ab.heading + 180);
    }
    return ab.heading;
  }

  _wind() {
    const w = this.wx;
    const dd = String(w.dir).padStart(3, '0');
    const sp = String(w.spd).padStart(2, '0');
    if (w.gust) return P(`wind ${sayDigits(dd)} at ${sayDigits(w.spd)}, gusting ${sayDigits(w.gust)}`, `wind ${dd}/${sp}G${w.gust}`);
    return P(`wind ${sayDigits(dd)} at ${sayDigits(w.spd)}`, `wind ${dd}/${sp}`);
  }

  _altimeter() {
    const q = this.wx.qnh;
    if (this.game.settings.units === 'metric') return P(`QNH ${sayDigits(q)}`, `QNH ${q}`);
    const inch = (q * 0.02953).toFixed(2);
    return P(`altimeter ${sayDigits(inch.replace('.', ''))}`, `altimeter ${inch}`);
  }

  _rwy(headingDeg) {
    const des = runwayDesignator(headingDeg);
    return P(sayDigits(des), des);
  }

  _braking() {
    const rc = this.map.runwayCondition;
    return rc && BRAKING[rc.condition] ? BRAKING[rc.condition] : null;
  }

  _freqP(st) {
    return P(sayFreq(st.freq), st.freq);
  }

  _alt(ft) {
    return P(sayAltitude(ft), fmtAltitude(ft));
  }

  _fieldFt() {
    return this.map.airbase.elevation * FT;
  }

  // ---------------------------------------------------------------- geometry
  _geom(p) {
    const g = this.g, map = this.map, ab = map.airbase, pos = p.position, vel = p.velocity;
    g.agl = pos.y - map.surfaceAt(pos.x, pos.z, pos.y);
    g.fieldAgl = pos.y - ab.elevation;
    const loc = map.toAirbaseLocal(pos.x, pos.z);
    g.u = loc.u;
    g.v = loc.v;
    g.dist = Math.hypot(pos.x - ab.x, pos.z - ab.z);
    g.gs = Math.hypot(vel.x, vel.z);
    g.vs = vel.y;
    g.altFt = pos.y * FT;
    g.hdg = g.gs > 15 ? bearingDeg(0, 0, vel.x, vel.z) : p.fm.attitude(this._att || (this._att = {})).heading;
    g.onRunway = map.isOnRunway(pos.x, pos.z);
    return g;
  }

  // +1 = landing in the runway's heading direction, -1 = the reciprocal
  _pickDir() {
    const g = this.g, ab = this.map.airbase;
    if (Math.abs(g.u) > ab.length / 2 + 2500) return g.u < 0 ? 1 : -1;
    const along = this.p.velocity.x * ab.dirX + this.p.velocity.z * ab.dirZ;
    return along >= 0 ? 1 : -1;
  }

  _landHdg(dir) {
    const ab = this.map.airbase;
    return dir > 0 ? ab.heading : normDeg(ab.heading + 180);
  }

  // distance before the landing threshold and lateral offset from the centreline
  _final(dir) {
    const ab = this.map.airbase, g = this.g;
    const uTh = -dir * ab.length / 2;
    const along = (uTh - g.u) * dir;
    const lat = g.v * dir;
    const hdgErr = Math.abs(((g.hdg - this._landHdg(dir) + 540) % 360) - 180);
    return { along, lat, hdgErr, aligned: hdgErr < 30 };
  }

  _takeoffHdg() {
    const ab = this.map.airbase;
    const h = this.p ? this.p.fm.attitude(this._att || (this._att = {})).heading : ab.heading;
    const d = Math.abs(((h - ab.heading + 540) % 360) - 180);
    return d < 90 ? ab.heading : normDeg(ab.heading + 180);
  }

  _hostileAir() {
    const out = [];
    for (const a of this.battle.aircraft) if (a.alive && !a.dying && a.team === 'enemy') out.push(a);
    return out;
  }

  _groundTargets() {
    const out = [];
    for (const u of this.battle.ground) if (u.alive && u.isTarget && u.team !== 'player') out.push(u);
    return out;
  }

  _combat() {
    return this._hostileAir().length > 0 || this._groundTargets().length > 0;
  }

  _hasLand() {
    return this.mission.objectives.some((o) => o.type === 'land');
  }

  _ringsLeft() {
    const r = this.mission.rings;
    if (!r || r.done) return 0;
    return Math.max(0, r.points.length - (r.index ?? 0));
  }

  _requiredRings() {
    return this.mission.objectives.some((o) => o.type === 'rings');
  }

  // greedy clustering of hostile aircraft into groups (6 km)
  _groups(list) {
    const groups = [];
    for (const a of list) {
      let g = null;
      for (const gr of groups) {
        if (a.position.distanceTo(gr.lead.position) < 6000) { g = gr; break; }
      }
      if (g) g.members.push(a);
      else groups.push({ lead: a, members: [a] });
    }
    return groups;
  }

  _nearestGroup(p, groups) {
    let best = null, bd = Infinity;
    for (const gr of groups) {
      for (const m of gr.members) {
        const d = m.position.distanceTo(p.position);
        if (d < bd) { bd = d; best = { gr, m }; }
      }
    }
    return best;
  }

  _braaP(p, ac, tail = 'hostile') {
    const b = braa(p.position, ac.position, ac.velocity);
    const rng = Math.max(1, Math.round(b.rangeNm));
    const ang = Math.max(1, Math.round(b.altFt / 1000));
    const bs = String(Math.round(b.bearing) % 360).padStart(3, '0');
    return P(
      `bra ${sayDigits(bs)}, ${sayNumber(rng)}, ${sayNumber(ang)} thousand, ${b.aspect}, ${tail}`,
      `BRAA ${bs}/${rng} ${ang}K ${b.aspect.toUpperCase()} ${tail.toUpperCase()}`,
    );
  }

  _clock(p, pos) {
    const rel = bearingDeg(p.position.x, p.position.z, pos.x, pos.z) - this.g.hdg;
    return clockPosition(rel);
  }

  // ---------------------------------------------------------------- opening calls
  _opening() {
    const p = this.battle.player;
    if (!p || this.ended) return;
    this._geom(p);
    const m = this.mission;
    const cs = this.cs;
    if (m.start && m.start.runway) {
      // only while actually holding on the runway (not already rolling or airborne)
      if (!p.fm.onGround || this.g.gs > 3) return;
      const rw = this._rwy(this._takeoffHdg());
      this._say(this._me(this.st.tower), msg`${this.fac.name} tower, ${cs}, holding short runway ${rw}, with ${this.atis}, ready for departure.`, { priority: 2 });
      this._lineUp(true);
      return;
    }
    if (this._hasLand() && (!this._requiredRings() || this._ringsLeft() <= 3)) {
      this._beginApproach('checkin');
      return;
    }
    const hasBoom = m.objectives.some((o) => o.type === 'boom');
    if (hasBoom) {
      this._say(this.st.awacs, msg`${cs}, Overlord, radar contact. The range is cold and clear, you are cleared supersonic over the water. Stay below four hundred feet.`, { priority: 2 });
      return;
    }
    if (this._combat() || m.objectives.some((o) => o.type === 'destroy' || o.type === 'escort')) {
      this._say(this._me(this.st.awacs), msg`Overlord, ${cs}, checking in.`, { priority: 2 });
      this._awacsPicture(2);
      return;
    }
    if (m.ceilingAlt !== null && m.ceilingAlt !== undefined) {
      this._say(this.st.awacs, msg`${cs}, Overlord, radar contact. Enemy radar is up, stay low and keep below the rim.`, { priority: 2 });
      return;
    }
    if (m.rings && !m.rings.done) {
      this._say(this.st.tower, msg`${cs}, ${this.fac.name} tower, radar contact. The course is active, cleared for the course, report complete.`, { priority: 2, readback: { st: this._me(this.st.tower), m: msg`Cleared for the course, ${cs}.` } });
      return;
    }
    // free flight, nothing to fight: approach control keeps an eye on you
    const g = this.g;
    const nm = Math.max(1, Math.round(g.dist / NM));
    const dir = compassDir(bearingDeg(this.map.airbase.x, this.map.airbase.z, p.position.x, p.position.z));
    this._say(this.st.approach, msg`${cs}, ${this.fac.name} approach, radar contact, ${P(sayNumber(nm), String(nm))} miles ${dir} of the field. ${this.fac.name} ${this._altimeter()}. Manoeuvre at your discretion, advise ready for the approach.`, {
      priority: 1, readback: { st: this._me(this.st.approach), m: msg`${this._altimeter()}, wilco, ${cs}.` },
    });
  }

  _awacsPicture(priority = 2) {
    const p = this.battle.player;
    if (!p) return;
    const cs = this.cs;
    const air = this._hostileAir();
    for (const a of air) this.known.add(a);
    this.checkedIn = true;
    this.groupHold = this.time + 4;
    if (air.length) {
      const groups = this._groups(air);
      const near = this._nearestGroup(p, groups);
      const n = groups.length;
      const count = n === 1 ? P('single group', 'single group') : P(`${sayNumber(n)} groups`, `${n} groups`);
      this._say(this.st.awacs, msg`${cs}, Overlord, radar contact. Picture, ${count}. Closest group ${this._braaP(p, near.m)}.`, { priority });
      return;
    }
    const tg = this._nearestTarget(p);
    if (tg) {
      const b = braa(p.position, tg.position, null);
      const r = Math.max(1, Math.round(b.rangeNm));
      const bs = String(Math.round(b.bearing) % 360).padStart(3, '0');
      const sams = this._groundTargets().some((u) => u.type === 'sam') ? P(' Expect SAM activity.') : P('');
      this._say(this.st.awacs, msg`${cs}, Overlord, radar contact. Target area bearing ${P(sayDigits(bs), bs)}, ${P(sayNumber(r), String(r))} miles.${sams}`, { priority });
      return;
    }
    this._say(this.st.awacs, msg`${cs}, Overlord, radar contact, picture clean.`, { priority });
  }

  _nearestTarget(p) {
    let best = null, bd = Infinity;
    for (const u of this._groundTargets()) {
      const d = u.position.distanceTo(p.position);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  // ---------------------------------------------------------------- take-off / departure
  _clearTakeoff(force = false, firstContact = false) {
    const p = this.battle.player;
    if (!p || !p.alive || this.ended || !this.s || (this.s.cleared && !force)) return;
    const s = this.s, cs = this.cs;
    s.cleared = true;
    const rw = this._rwy(this._takeoffHdg());
    const brk = this._braking();
    const extra = brk ? P(' ' + brk.s, ' ' + brk.d) : P('');
    // a controller only names the facility on first contact
    const who = firstContact ? P(`, ${this.fac.name} tower`) : P('');
    this._say(this.st.tower, msg`${cs}${who}, ${this._wind()}, runway ${rw}, cleared for takeoff.${extra}`, {
      priority: 2, expires: 20,
      readback: { st: this._me(this.st.tower), m: msg`Cleared for takeoff runway ${rw}, ${cs}.` },
    });
  }

  // "Line up and wait" with the departure clearance, then cleared for take-off
  _lineUp(firstContact) {
    const s = this.s, cs = this.cs;
    if (!s || s.cleared || s.lineUp) return;
    s.lineUp = true;
    const rw = this._rwy(this._takeoffHdg());
    const alt = Math.round((this._fieldFt() + (this._combat() ? 6000 : 4000)) / 1000) * 1000;
    s.assignedAlt = alt;
    const sq = String(1200 + Math.floor(this.rand() * 5000)).replace(/[89]/g, '7');
    s.squawk = sq;
    const who = firstContact ? P(`, ${this.fac.name} tower`) : P('');
    this._say(this.st.tower, msg`${cs}${who}, runway ${rw}, line up and wait. After departure fly runway heading, climb and maintain ${this._alt(alt)}, squawk ${P(sayDigits(sq), sq)}.`, {
      priority: 2, expires: 20,
      readback: { st: this._me(this.st.tower), m: msg`Line up and wait runway ${rw}, runway heading, ${this._alt(alt)}, squawk ${P(sayDigits(sq), sq)}, ${cs}.` },
    });
    this._after(9, () => this._clearTakeoff(false, false));
  }

  _handoffDeparture() {
    const s = this.s, cs = this.cs;
    s.handoff = true;
    if (this._combat()) {
      const aw = this.st.awacs;
      this._say(this.st.tower, msg`${cs}, contact Overlord on ${this._freqP(aw)}, good hunting.`, {
        priority: 1, readback: { st: this._me(this.st.tower), m: msg`Overlord, ${this._freqP(aw)}, ${cs}.` },
      });
      this._after(7, () => {
        this._say(this._me(aw), msg`Overlord, ${cs}, airborne, checking in.`, { priority: 2 });
        this._awacsPicture(2);
      });
      return;
    }
    const dep = this.st.departure;
    this._say(this.st.tower, msg`${cs}, contact departure ${this._freqP(dep)}, good day.`, {
      priority: 1, readback: { st: this._me(this.st.tower), m: msg`Departure ${this._freqP(dep)}, good day, ${cs}.` },
    });
    this._after(7, () => {
      const p = this.battle.player;
      if (!p || !p.alive || this.ended) return;
      const cur = Math.round((p.position.y * FT) / 100) * 100;
      const r = this.mission.rings;
      let target, tail;
      if (r && !r.done && r.points[r.index ?? 0]) {
        target = Math.max(cur + 500, Math.round((r.points[r.index ?? 0].y * FT) / 500) * 500);
        tail = P(', proceed via the corridor');
      } else {
        target = Math.max(Math.round((this._fieldFt() + 5000) / 1000) * 1000, Math.round((cur + 3000) / 1000) * 1000);
        tail = P(', proceed on course');
      }
      target = Math.min(target, 24000);
      this.s.assignedAlt = target;
      this.s.levelReported = false;
      this._say(this._me(dep), msg`${this.fac.name} departure, ${cs}, passing ${this._alt(cur)}.`, { priority: 1 });
      this._say(dep, msg`${cs}, ${this.fac.name} departure, radar contact, climb and maintain ${this._alt(target)}${tail}.`, {
        priority: 1, readback: { st: this._me(dep), m: msg`Climb and maintain ${this._alt(target)}, ${cs}.` },
      });
    });
  }

  _rejectTakeoff() {
    const s = this.s, cs = this.cs;
    if (s.rto) return;
    s.rto = true;
    s.phase = 'rto';
    this._say(this._me(this.st.tower), msg`${cs}, stopping, rejecting takeoff.`, { priority: 2 });
    this._say(this.st.tower, msg`${cs}, roger, hold position. Advise when able.`, { priority: 2 });
  }

  // ---------------------------------------------------------------- approach & landing
  _beginApproach(reason) {
    const ap = this.ap, p = this.battle.player;
    if (!p || this.ended || (ap.stage !== 'none' && ap.stage !== 'goaround')) return false;
    this._geom(p);
    const g = this.g, cs = this.cs, app = this.st.approach;
    ap.stage = 'approach';
    ap.dir = this._pickDir();
    ap.since = this.time;
    ap.handoff = ap.cleared = ap.ils = ap.shortFinal = ap.wheels = ap.goAround = false;
    ap.vectors = 0;
    ap.vectorT = this.time;
    const rw = this._rwy(this._landHdg(ap.dir));
    const f = this._final(ap.dir);
    const fieldFt = this._fieldFt();
    const cur = g.altFt;
    const nm = Math.max(1, Math.round(g.dist / NM));
    const where = compassDir(bearingDeg(this.map.airbase.x, this.map.airbase.z, p.position.x, p.position.z));
    const est = f.aligned && Math.abs(f.lat) < 1800 && f.along > 1500;
    if (reason === 'checkin' || reason === 'auto') {
      this._say(this._me(app), msg`${this.fac.name} approach, ${cs}, ${this._alt(Math.round(cur / 100) * 100)}, information ${this.atis}, inbound for landing.`, { priority: 2 });
    }
    if (reason === 'refly') {
      this._say(app, msg`${cs}, ${this.fac.name} approach, radar contact, vectors for the ILS runway ${rw}.`, { priority: 2 });
      this._after(4, () => this._vector(true));
      return true;
    }
    if (est) {
      const hold = Math.max(Math.round((fieldFt + 1500) / 500) * 500, Math.round(cur / 500) * 500);
      this._say(app, msg`${cs}, ${this.fac.name} approach, radar contact, ${P(sayNumber(nm), String(nm))} miles ${where} of the field. Maintain ${this._alt(hold)} until established, cleared ILS runway ${rw} approach. ${this.fac.name} ${this._altimeter()}.`, {
        priority: 2, readback: { st: this._me(app), m: msg`Cleared ILS runway ${rw}, ${this._altimeter()}, ${cs}.` },
      });
      ap.vectors = 9;
      ap.ils = true;
      return true;
    }
    const alt = Math.round((fieldFt + 2500) / 500) * 500;
    const verb = cur > alt + 300 ? 'Descend and maintain' : cur < alt - 300 ? 'Climb and maintain' : 'Maintain';
    this._say(app, msg`${cs}, ${this.fac.name} approach, radar contact, ${P(sayNumber(nm), String(nm))} miles ${where} of the field. ${verb} ${this._alt(alt)}, expect ILS runway ${rw}. ${this.fac.name} ${this._altimeter()}.`, {
      priority: 2, readback: { st: this._me(app), m: msg`${verb.split(' ')[0]} and maintain ${this._alt(alt)}, expect ILS ${rw}, ${this._altimeter()}, ${cs}.` },
    });
    ap.approachAlt = alt;
    this._after(9, () => this._vector(false));
    return true;
  }

  // vectors onto the extended centreline, ending with the approach clearance
  _vector(force) {
    const ap = this.ap, p = this.battle.player;
    if (!p || !p.alive || this.ended || ap.stage !== 'approach') return;
    this._geom(p);
    const f = this._final(ap.dir);
    if (!force && f.aligned && Math.abs(f.lat) < 1800 && f.along > 1500) {
      if (!ap.ils) {
        ap.ils = true;
        const rw = this._rwy(this._landHdg(ap.dir));
        this._say(this.st.approach, msg`${this.cs}, cleared ILS runway ${rw} approach.`, { priority: 2, readback: { st: this._me(this.st.approach), m: msg`Cleared ILS ${rw}, ${this.cs}.` } });
      }
      ap.vectors = 9;
      return;
    }
    const ab = this.map.airbase;
    const uTh = -ap.dir * ab.length / 2;
    // aim at a fix on the centreline ~6 nm out; close to it, a 30° intercept instead
    const fixAlong = THREE.MathUtils.clamp(f.along, 9000, 13000);
    const fx = this.map.fromAirbaseLocal(uTh - ap.dir * fixAlong, 0);
    const dFix = Math.hypot(fx.x - p.position.x, fx.z - p.position.z);
    const landHdg = this._landHdg(ap.dir);
    let hdg = dFix > 2500 ? bearingDeg(p.position.x, p.position.z, fx.x, fx.z) : landHdg - Math.sign(f.lat || 1) * 30;
    hdg = Math.round(normDeg(hdg) / 10) * 10 || 360;
    const turn = ((hdg - this.g.hdg + 540) % 360) - 180;
    const dirWord = turn < 0 ? 'left' : 'right';
    const alt = ap.approachAlt || Math.round((this._fieldFt() + 2500) / 500) * 500;
    const rw = this._rwy(landHdg);
    const hp = P(sayHeading(hdg), fmtHeading(hdg));
    this._say(this.st.approach, msg`${this.cs}, turn ${dirWord} heading ${hp}, maintain ${this._alt(alt)} until established, cleared ILS runway ${rw} approach.`, {
      priority: 2, readback: { st: this._me(this.st.approach), m: msg`${cap(dirWord)} heading ${hp}, cleared ILS ${rw}, ${this.cs}.` },
    });
    ap.vectors++;
    ap.vectorT = this.time;
    ap.ils = true;
  }

  _handoffTower() {
    const ap = this.ap, cs = this.cs, twr = this.st.tower;
    ap.handoff = true;
    this._say(this.st.approach, msg`${cs}, contact tower ${this._freqP(twr)}.`, {
      priority: 2, readback: { st: this._me(this.st.approach), m: msg`Tower ${this._freqP(twr)}, ${cs}.` },
    });
    this._after(5, () => this._clearToLand(true));
  }

  _clearToLand(checkIn) {
    const ap = this.ap, p = this.battle.player, cs = this.cs, twr = this.st.tower;
    if (!p || !p.alive || this.ended || ap.cleared || (ap.stage !== 'approach' && ap.stage !== 'tower')) return;
    ap.stage = 'tower';
    ap.cleared = true;
    const rw = this._rwy(this._landHdg(ap.dir));
    if (checkIn) this._say(this._me(twr), msg`${this.fac.name} tower, ${cs}, established ILS runway ${rw}.`, { priority: 2 });
    const brk = this._braking();
    const extra = brk ? P(' ' + brk.s, ' ' + brk.d) : P('');
    this._say(twr, msg`${cs}, ${this.fac.name} tower, runway ${rw}, ${this._wind()}, cleared to land.${extra}`, {
      priority: 2, expires: 20, readback: { st: this._me(twr), m: msg`Cleared to land runway ${rw}, ${cs}.` },
    });
  }

  _approachMonitor(p) {
    const ap = this.ap, g = this.g, cs = this.cs, s = this.s;
    if (ap.stage === 'goaround') {
      if (ap.reflyAt && this.time > ap.reflyAt) {
        ap.reflyAt = 0;
        this._beginApproach('refly');
      }
      return;
    }
    if ((ap.stage !== 'approach' && ap.stage !== 'tower') || p.fm.onGround) return;
    // keep re-evaluating which end until cleared
    if (!ap.cleared && this.time - ap.since > 6) {
      const d = this._pickDir();
      if (d !== ap.dir && Math.abs(g.u) > this.map.airbase.length / 2 + 2500) ap.dir = d;
    }
    const f = this._final(ap.dir);
    // re-vector when still well off the localizer
    if (ap.stage === 'approach' && ap.vectors < 3 && this.time - ap.vectorT > 40 && f.along > 4000 && !(f.aligned && Math.abs(f.lat) < 1800)) this._vector(false);
    // hand-off to the tower
    if (ap.stage === 'approach' && !ap.handoff) {
      if (f.along > 0 && f.along < 5500) this._clearToLand(false);
      else if (f.along > 0 && f.along < 11500 && this.time - ap.since > 18 && f.hdgErr < 40) this._handoffTower();
    }
    // glide-path monitor on a 3° slope
    if (f.along > 2500 && f.along < 15000 && f.aligned) {
      const gsH = f.along * TAN3;
      if (g.fieldAgl < gsH * 0.55 - 40 && this.time - ap.lowAltT > 25) {
        ap.lowAltT = this.time;
        this._say(ap.stage === 'tower' ? this.st.tower : this.st.approach, msg`${cs}, low altitude alert, check your altitude immediately. The ${this._altimeter()}.`, { priority: 3 });
      } else if (!ap.high && f.along < 8000 && g.fieldAgl > gsH * 1.9 + 150) {
        ap.high = true;
        this._say(ap.stage === 'tower' ? this.st.tower : this.st.approach, msg`${cs}, you are well above the glidepath.`, { priority: 1 });
      }
    }
    // short final checks
    if (f.along < 3500 && f.along > -500 && g.fieldAgl < 250) {
      ap.shortFinal = true;
      ap.minAgl = Math.min(ap.minAgl, g.fieldAgl);
      if (!p.controls.gear && !ap.wheels) {
        ap.wheels = true;
        this._say(this.st.tower, msg`${cs}, check wheels down!`, { priority: 3, key: 'wheels', minInterval: 10 });
      }
      const noGear = !p.controls.gear && g.fieldAgl < 70 && f.along < 2500;
      const offLine = f.along < 1500 && Math.abs(f.lat) > 150 && g.fieldAgl < 100;
      if ((noGear || offLine) && !ap.goAround) {
        ap.goAround = true;
        this._say(this.st.tower, msg`${cs}, go around, I say again, go around.`, { priority: 3 });
      }
    }
    // go-around: climbing away after short final without touching down
    if (ap.shortFinal && g.vs > 3 && g.fieldAgl > 150 && g.fieldAgl > ap.minAgl + 60 && !s.td) {
      const alt = Math.round((this._fieldFt() + 2000) / 500) * 500;
      if (!ap.goAround) this._say(this._me(this.st.tower), msg`${cs}, going around.`, { priority: 2 });
      this._say(this.st.tower, msg`${cs}, roger, fly runway heading, climb and maintain ${this._alt(alt)}.`, {
        priority: 2, readback: { st: this._me(this.st.tower), m: msg`Runway heading, ${this._alt(alt)}, ${cs}.` },
      });
      const fresh = this._freshApproach();
      fresh.stage = 'goaround';
      fresh.reflyAt = this.time + 22;
      this.ap = fresh;
    }
  }

  // ---------------------------------------------------------------- per-frame
  _fast(dt, p) {
    const s = this.s, fm = p.fm, g = this.g, c = p.controls;
    const ias = fm.ias || 0;
    if (!fm.onGround && g.agl > 15) {
      s.wasAirborne = true;
      s.flightTime += dt;
    }
    // ---- phase transitions
    if (s.phase === 'parked') {
      if (fm.onGround && g.onRunway && g.gs < 3 && c.throttle > 0.5 && !s.cleared) this._clearTakeoff();
      if (g.gs > 6 && c.throttle >= 0.5) {
        s.phase = 'takeoff';
        s.maxRoll = 0;
        s.tc = {};
        s.rto = false;
        s.posRate = false;
        s.gearUpCalled = false;
        s.vSpeeds = fm.vSpeeds ? fm.vSpeeds() : null;
      }
    }
    if (s.phase === 'takeoff') {
      s.maxRoll = Math.max(s.maxRoll, g.gs);
      if (!s.civil && !s.tc.rolling && g.gs > 12 && fm.onGround) {
        s.tc.rolling = true;
        this._say(this._me(this.st.tower), msg`${this.cs}, rolling.`, { priority: 1, expires: 4 });
      }
      if (!fm.onGround && g.agl > 3) {
        s.phase = 'air';
        s.departedHere = true;
        s.handoff = false;
        s.liftoffT = this.time;
        s.levelReported = false;
        this.ap = this._freshApproach();
        if (!s.civil) this._after(2, () => this._say(this._me(this.st.tower), msg`${this.cs}, airborne.`, { priority: 1, expires: 5 }));
      } else if (s.maxRoll > 31 && (fm.throttleCmd ?? c.throttle) <= 0.05 && (c.brakes || (fm.brakePressure || 0) > 0.3)) {
        this._rejectTakeoff();
      }
      if (s.civil && s.phase === 'takeoff') {
        const v = s.vSpeeds || { v1: 72, vr: 75 };
        if (!s.tc.thrust && fm.throttle >= 0.85 && g.gs > 3) { s.tc.thrust = true; this._crew('Thrust set.'); }
        if (!s.tc.eighty && ias >= 41.2) {
          s.tc.eighty = true;
          this._say(this.st.crew, P('Eighty knots.'), { priority: 2, expires: 3, readback: { st: this.st.pf, m: P('Checked.') } });
        }
        if (!s.tc.v1 && ias >= v.v1) { s.tc.v1 = true; this._crew('V one.', { expires: 2.5 }); }
        if (!s.tc.vr && ias >= v.vr) { s.tc.vr = true; this._crew('Rotate.', { expires: 2.5 }); }
      }
    }
    if (s.phase === 'air' && fm.onGround && !s.td) {
      // touched down without an event (should not happen): treat as a landing
      this._touchdown({ vs: 0, speed: g.gs, firm: false });
    }
    if (s.phase === 'rollout' && !fm.onGround && g.agl > 5) {
      // touch-and-go
      s.phase = 'air';
      s.td = null;
      this.ap = this._freshApproach();
    }
    // ---- airliner after lift-off
    if (s.civil && s.phase === 'air' && s.departedHere) {
      if (!s.posRate && g.vs > 2 && g.agl > 10 && this.time - (s.liftoffT || 0) < 40) {
        s.posRate = true;
        this._crew('Positive rate.');
      }
      if (s.posRate && !s.gearUpCalled && s.gearPrev && !c.gear) {
        s.gearUpCalled = true;
        this._pfSay('Gear up.');
      }
    }
    s.gearPrev = c.gear;
    // ---- landing roll
    if (s.phase === 'rollout' || s.phase === 'rto') this._rollout(dt, p);
    // ---- radio altimeter + GPWS (airliners)
    if (s.civil && !fm.onGround) this._autoCallouts(p);
    else s.raPrev = 9999;
  }

  _autoCallouts(p) {
    const s = this.s, g = this.g, c = p.controls;
    const ra = g.agl * FT;
    const r = this.radio;
    if (c.gear && g.vs < 0 && s.wasAirborne) {
      const list = AIRBUS.has(p.spec.id)
        ? [[1000, 'One thousand.'], [500, 'Five hundred.'], [200, 'Minimums.'], [100, 'One hundred.'], [50, 'Fifty.'], [40, 'Forty.'], [30, 'Thirty.'], [20, 'Twenty.'], [12, 'Retard, retard.']]
        : [[1000, 'One thousand.'], [500, 'Five hundred.'], [200, 'Minimums.'], [100, 'One hundred.'], [50, 'Fifty.'], [40, 'Forty.'], [30, 'Thirty.'], [20, 'Twenty.'], [10, 'Ten.']];
      for (const [th, text] of list) {
        if (s.raPrev > th && ra <= th && !s.ra.has(th)) {
          s.ra.add(th);
          r.callout(text, { expires: th > 150 ? 2.5 : 1.2 });
          break;
        }
      }
    }
    for (const th of s.ra) if (ra > th + 150) s.ra.delete(th);
    s.raPrev = ra;
    // GPWS
    const att = p.fm.attitude(this._att || (this._att = {}));
    if (Math.abs(att.roll) > 35 && g.agl > 30) r.callout('Bank angle, bank angle.', { key: 'gpws-bank', minInterval: 5 });
    if (g.agl < 750 && g.vs < -9 && g.agl > 20) r.callout('Sink rate.', { key: 'gpws-sink', minInterval: 3.5 });
    if (!c.gear && g.agl < 150 && g.vs < -1 && p.fm.airspeed < 95 && g.agl > 8) r.callout('Too low, gear.', { key: 'gpws-gear', minInterval: 4 });
  }

  _touchdown(ev) {
    const s = this.s, cs = this.cs;
    if (!s.wasAirborne) return;
    s.phase = 'rollout';
    s.td = ev;
    const p = this.battle.player, ab = this.map.airbase;
    s.landDir = p && p.velocity.x * ab.dirX + p.velocity.z * ab.dirZ < 0 ? -1 : 1;
    s.landTime = this.time;
    s.vacate = s.groundCall = s.seventy = false;
    s.stoppedT = 0;
    s.cleared = false;
    if (this.ap.stage !== 'none') this.ap.stage = 'landed';
    if (ev.vs < -3.5 && !s.firm) {
      s.firm = true;
      this._say(this.st.tower, msg`${cs}, that looked firm, do you require assistance?`, {
        priority: 1, delay: 1.5, readback: { st: this._me(this.st.tower), m: msg`Negative, ${cs}.` },
      });
    }
  }

  _rollout(dt, p) {
    const s = this.s, g = this.g, fm = p.fm, cs = this.cs;
    // airliner crew
    if (s.civil && fm.onGround) {
      const ab = fm.autobrake;
      const decel = !!(ab && ab.active && ab.decelOk);
      if (decel && !s.decelPrev) this._crew('Decel.', { key: 'decel', minInterval: 20 });
      s.decelPrev = decel;
      if (!s.seventy && s.lastGs > 36 && g.gs <= 36 && ((fm.reverser && fm.reverser.state !== 'stowed') || (fm.brakePressure || 0) > 0.2)) {
        s.seventy = true;
        this._crew('Seventy knots.');
      }
    }
    s.lastGs = g.gs;
    if (!fm.onGround) return;
    if (s.phase === 'rto') {
      if (g.gs < 1) {
        s.stoppedT += dt;
        if (s.stoppedT > 2.5 && !s.groundCall) {
          s.groundCall = true;
          const rw = this._rwy(this._takeoffHdg());
          this._say(this.st.tower, msg`${cs}, fire services are standing by. Taxi clear of runway ${rw} when able, advise ready for departure.`, { priority: 1 });
          s.phase = 'parked';
          s.cleared = false;
        }
      }
      return;
    }
    // vacate below 30 kt
    if (!s.vacate && g.gs < 15.4 && g.onRunway) {
      s.vacate = true;
      const home = !s.civil || s.departedHere;
      const greet = home ? P('welcome home') : P(`welcome to ${this.fac.full}`);
      const side = (s.landDir || 1) < 0 ? 'left' : 'right';
      const gnd = this.st.ground;
      this._say(this.st.tower, msg`${cs}, ${greet}, vacate ${side} next taxiway, contact ground ${this._freqP(gnd)}.`, {
        priority: 1, readback: { st: this._me(this.st.tower), m: msg`Vacate ${side}, ground ${this._freqP(gnd)}, ${cs}.` },
      });
      if (this.s.chuteJett && !this.chuteNoted) {
        this.chuteNoted = true;
        this._say(this.st.tower, msg`${cs}, your chute is on the runway, we'll pick it up.`, { priority: 0, delay: 1 });
      }
    }
    if (g.gs < 1) {
      s.stoppedT += dt;
      if (s.stoppedT > 3 && !s.groundCall && s.vacate) {
        s.groundCall = true;
        const rw = this._rwy(this._landHdg(s.landDir || 1));
        const gnd = this.st.ground;
        this._say(this._me(gnd), msg`${this.fac.name} ground, ${cs}, runway vacated.`, { priority: 1 });
        this._say(gnd, msg`${cs}, ${this.fac.name} ground, taxi to the apron via Alpha, hold short of runway ${rw}.`, {
          priority: 1, readback: { st: this._me(gnd), m: msg`Apron via Alpha, hold short runway ${rw}, ${cs}.` },
        });
      }
      if (s.stoppedT > 3) {
        s.phase = 'parked';
        s.cleared = false;
      }
    } else s.stoppedT = 0;
  }

  // ---------------------------------------------------------------- 4 Hz
  _scan(p) {
    const s = this.s, m = this.mission, cs = this.cs;
    if (this.ended) return;
    this._approachMonitor(p);
    // departure hand-off once safely airborne
    if (s.phase === 'air' && s.departedHere && !s.handoff && this.g.agl > 150 && this.g.vs > -1 && this.ap.stage === 'none') this._handoffDeparture();
    // threats
    if (p.incoming > 0 && this.time - s.missileT > 5) {
      const threats = this.battle.weapons.threatsTo(p);
      if (threats.length) {
        s.missileT = this.time;
        this._missileWarn(p, threats[0]);
      }
    }
    // a missile that was chasing us has gone
    if (p.incoming > 0) {
      if (!s.threatened) s.threatHp = p.health;
      s.threatened = true;
    } else if (s.threatened) {
      s.threatened = false;
      if (p.health >= (s.threatHp ?? p.health) - 0.5) this._say(this._me(this.st.awacs), msg`${cs}, missile defeated.`, { priority: 1, expires: 5, key: 'defeated', minInterval: 8 });
    }
    // TCAS
    if (s.civil && !p.fm.onGround) this._tcas(p);
    // leaving the area / ceiling
    if (m.outTimer > 0 && !s.outCalled) {
      s.outCalled = true;
      const h = bearingDeg(p.position.x, p.position.z, m.center.x, m.center.z);
      const turn = ((h - this.g.hdg + 540) % 360) - 180;
      const hp = P(sayHeading(h), fmtHeading(h));
      this._say(this.st.awacs, msg`${cs}, Overlord, you are leaving the area of operations, turn ${turn < 0 ? 'left' : 'right'} heading ${hp}.`, { priority: 2, story: true });
    } else if (m.outTimer <= 0) s.outCalled = false;
    if (m.ceilingTimer > 0 && this.time - s.ceilingT > 12) {
      s.ceilingT = this.time;
      if (/radar/i.test(m.ceilingMsg || 'radar')) this._say(this.st.awacs, msg`${cs}, you're painted! Get down, now!`, { priority: 3, story: true });
      else this._say(this.st.awacs, msg`${cs}, Overlord, you're too high, get back down on the deck.`, { priority: 3, story: true });
    }
  }

  _missileWarn(p, missile) {
    const pos = missile.pos || missile.position;
    if (!pos) return;
    const clock = this._clock(p, pos);
    const dy = pos.y - p.position.y;
    const hl = dy > 600 ? ' high' : dy < -600 ? ' low' : '';
    this.radio.warn(`Missile, missile, ${sayNumber(clock)} o'clock${hl}!`, 'missile', 4);
    return clock;
  }

  // Someone else on the frequency sees the launch and calls the break
  _launchCall(p, clock) {
    const s = this.s;
    if (this.time - (s.launchCallT || -99) < 10) return;
    s.launchCallT = this.time;
    const dir = clock >= 7 && clock <= 11 ? 'left' : clock >= 1 && clock <= 5 ? 'right' : this.rand() < 0.5 ? 'left' : 'right';
    this._say(this.st.awacs, msg`${this.cs}, missile launch, break ${dir}, flares, flares!`, { priority: 3, expires: 5, story: true });
  }

  // RWR spike when something locks you up (before it shoots)
  onLocked(by, t) {
    const p = this.battle.player;
    if (this.disposed || !p || !p.alive || !by || !by.position || t < 0.7 || p.incoming > 0) return;
    this._geom(p);
    const clock = this._clock(p, by.position);
    this.radio.warn(`Spike, ${sayNumber(clock)} o'clock!`, 'spike', 9);
  }

  _tcas(p) {
    const s = this.s;
    let best = null, bestTau = Infinity;
    for (const a of this.battle.aircraft) {
      if (a === p || !a.alive || a.dying || a.team === 'enemy') continue;
      const dx = a.position.x - p.position.x, dy = a.position.y - p.position.y, dz = a.position.z - p.position.z;
      const r = Math.hypot(dx, dz);
      if (r > 7000 || Math.abs(dy) > 900) continue;
      const rvx = a.velocity.x - p.velocity.x, rvz = a.velocity.z - p.velocity.z;
      const closing = -(dx * rvx + dz * rvz) / Math.max(r, 1);
      const tau = closing > 1 ? r / closing : r < 900 ? 0 : Infinity;
      if (tau < bestTau) { bestTau = tau; best = { a, r, dy, closing, tau }; }
    }
    const r = this.radio;
    if (best) {
      const { r: rng, dy, tau, closing } = best;
      if (s.tcas !== 'ra' && (tau < 22 || rng < 500) && Math.abs(dy) < 180 && rng < 4000) {
        s.tcas = 'ra';
        r.callout(dy < 0 ? 'Climb, climb.' : 'Descend, descend.', { expires: 2, log: true });
        return;
      }
      if (s.tcas === 'none' && (tau < 35 || rng < 900) && Math.abs(dy) < 260) {
        s.tcas = 'ta';
        r.callout('Traffic, traffic.', { expires: 2, log: true });
        return;
      }
      if (s.tcas !== 'none' && ((closing < 0 && rng > 1200) || Math.abs(dy) > 380)) {
        s.tcas = 'none';
        r.callout('Clear of conflict.', { expires: 3, log: true });
      }
    } else if (s.tcas !== 'none') {
      s.tcas = 'none';
      r.callout('Clear of conflict.', { expires: 3, log: true });
    }
  }

  // ---------------------------------------------------------------- 1 Hz
  _slow(p) {
    const s = this.s, ap = this.ap, g = this.g, m = this.mission;
    if (this.ended) return;
    // automatic approach
    if (ap.stage === 'none' && s.phase === 'air' && s.wasAirborne) {
      const hasLand = this._hasLand();
      const ringsOk = !this._requiredRings() || this._ringsLeft() <= (hasLand ? 3 : 0);
      if (hasLand && ringsOk && g.dist < 26000 && (s.flightTime > 25 || !s.departedHere)) this._beginApproach('auto');
      else if (!hasLand && ringsOk && p.controls.gear && g.dist < 22000 && g.agl < 3000 && g.vs < -1 && s.flightTime > 20 && (!s.departedHere || this.time - (s.liftoffT || 0) > 60) && !this._combatNear(p)) this._beginApproach('auto');
    }
    // combat picture
    if (this.checkedIn && this.time > this.groupHold) this._newGroups(p);
    this._escortWatch();
    this._flightCalls(p);
    this._combatCalls(p);
    if (s.phase === 'air') this._trafficAdvisory(p);
    // background chatter when the frequency is quiet
    if (this.radio.busy) this.quietT = 0;
    else this.quietT += 1;
    if (this.level === 'full' && this.quietT > this.chatterGap && this._chatterOk(p)) {
      this.quietT = 0;
      this.chatterGap = 20 + this.rand() * 30;
      this._chatter(p);
    }
  }

  // Mid-air: gear left down, level-off reports, the 250 kt rule, altitude busts
  _flightCalls(p) {
    const s = this.s, g = this.g, fm = p.fm, cs = this.cs;
    if (s.phase !== 'air') return;
    const ias = (fm.ias || 0) * KT;
    const ctl = this._combat() ? this.st.awacs : this.ap.stage === 'tower' ? this.st.tower : s.handoff && this.ap.stage === 'none' ? this.st.departure : this.st.approach;
    if (s.departedHere && !s.gearCheck && p.controls.gear && ias > 250 && this.time - (s.liftoffT || 0) > 25 && this.ap.stage === 'none') {
      s.gearCheck = true;
      this._say(s.handoff ? ctl : this.st.tower, msg`${cs}, check your gear, it appears to be down.`, { priority: 2 });
    }
    if (s.assignedAlt && !s.levelReported && Math.abs(g.altFt - s.assignedAlt) < 300 && Math.abs(g.vs) < 3) {
      s.levelReported = true;
      this._say(this._me(ctl), msg`${cs}, level ${this._alt(s.assignedAlt)}.`, { priority: 1, readback: { st: ctl, m: msg`${cs}, roger.` } });
    }
    if (s.civil && !s.speedCall && g.altFt < 10000 && ias > 265 && this.ap.stage !== 'tower') {
      s.speedCall = true;
      this._say(ctl, msg`${cs}, reduce speed two five zero knots, speed restriction below one zero thousand.`, {
        priority: 1, readback: { st: this._me(ctl), m: msg`Two five zero knots, ${cs}.` },
      });
    }
    // altitude bust: well off the cleared altitude while still with departure
    if (s.assignedAlt && s.levelReported && this.ap.stage === 'none' && !this._combat() && Math.abs(g.altFt - s.assignedAlt) > 1200 && this.time - (s.bustT || -99) > 60 && s.handoff) {
      s.bustT = this.time;
      this._say(ctl, msg`${cs}, check altitude, you were assigned ${this._alt(s.assignedAlt)}.`, { priority: 2 });
    }
  }

  // Enemy approaching: AWACS range calls on the closest bandit, merge calls,
  // periodic picture updates, and the tower when bandits threaten the field
  _combatCalls(p) {
    const air = this._hostileAir();
    if (!air.length || !this.checkedIn) return;
    const cs = this.cs;
    let near = null, nd = Infinity;
    for (const a of air) {
      const d = a.position.distanceTo(p.position);
      if (d < nd) { nd = d; near = a; }
    }
    const nm = nd / NM;
    let fl = this.rangeFlags.get(near);
    if (!fl) { fl = {}; this.rangeFlags.set(near, fl); }
    const b = braa(p.position, near.position, near.velocity);
    const hot = b.aspect === 'hot' || b.aspect === 'flanking';
    if (nm < 1.5 && !fl.merged) {
      fl.merged = fl.r3 = fl.r10 = fl.r20 = true;
      this._say(this.st.awacs, msg`${cs}, Overlord, merged.`, { priority: 2, expires: 4 });
    } else if (nm < 3.5 && !fl.r3 && hot) {
      fl.r3 = fl.r10 = fl.r20 = true;
      this._say(this.st.awacs, msg`${cs}, Overlord, bandit three miles, merge plot!`, { priority: 2, expires: 4 });
    } else if (nm < 10.5 && !fl.r10 && hot) {
      fl.r10 = fl.r20 = true;
      this._say(this.st.awacs, msg`${cs}, Overlord, threat, ${this._braaP(p, near)}, ten miles.`, { priority: 2, expires: 6 });
    } else if (nm < 20.5 && !fl.r20 && hot) {
      fl.r20 = true;
      this._say(this.st.awacs, msg`${cs}, Overlord, bandit ${this._braaP(p, near)}, closing.`, { priority: 1, expires: 8 });
    }
    // picture update when the frequency has been quiet for a while
    if (this.time - (this.pictureT || 0) > 75 && this.quietT > 12 && nm > 12) {
      this.pictureT = this.time;
      const groups = this._groups(air);
      const n = groups.length;
      const g = this._nearestGroup(p, groups);
      this._say(this.st.awacs, msg`${cs}, Overlord, picture, ${n === 1 ? P('single group') : P(`${sayNumber(n)} groups`, `${n} groups`)}, closest ${this._braaP(p, g.m)}.`, { priority: 1, expires: 8 });
    }
    // hostiles closing on the airfield while you are near it
    const ab = this.map.airbase;
    if (!this.fieldThreat && this.g.dist < 12000) {
      for (const a of air) {
        if (Math.hypot(a.position.x - ab.x, a.position.z - ab.z) < 16000) {
          this.fieldThreat = true;
          const dir = compassDir(bearingDeg(ab.x, ab.z, a.position.x, a.position.z));
          this._say(this.st.tower, msg`All stations, ${this.fac.name} tower, be advised, hostile aircraft approaching the field from the ${dir}!`, { priority: 2 });
          break;
        }
      }
    }
  }

  _combatNear(p) {
    for (const a of this._hostileAir()) if (a.position.distanceTo(p.position) < 25000) return true;
    return false;
  }

  _chatterOk(p) {
    const s = this.s, ap = this.ap;
    if (p.incoming > 0 || ap.shortFinal || s.phase === 'takeoff' || s.phase === 'rollout' || s.phase === 'rto') return false;
    return true;
  }

  _newGroups(p) {
    const fresh = [];
    for (const a of this._hostileAir()) if (!this.known.has(a)) fresh.push(a);
    if (!fresh.length) return;
    let seed = fresh[0], bd = Infinity;
    for (const a of fresh) {
      const d = a.position.distanceTo(p.position);
      if (d < bd) { bd = d; seed = a; }
    }
    const group = fresh.filter((a) => a.position.distanceTo(seed.position) < 6000);
    for (const a of group) this.known.add(a);
    this.groupHold = this.time + 6;
    const n = group.length;
    const size = n > 2 ? P(`heavy, ${sayNumber(n)} contacts`, `HEAVY ${n} contacts`) : n === 2 ? P('two contacts', '2 contacts') : P('single contact', 'single');
    this._say(this.st.awacs, msg`${this.cs}, Overlord, new group ${this._braaP(p, seed)}, ${size}.`, { priority: 2, story: true });
  }

  _escortWatch() {
    for (const o of this.mission.objectives) {
      if (o.type !== 'escort' || !o.ac) continue;
      const ac = o.ac;
      let fl = this.escortFlags.get(ac);
      if (!fl) { fl = {}; this.escortFlags.set(ac, fl); }
      const name = ac.label || 'HEAVY 1';
      const st = this._pilot(name);
      const hp = ac.alive ? ac.health / ac.maxHealth : 0;
      if (ac.alive && !ac.dying && hp < 0.6 && !fl.h60) {
        fl.h60 = true;
        this._say(st, msg`Overlord, ${name}, we're hit! Lost number two engine!`, { priority: 2, story: true });
      }
      if (ac.alive && !ac.dying && hp < 0.3 && !fl.h30) {
        fl.h30 = true;
        this._say(st, msg`${name}, we're losing hydraulics, we need cover now!`, { priority: 3, story: true });
      }
      if (o.reached && !fl.arrived) {
        fl.arrived = true;
        this._say(st, msg`${name}, established on final. Thanks for the escort, ${this.cs}!`, { priority: 2, story: true });
      }
      if ((!ac.alive || ac.dying) && !fl.down) {
        fl.down = true;
        this._say(this.st.awacs, msg`All stations, Overlord, ${name} is down, ${name} is down.`, { priority: 3, story: true });
      }
    }
  }

  _trafficAdvisory(p) {
    if (this.level !== 'full' || p.incoming > 0) return;
    const g = this.g, cs = this.cs;
    for (const a of this.battle.aircraft) {
      if (a === p || !a.alive || a.dying || a.team !== 'civil') continue;
      const dx = a.position.x - p.position.x, dz = a.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 9000) continue;
      const dy = a.position.y - p.position.y;
      if (Math.abs(dy) > 700) continue;
      const closing = dx * (a.velocity.x - p.velocity.x) + dz * (a.velocity.z - p.velocity.z) < 0;
      if (!closing) continue;
      const last = this.trafficTimes.get(a);
      if (last !== undefined && this.time - last < 60) continue;
      this.trafficTimes.set(a, this.time);
      const clock = this._clock(p, a.position);
      const nm = Math.max(1, Math.round(d / NM));
      // direction of travel relative to ours
      const th = bearingDeg(0, 0, a.velocity.x, a.velocity.z);
      const diff = ((th - g.hdg + 540) % 360) - 180;
      let dir;
      if (Math.abs(diff) > 150) dir = P('opposite direction');
      else if (Math.abs(diff) < 30) dir = P('same direction');
      else {
        const hr = THREE.MathUtils.degToRad(g.hdg);
        const lateral = a.velocity.x * Math.cos(hr) + a.velocity.z * Math.sin(hr);
        dir = lateral > 0 ? P('crossing left to right') : P('crossing right to left');
      }
      const dft = Math.round((dy * FT) / 100) * 100;
      let rel;
      if (Math.abs(dft) < 300) rel = P('same altitude');
      else rel = P(`${sayAltitude(Math.abs(dft))} feet ${dft > 0 ? 'above' : 'below'}`, `${Math.abs(dft)} ft ${dft > 0 ? 'above' : 'below'}`);
      const type = TYPE_NAME[a.spec.id] || P('an airliner', 'airliner');
      const st = this._combat() ? this.st.awacs : this.ap.stage === 'tower' ? this.st.tower : this.s.handoff && this.ap.stage === 'none' && this.s.departedHere ? this.st.departure : this.st.approach;
      this._say(st, msg`${cs}, traffic, ${P(sayNumber(clock), String(clock))} o'clock, ${P(sayNumber(nm), String(nm))} miles, ${dir}, ${rel}, ${type}.`, {
        priority: 1, readback: { st: this._me(st), m: this.rand() < 0.5 ? msg`Looking, ${cs}.` : msg`Traffic in sight, ${cs}.` },
      });
      return;
    }
  }

  // ---------------------------------------------------------------- chatter
  _chatter(p) {
    const r = this.rand;
    const civ = this.battle.aircraft.filter((a) => a.alive && !a.dying && a.team === 'civil' && !a.isPlayer);
    if (civ.length && r() < 0.85) return this._trafficChatter(pick(r, civ), p);
    if (this._combat()) return this._militaryChatter();
    return this._civilChatter();
  }

  _trafficChatter(ac, p) {
    const r = this.rand;
    const tcs = trafficCallsign(ac);
    const st = this._trafficStation(ac);
    const ab = this.map.airbase;
    const near = Math.hypot(ac.position.x - ab.x, ac.position.z - ab.z) < 30000;
    const ctl = near ? this.st.approach : { ...this.st.approach, name: `${this.fac.name} Control`, short: 'CTR', freq: '132.450' };
    st.freq = ctl.freq;
    const alt = ac.position.y * FT;
    const hdg = bearingDeg(0, 0, ac.velocity.x, ac.velocity.z);
    const kind = Math.floor(r() * 6);
    if (kind === 0 || kind === 1) {
      const up = r() < 0.5 || alt < 6000;
      const target = THREE.MathUtils.clamp(Math.round((alt + (up ? 1 : -1) * (2000 + Math.floor(r() * 3) * 1000)) / 1000) * 1000, 3000, 37000);
      const verb = target > alt ? 'climb' : 'descend';
      this._say(ctl, msg`${tcs}, ${verb} and maintain ${this._alt(target)}.`, { priority: 0, readback: { st, m: msg`${cap(verb)} and maintain ${this._alt(target)}, ${tcs}.` } });
    } else if (kind === 2) {
      const right = r() < 0.5;
      const h = Math.round(normDeg(hdg + (right ? 1 : -1) * (20 + r() * 30)) / 10) * 10 || 360;
      const hp = P(sayHeading(h), fmtHeading(h));
      this._say(ctl, msg`${tcs}, turn ${right ? 'right' : 'left'} heading ${hp}.`, { priority: 0, readback: { st, m: msg`${right ? 'Right' : 'Left'} heading ${hp}, ${tcs}.` } });
    } else if (kind === 3) {
      const spd = pick(r, [210, 220, 250, 180]);
      this._say(ctl, msg`${tcs}, reduce speed to ${P(sayDigits(spd), String(spd))} knots.`, { priority: 0, readback: { st, m: msg`Speed ${P(sayDigits(spd), String(spd))}, ${tcs}.` } });
    } else if (kind === 4 && p && ac.position.distanceTo(p.position) < 18000 && !p.spec.civil) {
      // tell the airliner about the fast mover (that's you)
      const rel = bearingDeg(ac.position.x, ac.position.z, p.position.x, p.position.z) - hdg;
      const clock = clockPosition(rel);
      const nm = Math.max(1, Math.round(ac.position.distanceTo(p.position) / NM));
      const dir = compassDir(this.g.hdg);
      this._say(ctl, msg`${tcs}, traffic, ${P(sayNumber(clock), String(clock))} o'clock, ${P(sayNumber(nm), String(nm))} miles, a fast-moving military jet, ${dir}bound.`, {
        priority: 0, readback: { st, m: msg`Looking for the traffic, ${tcs}.` },
      });
    } else {
      // pilot-initiated request
      const fl = Math.round(alt / 1000) * 1000;
      const want = THREE.MathUtils.clamp(fl + 4000, 8000, 39000);
      this._say(st, msg`${ctl.name}, ${tcs}, ${this._alt(fl)}, request higher.`, {
        priority: 0, readback: { st: ctl, m: msg`${tcs}, climb and maintain ${this._alt(want)}.`, next: { st, m: msg`Up to ${this._alt(want)}, ${tcs}.` } },
      });
    }
  }

  _militaryChatter() {
    const r = this.rand;
    const flights = [P('Cobra two one', 'COBRA 21'), P('Hammer three one', 'HAMMER 31'), P('Snake four one', 'SNAKE 41'), P('Dodge one one', 'DODGE 11'), P('Rage five two', 'RAGE 52')];
    const fl = pick(r, flights);
    const st = { id: 'mil', name: fl.d, short: fl.d.split(' ')[0].slice(0, 5), freq: this.fac.awacs, kind: 'pilot', voice: r() < 0.5 ? 'wingman' : 'traffic2' };
    const aw = this.st.awacs;
    const kind = Math.floor(r() * 5);
    if (kind === 0) this._say(aw, msg`${fl}, Overlord, push to CAP point Bravo, angels two five.`, { priority: 0, readback: { st, m: msg`${fl}, pushing.` } });
    else if (kind === 1) this._say(aw, msg`${fl}, Overlord, your picture is clean, RTB.`, { priority: 0, readback: { st, m: msg`${fl}, RTB.` } });
    else if (kind === 2) {
      const tk = { id: 'tanker', name: 'TEXACO 51', short: 'TEXACO', freq: this.fac.awacs, kind: 'pilot', voice: 'heavy' };
      this._say(tk, msg`Overlord, Texaco five one, on station track Alpha, flight level two two zero.`, { priority: 0, readback: { st: aw, m: msg`Texaco five one, Overlord, copy on station.` } });
    } else if (kind === 3) this._say(aw, msg`${fl}, Overlord, contact Magic on two six four decimal five.`, { priority: 0, readback: { st, m: msg`Two six four decimal five, ${fl}.` } });
    else this._say(st, msg`Overlord, ${fl}, fence in, two ship, angels two zero.`, { priority: 0, readback: { st: aw, m: msg`${fl}, Overlord, radar contact, proceed as fragged.` } });
  }

  _civilChatter() {
    const r = this.rand;
    const rw = this._rwy(this.map.airbase.heading);
    const flights = [P('Horizon two four seven', 'HORIZON 247'), P('Speedbird six one', 'SPEEDBIRD 61'), P('Nova eight one two', 'NOVA 812'), P('Skyward three three five', 'SKYWARD 335')];
    const fl = pick(r, flights);
    const st = { id: 'tfc', name: fl.d, short: 'TFC', freq: this.fac.tower, kind: 'traffic', voice: r() < 0.5 ? 'traffic1' : 'traffic2' };
    const kind = Math.floor(r() * 4);
    if (kind === 0) this._say(this.st.tower, msg`${fl}, ${this.fac.name} tower, runway ${rw}, line up and wait.`, { priority: 0, readback: { st, m: msg`Line up and wait runway ${rw}, ${fl}.` } });
    else if (kind === 1) {
      st.freq = this.fac.approach;
      this._say(this.st.approach, msg`${fl}, descend and maintain four thousand, expect ILS runway ${rw}.`, { priority: 0, readback: { st, m: msg`Down to four thousand, expect ILS ${rw}, ${fl}.` } });
    } else if (kind === 2) {
      const cessna = { ...st, name: 'N345AB', voice: 'traffic1' };
      this._say(this.st.tower, msg`Cessna three four five alpha bravo, ${this.fac.name} tower, report left downwind runway ${rw}.`, { priority: 0, readback: { st: cessna, m: P('Report left downwind, three alpha bravo.') } });
    } else {
      st.freq = this.fac.ground;
      this._say(st, msg`${this.fac.name} ground, ${fl}, stand one two, request pushback and start.`, { priority: 0, readback: { st: this.st.ground, m: msg`${fl}, ${this.fac.name} ground, pushback and start approved.` } });
    }
  }

  // ---------------------------------------------------------------- events from the game
  missionRadio(text) {
    const line = String(text || '').trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z][A-Za-z0-9 ]{1,15}):\s*(.+)$/);
    let station, body = line;
    if (m && (/^(tower|awacs|overlord)$/i.test(m[1].trim()) || m[1] === m[1].toUpperCase())) {
      const who = m[1].trim();
      body = m[2];
      if (/^tower$/i.test(who)) station = this.st.tower;
      else if (/^(awacs|overlord)$/i.test(who)) station = this.st.awacs;
      else station = this._pilot(who.toUpperCase());
    } else station = this.st.awacs;
    let spoken = body;
    // AWACS lines get the proper call-up unless they already address someone
    if (station === this.st.awacs && !/^(all|[A-Z][a-z]+ (one|two|three|four|five|six|seven|eight|niner|zero))/i.test(body)) {
      spoken = `${this.cs.s}, Overlord, ${body.charAt(0).toLowerCase()}${body.slice(1)}`;
    }
    this.radio.transmit(station, spoken, { display: body, priority: 2, expires: 25 });
    if (station === this.st.awacs) this.groupHold = Math.max(this.groupHold, this.time + 3);
  }

  // ---------------------------------------------------------------- pilot requests (ATC menu)
  // What the pilot can sensibly ask for right now, most useful first.
  menuOptions() {
    const p = this.battle.player;
    if (!p || !p.alive || p.dying || this.ended || this.disposed || !this.s) return [];
    this._geom(p);
    const s = this.s, ap = this.ap, opts = [];
    const add = (id, label) => opts.push({ id, label });
    const fac = this.fac.name;
    if (p.fm.onGround) {
      if (s.phase === 'rollout' && !s.vacate) add('taxi', `${fac} Tower: request taxi to the apron`);
      else add('takeoff', `${fac} Tower: ready for departure`);
      add('atis', `${fac} ATIS: listen to information ${this.atis}`);
      add('radiocheck', `${fac} Tower: radio check`);
    } else {
      const air = this._hostileAir().length > 0;
      const tgt = this._groundTargets().length > 0;
      if (ap.stage === 'tower' && ap.cleared) add('confirmland', 'Tower: confirm cleared to land');
      if (air) {
        add('bogey', 'Overlord: bogey dope (closest group)');
        add('picture', 'Overlord: request picture');
      }
      if (tgt) add('target', 'Overlord: request target location');
      if (ap.stage === 'approach') add('vectors', `${fac} Approach: request vectors`);
      else if (ap.stage === 'none' || ap.stage === 'goaround') add(this._combat() ? 'rtb' : 'ils', this._combat() ? 'Overlord: RTB, request steer home' : `${fac} Approach: request ILS, full stop`);
      if (!s.mayday && p.health < p.maxHealth * 0.7) add('mayday', 'MAYDAY: declare emergency');
      add('atis', `${fac} ATIS: information ${this.atis}`);
      if (!s.mayday && p.health >= p.maxHealth * 0.7) add('mayday', 'MAYDAY: declare emergency');
    }
    if (this.radio.lastHeard) add('sayagain', 'Say again (repeat last call)');
    return opts.slice(0, 6);
  }

  // M key without the menu (touch button): the most useful request
  request() {
    const o = this.menuOptions();
    if (o.length) this.command(o[0].id);
  }

  command(id) {
    const p = this.battle.player;
    if (!p || !p.alive || p.dying || this.ended || this.disposed || !this.s) return;
    if (this.time - this.lastReq < 1.2) return;
    this.lastReq = this.time;
    this._geom(p);
    const s = this.s, ap = this.ap, g = this.g, cs = this.cs;
    const fac = this.fac.name;
    switch (id) {
      case 'taxi': {
        const gnd = this.st.ground;
        this._say(this._me(this.st.tower), msg`${fac} tower, ${cs}, request taxi to the apron.`, { priority: 2 });
        this._say(this.st.tower, msg`${cs}, vacate next taxiway, contact ground ${this._freqP(gnd)}.`, { priority: 2, readback: { st: this._me(this.st.tower), m: msg`Ground ${this._freqP(gnd)}, ${cs}.` } });
        s.vacate = true;
        return;
      }
      case 'takeoff': {
        const rw = this._rwy(this._takeoffHdg());
        this._say(this._me(this.st.tower), msg`${fac} tower, ${cs}, holding in position runway ${rw}, with ${this.atis}, ready for departure.`, { priority: 2 });
        if (s.cleared) this._clearTakeoff(true, true);
        else this._lineUp(true);
        return;
      }
      case 'atis': return this._atisBroadcast();
      case 'radiocheck': {
        const twr = this.st.tower;
        const sig = this._signal(twr);
        const read = sig > 0.75 ? P('read you five by five') : sig > 0.5 ? P('readability four, loud and clear') : P('readability three, you are broken');
        this._say(this._me(twr), msg`${fac} tower, ${cs}, radio check ${this._freqP(twr)}.`, { priority: 2 });
        this._say(twr, msg`${cs}, ${fac} tower, ${read}.`, { priority: 2 });
        return;
      }
      case 'confirmland': {
        const rw = this._rwy(this._landHdg(ap.dir));
        this._say(this._me(this.st.tower), msg`Tower, ${cs}, confirm cleared to land.`, { priority: 2 });
        this._say(this.st.tower, msg`${cs}, affirm, runway ${rw}, cleared to land.`, { priority: 2 });
        return;
      }
      case 'bogey': {
        const air = this._hostileAir();
        this._say(this._me(this.st.awacs), msg`Overlord, ${cs}, bogey dope.`, { priority: 2 });
        if (!air.length) return void this._say(this.st.awacs, msg`${cs}, Overlord, picture clean.`, { priority: 2 });
        const near = this._nearestGroup(p, this._groups(air));
        this._say(this.st.awacs, msg`${cs}, Overlord, group ${this._braaP(p, near.m)}.`, { priority: 2 });
        for (const a of near.gr.members) this.known.add(a);
        return;
      }
      case 'picture': {
        const air = this._hostileAir();
        this._say(this._me(this.st.awacs), msg`Overlord, ${cs}, request picture.`, { priority: 2 });
        if (!air.length) return void this._say(this.st.awacs, msg`${cs}, Overlord, picture clean.`, { priority: 2 });
        const groups = this._groups(air).map((gr) => {
          let best = gr.members[0];
          for (const m of gr.members) if (m.position.distanceTo(p.position) < best.position.distanceTo(p.position)) best = m;
          return { gr, m: best, d: best.position.distanceTo(p.position) };
        }).sort((a, b) => a.d - b.d).slice(0, 3);
        const n = this._groups(air).length;
        let text = msg`${cs}, Overlord, picture, ${n === 1 ? P('single group') : P(`${sayNumber(n)} groups`, `${n} groups`)}.`;
        groups.forEach((gp, i) => {
          const name = groups.length > 1 ? P(['Lead group', 'Second group', 'Third group'][i]) : P('Group');
          text = msg`${text} ${name} ${this._braaP(p, gp.m)}.`;
          for (const a of gp.gr.members) this.known.add(a);
        });
        this._say(this.st.awacs, text, { priority: 2 });
        return;
      }
      case 'target': {
        const tg = this._nearestTarget(p);
        this._say(this._me(this.st.awacs), msg`Overlord, ${cs}, request target location.`, { priority: 2 });
        if (!tg) return void this._say(this.st.awacs, msg`${cs}, Overlord, no targets remaining.`, { priority: 2 });
        const b = braa(p.position, tg.position, null);
        const r = Math.max(1, Math.round(b.rangeNm));
        const bs = String(Math.round(b.bearing) % 360).padStart(3, '0');
        const name = String(tg.name || 'target').toLowerCase();
        this._say(this.st.awacs, msg`${cs}, Overlord, nearest target, ${P(name, tg.name || 'TARGET')}, bearing ${P(sayDigits(bs), bs)}, ${P(sayNumber(r), String(r))} miles.`, { priority: 2 });
        return;
      }
      case 'vectors':
        this._say(this._me(this.st.approach), msg`${fac} approach, ${cs}, request vectors.`, { priority: 2 });
        this._after(1, () => this._vector(true));
        return;
      case 'ils': {
        const rw = this._rwy(this._landHdg(this._pickDir()));
        this._say(this._me(this.st.approach), msg`${fac} approach, ${cs}, information ${this.atis}, request vectors ILS runway ${rw}, full stop.`, { priority: 2 });
        this._beginApproach('request');
        return;
      }
      case 'rtb': {
        const ab = this.map.airbase;
        const b = String(Math.round(bearingDeg(p.position.x, p.position.z, ab.x, ab.z)) % 360).padStart(3, '0');
        const r = Math.max(1, Math.round(g.dist / NM));
        const app = this.st.approach;
        this._say(this._me(this.st.awacs), msg`Overlord, ${cs}, RTB.`, { priority: 2 });
        this._say(this.st.awacs, msg`${cs}, Overlord, copy RTB. Home plate bearing ${P(sayDigits(b), b)}, ${P(sayNumber(r), String(r))} miles. Contact ${fac} approach ${this._freqP(app)}.`, {
          priority: 2, readback: { st: this._me(this.st.awacs), m: msg`${fac} approach ${this._freqP(app)}, ${cs}.` },
        });
        this._after(12, () => this._beginApproach('auto'));
        return;
      }
      case 'mayday': return this._mayday(p);
      case 'sayagain': {
        const last = this.radio.lastHeard;
        if (!last) return;
        const st = last.station;
        const name = st.kind === 'awacs' ? 'Overlord' : st.name;
        this._say(this._me(st), msg`${name}, ${cs}, say again.`, { priority: 2 });
        this.radio.transmit(st, `${cs.s}, I say again. ${last.text}`, { display: `I say again: ${last.display}`, priority: 2, signal: this._signal(st) });
        return;
      }
      default:
        return;
    }
  }

  // ATIS: the recorded airfield information loop
  _atisBroadcast() {
    const f = this.fac;
    const st = { id: 'atis', name: `${f.name} ATIS`, short: 'ATIS', freq: f.atis || '127.850', kind: 'atc', voice: 'ground' };
    const rw = this._rwy(this._expectedLandingHeading());
    const temp = 4 + Math.floor(this.rand() * 26);
    const brk = this._braking();
    const cond = brk ? P(' ' + brk.s, ' ' + brk.d) : P(' Runway dry.');
    const time = String(Math.floor(this.rand() * 24)).padStart(2, '0') + '50';
    this.radio.transmit(st, `${f.name} information ${this.atis}, time ${sayDigits(time)} zulu. ${this._wind().s}. Visibility one zero kilometres or more. Temperature ${sayNumber(temp)}, ${this._altimeter().s}. Runway in use ${rw.s}.${cond.s} Advise on initial contact you have information ${this.atis}.`, {
      display: `${f.name.toUpperCase()} INFO ${this.atis.toUpperCase()} ${time}Z ${this._wind().d}, VIS 10KM+, T${temp}, ${this._altimeter().d}, RWY ${rw.d}.${cond.d}`,
      priority: 2, expires: 20, squelch: true, signal: 0.9,
    });
  }

  // Declaring an emergency: everyone else gets out of the way
  _mayday(p) {
    const s = this.s, cs = this.cs, ap = this.ap;
    if (s.mayday) return;
    s.mayday = true;
    this._geom(p);
    const problem = p.health < p.maxHealth * 0.7 ? P('battle damage, losing hydraulics') : P('flight control problem');
    const combat = this._combat();
    const st = combat ? this.st.awacs : ap.stage === 'tower' ? this.st.tower : this.st.approach;
    const ab = this.map.airbase;
    const h = bearingDeg(p.position.x, p.position.z, ab.x, ab.z);
    const turn = ((h - this.g.hdg + 540) % 360) - 180;
    const hp = P(sayHeading(h), fmtHeading(h));
    const dir = this._pickDir();
    const rw = this._rwy(this._landHdg(dir));
    this._say(this._me(st), msg`Mayday, mayday, mayday. ${st.kind === 'awacs' ? 'Overlord' : st.name}, ${cs}, ${problem}, request immediate return.`, { priority: 3 });
    if (combat) {
      const r = Math.max(1, Math.round(this.g.dist / NM));
      this._say(st, msg`${cs}, Overlord copies mayday. Turn ${turn < 0 ? 'left' : 'right'} heading ${hp}, ${this.fac.name} is ${P(sayNumber(r), String(r))} miles. Search and rescue is alerted.`, { priority: 3 });
    } else {
      this._say(st, msg`${cs}, roger mayday. Turn ${turn < 0 ? 'left' : 'right'} heading ${hp} direct ${this.fac.name}, runway ${rw}, cleared to land. Emergency services are standing by.`, {
        priority: 3, readback: { st: this._me(st), m: msg`Heading ${hp}, cleared to land ${rw}, ${cs}.` },
      });
      // the approach is now ours: skip straight to the landing clearance
      const fresh = this._freshApproach();
      fresh.stage = 'tower';
      fresh.dir = dir;
      fresh.cleared = fresh.handoff = fresh.ils = true;
      fresh.since = this.time;
      this.ap = fresh;
    }
  }

  onKill(entity, source) {
    if (this.disposed || !entity) return;
    const s = this.s;
    if (!s) return;
    if (entity.kind === 'air') {
      s.splash = (s.splash || 0) + 1;
      s.splashRole = entity.role;
      if (!s.splashTimer) {
        s.splashTimer = true;
        this._after(1.2, () => this._splashCall());
      }
    } else {
      s.hits = (s.hits || 0) + 1;
      s.hitType = entity.type || entity.kind;
      if (!s.hitTimer) {
        s.hitTimer = true;
        this._after(1.2, () => this._groundHitCall());
      }
    }
  }

  _splashCall() {
    const s = this.s, cs = this.cs;
    const n = s.splash || 0;
    s.splash = 0;
    s.splashTimer = false;
    if (!n) return;
    const call = n > 1 ? P(`Splash ${sayNumber(n)}!`) : s.splashRole === 'bomber' ? P('Splash the bomber!') : s.splashRole === 'drone' ? P('Splash one drone!') : P('Splash one!');
    const air = this._hostileAir();
    const groups = air.length ? this._groups(air).length : 0;
    const rest = groups ? P(`${groups === 1 ? 'Single group' : sayNumber(groups) + ' groups'} remain.`, `${groups} group${groups > 1 ? 's' : ''} remain.`) : P('Picture clean.');
    this._say(this._me(this.st.awacs), msg`${cs}, ${call}`, {
      priority: 1, readback: { st: this.st.awacs, m: msg`${cs}, Overlord, copy splash. ${rest}` },
    });
  }

  _groundHitCall() {
    const s = this.s, cs = this.cs;
    const n = s.hits || 0;
    s.hits = 0;
    s.hitTimer = false;
    if (!n) return;
    const t = s.hitType;
    const call = t === 'ship' ? P('Shack! Ship is going down.') : t === 'sam' ? P('SAM site destroyed.') : t === 'aaa' ? P('Triple-A is down.') : n > 1 ? P('Good hits, multiple targets destroyed.') : P('Good hits, target destroyed.');
    const left = this._groundTargets().length;
    const rest = left ? P(`${sayNumber(left)} target${left > 1 ? 's' : ''} remain.`, `${left} target${left > 1 ? 's' : ''} remain.`) : P('All targets destroyed.');
    this._say(this._me(this.st.awacs), msg`${cs}, ${call}`, {
      priority: 1, readback: { st: this.st.awacs, m: msg`${cs}, Overlord, copy good effects. ${rest}` },
    });
  }

  onCivilianDown(entity) {
    if (this.disposed) return;
    const what = entity && entity.team === 'civil' ? P('That was a civilian airliner!') : P('That was a friendly!');
    this._say(this.st.awacs, msg`${this.cs}, cease fire, cease fire! ${what}`, { priority: 3, story: true });
  }

  onMissileLaunched(missile) {
    const p = this.battle.player;
    if (this.disposed || !p || !p.alive || !missile || missile.target !== p) return;
    this._geom(p);
    if (this.s) this.s.missileT = this.time;
    const clock = this._missileWarn(p, missile);
    if (this.s && clock) this._launchCall(p, clock);
  }

  onFox(type) {
    if (this.disposed) return;
    const call = type === 'radar' ? P('Fox three!') : P('Fox two!');
    this._say(this._me(this.st.awacs), msg`${this.cs}, ${call}`, { priority: 1, key: 'fox', minInterval: 2.5, expires: 3 });
  }

  onSonicBoom(ac) {
    const p = this.battle.player;
    if (this.disposed || !p || ac !== p) return;
    this._geom(p);
    const cs = this.cs, city = this.map.def.city, ab = this.map.airbase;
    if (this.mission.objectives.some((o) => o.type === 'boom') && !this.boomGood) {
      this.boomGood = true;
      this._say(this.st.awacs, msg`${cs}, Overlord, good boom, we heard that one from here!`, { priority: 2 });
      return;
    }
    if (city && !this.boomCity && Math.hypot(p.position.x - city.x, p.position.z - city.z) < 12000 && this.g.agl < 3000) {
      this.boomCity = true;
      this._say(this.st.approach, msg`${cs}, ${this.fac.name} approach, we're receiving noise complaints downtown. Keep it subsonic over the city.`, { priority: 1 });
      return;
    }
    if (!this.boomField && Math.hypot(p.position.x - ab.x, p.position.z - ab.z) < 9000 && this.g.agl < 2500) {
      this.boomField = true;
      this._say(this.st.tower, msg`${cs}, ${this.fac.name} tower, that was loud! Keep it subsonic in the control zone.`, { priority: 1 });
    }
  }

  onRearm() {
    if (this.disposed || !this.s) return;
    const gnd = this.st.ground;
    this._say(gnd, msg`${this.cs}, ${this.fac.name} ground, rearm and repair complete. Advise ready for departure.`, { priority: 1, key: 'rearm', minInterval: 30 });
    this.s.phase = 'parked';
    this.s.cleared = false;
  }

  onAircraftEvent(ac, ev) {
    if (this.disposed || !ev || !this.s || ac !== this.battle.player) return;
    const s = this.s;
    switch (ev.type) {
      case 'touchdown':
        this._touchdown(ev);
        break;
      case 'spoilers':
        if (s.civil) this._crew(AIRBUS.has(ac.spec.id) ? 'Spoilers.' : 'Speedbrakes up.', { key: 'splr', minInterval: 10 });
        break;
      case 'reverser':
        if (s.civil && ev.state === 'deployed') this._crew(AIRBUS.has(ac.spec.id) ? 'Reverse green.' : 'Reversers normal.', { key: 'rev', minInterval: 10 });
        break;
      case 'autobrake':
        if (s.civil && ev.reason && ev.reason.startsWith('disarm')) this._crew('Autobrake disarmed.', { priority: 1, key: 'abdisarm', minInterval: 10 });
        break;
      case 'rto':
        this._rejectTakeoff();
        break;
      case 'chute':
        if (ev.state === 'jettisoned') s.chuteJett = true;
        else if (ev.state === 'failed') this._say(this.st.tower, msg`${this.cs}, tower, your chute just tore off.`, { priority: 0 });
        break;
      default:
        break;
    }
  }

  onPlayerHit() {
    const p = this.battle.player;
    if (this.disposed || !p || !p.alive || p.dying || !this.s) return;
    const s = this.s, cs = this.cs;
    const hp = p.health / p.maxHealth;
    if (hp < 0.35 && !s.hitBad) {
      s.hitBad = true;
      this._geom(p);
      const ab = this.map.airbase;
      const b = Math.round(bearingDeg(p.position.x, p.position.z, ab.x, ab.z)) % 360;
      const bs = String(b).padStart(3, '0');
      const r = Math.max(1, Math.round(this.g.dist / NM));
      const st = this._combat() ? this.st.awacs : this.st.approach;
      this._say(this._me(st), msg`${cs}, I'm hit, I'm hit!`, { priority: 2 });
      this._say(st, msg`${cs}, ${st === this.st.awacs ? 'Overlord' : this.fac.name + ' approach'}, copy. Nearest field ${this.fac.name}, bearing ${P(sayDigits(bs), bs)}, ${P(sayNumber(r), String(r))} miles.`, { priority: 2 });
    } else if (hp < 0.9 && hp >= 0.35 && this.time - s.hitLight > 40 && !s.hitBad) {
      s.hitLight = this.time;
      this._say(this._me(this.st.awacs), msg`${cs}, taking hits!`, { priority: 1 });
    }
  }

  _playerDown(p) {
    const s = this.s, cs = this.cs;
    s.down = true;
    if (this.disposed) return;
    const ab = this.map.airbase;
    const pos = p ? p.position : null;
    const dist = pos ? Math.hypot(pos.x - ab.x, pos.z - ab.z) : Infinity;
    if (p && p.fm.crashed && dist < 9000 && !s.crashCalled) {
      s.crashCalled = true;
      const onRwy = this.map.isOnRunway(pos.x, pos.z);
      let where;
      if (onRwy) where = msg`on runway ${this._rwy(this.ap.stage !== 'none' ? this._landHdg(this.ap.dir) : ab.heading)}`;
      else {
        const nm = Math.max(1, Math.round(dist / NM));
        where = msg`${P(sayNumber(nm), String(nm))} mile${nm > 1 ? 's' : ''} ${compassDir(bearingDeg(ab.x, ab.z, pos.x, pos.z))} of the field`;
      }
      this._say(this.st.tower, msg`Crash, crash, crash! Emergency services, aircraft down ${where}!`, { priority: 3, story: true });
      return;
    }
    if (this._combat() || p && p.dying && !p.fm.crashed) {
      this._say(this.st.awacs, msg`${cs} is down, ${cs} is down! Overlord launching search and rescue.`, { priority: 3, story: true });
    }
  }

  onMissionEnd(status, reason) {
    if (this.disposed || this.ended) return;
    const p = this.battle.player;
    const cs = this.cs, m = this.mission;
    if (status === 'failed') {
      if (!p || !p.alive || p.dying) {
        if (this.s && !this.s.down) this._playerDown(p);
        this.ended = true;
        return;
      }
      this.ended = true;
      const why = reason ? P(` ${reason}.`) : P('');
      this._say(this.st.awacs, msg`${cs}, Overlord, mission failed.${why} Return to base.`, { priority: 2, delay: 0.8, story: true });
      return;
    }
    this.ended = true;
    const types = m.objectives.map((o) => o.type);
    if (types.includes('land')) {
      const greet = this.s && this.s.civil && !this.s.departedHere ? P(`welcome to ${this.fac.full}`) : P('welcome home');
      this._say(this.st.tower, msg`${cs}, nice landing. Mission complete, ${greet}.`, { priority: 2, delay: 1.2, story: true });
    } else if (types.includes('escort')) {
      const esc = m.objectives.find((o) => o.type === 'escort');
      const name = (esc && esc.ac && esc.ac.label) || 'HEAVY 1';
      this._say(this._pilot(name), msg`${name}. Thanks for the escort, ${cs}, we owe you one!`, { priority: 2, delay: 1, story: true });
      this._say(this.st.awacs, msg`${cs}, Overlord, mission complete, good work. RTB.`, { priority: 2, story: true });
    } else if (types.length === 1 && types[0] === 'rings') {
      this._say(this.st.tower, msg`${cs}, ${this.fac.name} tower, course complete, nice flying.`, { priority: 2, delay: 0.8, story: true });
    } else {
      this._say(this.st.awacs, msg`${cs}, Overlord, mission complete, good work. RTB.`, { priority: 2, delay: 1.5, story: true });
    }
  }
}

export { KT, FT, NM };
