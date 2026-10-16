// Fully procedural Web Audio sound design: jet engine (rumble + turbine whine
// + afterburner roar), wind, guns, missiles, explosions and cockpit warning
// tones (IR seeker growl, missile launch warning, stall horn, pull-up).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.voice = true;
    this.listener = { pos: null, right: null };
    this._lastGun = new Map();
    this._speakTimes = new Map();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
    } catch (e) {
      this.enabled = false;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.white = this._noiseBuffer('white', 2);
    this.brown = this._noiseBuffer('brown', 3);
    this._buildEngine();
    this._buildWarnings();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  _noiseBuffer(kind, seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.5);
    return s;
  }

  _buildEngine() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    this.engineOut = out;
    this.cockpitFilter = ctx.createBiquadFilter();
    this.cockpitFilter.type = 'lowpass';
    this.cockpitFilter.frequency.value = 18000;
    out.connect(this.cockpitFilter);
    this.cockpitFilter.connect(this.master);
    // rumble
    const rumble = this._loop(this.brown);
    this.rumbleLP = ctx.createBiquadFilter();
    this.rumbleLP.type = 'lowpass';
    this.rumbleLP.frequency.value = 300;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.5;
    rumble.connect(this.rumbleLP).connect(this.rumbleGain).connect(out);
    // turbine whine
    this.whine = ctx.createOscillator();
    this.whine.type = 'sawtooth';
    this.whine.frequency.value = 400;
    this.whine2 = ctx.createOscillator();
    this.whine2.type = 'triangle';
    this.whine2.frequency.value = 1600;
    this.whineBP = ctx.createBiquadFilter();
    this.whineBP.type = 'bandpass';
    this.whineBP.Q.value = 6;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0.02;
    this.whine.connect(this.whineBP);
    this.whine2.connect(this.whineBP);
    this.whineBP.connect(this.whineGain).connect(out);
    this.whine.start();
    this.whine2.start();
    // afterburner roar
    const ab = this._loop(this.white);
    this.abLP = ctx.createBiquadFilter();
    this.abLP.type = 'lowpass';
    this.abLP.frequency.value = 900;
    this.abGain = ctx.createGain();
    this.abGain.gain.value = 0;
    ab.connect(this.abLP).connect(this.abGain).connect(out);
    // wind
    const wind = this._loop(this.white);
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass';
    this.windBP.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBP).connect(this.windGain).connect(this.master);
    // player gun: gated noise modulated at the fire rate
    const gunNoise = this._loop(this.white);
    this.gunBP = ctx.createBiquadFilter();
    this.gunBP.type = 'bandpass';
    this.gunBP.frequency.value = 700;
    this.gunBP.Q.value = 0.8;
    this.gunGate = ctx.createGain();
    this.gunGate.gain.value = 0;
    this.gunMod = ctx.createOscillator();
    this.gunMod.type = 'square';
    this.gunMod.frequency.value = 100;
    const modDepth = ctx.createGain();
    modDepth.gain.value = 0.5;
    this.gunAmp = ctx.createGain();
    this.gunAmp.gain.value = 0.5;
    this.gunMod.connect(modDepth).connect(this.gunAmp.gain);
    this.gunBody = ctx.createOscillator();
    this.gunBody.type = 'sawtooth';
    this.gunBody.frequency.value = 100;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.25;
    gunNoise.connect(this.gunBP).connect(this.gunAmp);
    this.gunBody.connect(bodyGain).connect(this.gunAmp);
    this.gunAmp.connect(this.gunGate).connect(this.master);
    this.gunMod.start();
    this.gunBody.start();
  }

  _buildWarnings() {
    const ctx = this.ctx;
    // IR seeker tone
    this.seekOsc = ctx.createOscillator();
    this.seekOsc.type = 'sine';
    this.seekOsc.frequency.value = 420;
    this.seekLfo = ctx.createOscillator();
    this.seekLfo.frequency.value = 18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    this.seekLfo.connect(lfoGain).connect(this.seekOsc.frequency);
    this.seekGain = ctx.createGain();
    this.seekGain.gain.value = 0;
    this.seekOsc.connect(this.seekGain).connect(this.master);
    this.seekOsc.start();
    this.seekLfo.start();
    // warning beeper
    this.warnOsc = ctx.createOscillator();
    this.warnOsc.type = 'square';
    this.warnOsc.frequency.value = 1000;
    this.warnFilter = ctx.createBiquadFilter();
    this.warnFilter.type = 'lowpass';
    this.warnFilter.frequency.value = 2500;
    this.warnGain = ctx.createGain();
    this.warnGain.gain.value = 0;
    this.warnOsc.connect(this.warnFilter).connect(this.warnGain).connect(this.master);
    this.warnOsc.start();
    this.warnState = { mode: 'none', t: 0 };
  }

  updateEngine(p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const tc = 0.08;
    const thr = p.throttle, ab = p.ab, spd = p.speed;
    const on = p.active ? 1 : 0;
    // outside the aircraft at supersonic speed the engine noise is left behind
    const muffle = p.supersonicExternal ? 0.22 : 1;
    const fan = p.turbofan ? 1 : 0;
    this.engineOut.gain.setTargetAtTime(on * (p.cockpit ? 0.6 : 0.85) * muffle, t, 0.2);
    this.rumbleLP.frequency.setTargetAtTime(220 + thr * 520 + ab * 500 - fan * 120, t, tc);
    this.rumbleGain.gain.setTargetAtTime((0.35 + thr * 0.45 + ab * 0.3) * (1 - fan * 0.45), t, tc);
    const rpm = 0.35 + thr * 0.65;
    // high-bypass turbofans: lower fan buzz, stronger whine
    this.whine.frequency.setTargetAtTime(fan ? 160 + rpm * 520 : 260 + rpm * 900, t, 0.3);
    this.whine2.frequency.setTargetAtTime(fan ? 1300 + rpm * 1900 : 900 + rpm * 2600, t, 0.3);
    this.whineBP.frequency.setTargetAtTime(500 + rpm * 2200, t, 0.3);
    this.whineGain.gain.setTargetAtTime((0.012 + rpm * 0.03) * (p.cockpit ? 1.3 : 0.8) * (1 + fan * 0.9), t, tc);
    this.abGain.gain.setTargetAtTime(ab * 0.55, t, 0.12);
    this.abLP.frequency.setTargetAtTime(700 + ab * 900, t, tc);
    const w = Math.min(1, spd / 400);
    this.windGain.gain.setTargetAtTime(on * (w * w * 0.32 + (p.gLoad > 6 ? 0.06 : 0) + (p.airbrake ? 0.12 : 0)), t, 0.15);
    this.windBP.frequency.setTargetAtTime(500 + w * 1800, t, tc);
    this.cockpitFilter.frequency.setTargetAtTime(p.cockpit ? 2200 : p.supersonicExternal ? 650 : 18000, t, 0.1);
    // gun
    const firing = p.gunFiring ? 1 : 0;
    this.gunMod.frequency.setValueAtTime(p.gunRate || 100, t);
    this.gunBody.frequency.setValueAtTime(p.gunRate || 100, t);
    this.gunGate.gain.setTargetAtTime(firing * 0.55, t, 0.01);
  }

  // warning: { seeker: 'none'|'search'|'lock', missile: bool, radar: bool, stall: bool, pullup: bool }
  updateWarnings(w, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (w.seeker === 'lock') {
      this.seekOsc.frequency.setTargetAtTime(1450, t, 0.02);
      this.seekLfo.frequency.setTargetAtTime(0.1, t, 0.05);
      this.seekGain.gain.setTargetAtTime(0.07, t, 0.03);
    } else if (w.seeker === 'search') {
      this.seekOsc.frequency.setTargetAtTime(380, t, 0.05);
      this.seekLfo.frequency.setTargetAtTime(16, t, 0.05);
      this.seekGain.gain.setTargetAtTime(0.045, t, 0.05);
    } else this.seekGain.gain.setTargetAtTime(0, t, 0.05);

    const ws = this.warnState;
    ws.t += dt;
    let mode = 'none';
    if (w.missile) mode = 'missile';
    else if (w.pullup) mode = 'pullup';
    else if (w.radar) mode = 'radar';
    else if (w.stall) mode = 'stall';
    if (mode !== ws.mode) { ws.mode = mode; ws.t = 0; }
    let gain = 0, freq = 1000;
    if (mode === 'missile') {
      gain = ws.t % 0.16 < 0.08 ? 0.06 : 0;
      freq = 1150;
    } else if (mode === 'pullup') {
      const ph = ws.t % 0.9;
      gain = ph < 0.6 ? 0.06 : 0;
      freq = 500 + ph * 900;
    } else if (mode === 'radar') {
      gain = ws.t % 1.0 < 0.15 ? 0.04 : 0;
      freq = 800;
    } else if (mode === 'stall') {
      gain = ws.t % 0.5 < 0.25 ? 0.04 : 0;
      freq = 420;
    }
    this.warnOsc.frequency.setTargetAtTime(freq, t, 0.01);
    this.warnGain.gain.setTargetAtTime(gain, t, 0.005);
  }

  setListener(pos, right) {
    this.listener.pos = pos;
    this.listener.right = right;
  }

  _spatial(pos, ref = 400) {
    const l = this.listener;
    if (!pos || !l.pos) return { gain: 1, pan: 0, dist: 0 };
    const dx = pos.x - l.pos.x, dy = pos.y - l.pos.y, dz = pos.z - l.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const gain = 1 / (1 + d / ref);
    let pan = 0;
    if (l.right && d > 1) pan = Math.max(-1, Math.min(1, (dx * l.right.x + dy * l.right.y + dz * l.right.z) / d));
    return { gain, pan, dist: d };
  }

  _oneShot({ buffer, filter = 'lowpass', freq = 1000, freqEnd = null, q = 0.7, gain = 1, attack = 0.005, decay = 0.5, pos = null, ref = 400, rate = 1, delayByDistance = false }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const sp = this._spatial(pos, ref);
    const g0 = gain * sp.gain;
    if (g0 < 0.004) return;
    const t0 = ctx.currentTime + (delayByDistance ? Math.min(2.5, sp.dist / 343) : 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(g0, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    let node = src.connect(f).connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      node = node.connect(p);
    }
    node.connect(this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + attack + decay + 0.05);
  }

  gunShot(owner) {
    if (!this.ctx || owner.isPlayer) return;
    const now = this.ctx.currentTime;
    const last = this._lastGun.get(owner) || 0;
    if (now - last < 0.12) return;
    this._lastGun.set(owner, now);
    this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 600, q: 0.8, gain: 0.5, decay: 0.14, pos: owner.position, ref: 250, delayByDistance: true });
  }

  missileLaunch(pos, isPlayer) {
    this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 2500, freqEnd: 300, q: 0.6, gain: isPlayer ? 0.9 : 0.6, attack: 0.02, decay: 1.6, pos: isPlayer ? null : pos, ref: 500 });
    this._oneShot({ buffer: this.brown, filter: 'lowpass', freq: 400, gain: isPlayer ? 0.8 : 0.4, attack: 0.01, decay: 0.8, pos: isPlayer ? null : pos, ref: 500 });
  }

  explosion(pos, scale = 1) {
    this._oneShot({ buffer: this.brown, filter: 'lowpass', freq: 1400, freqEnd: 80, q: 0.5, gain: 1.4 * Math.min(1.6, scale), attack: 0.01, decay: 2.4 * Math.min(1.5, scale), pos, ref: 900, rate: 0.6, delayByDistance: true });
    this._oneShot({ buffer: this.white, filter: 'lowpass', freq: 4000, freqEnd: 200, gain: 0.5 * scale, attack: 0.003, decay: 0.4, pos, ref: 600, delayByDistance: true });
  }

  // Sonic boom: the classic double "N-wave" crack followed by a rolling rumble.
  // `gain` already includes distance; `inside` muffles it for the pilot.
  sonicBoom(gain = 1, inside = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.boomBuffer) {
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * 2.6);
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const nwave = (t0, dur, amp) => {
        const i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
        for (let i = 0; i < n && i0 + i < len; i++) d[i0 + i] += amp * (1 - (2 * i) / n);
      };
      nwave(0.01, 0.11, 1.0);
      nwave(0.19, 0.11, 0.85);
      let last = 0;
      for (let i = Math.floor(0.02 * sr); i < len; i++) {
        const t = i / sr;
        last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
        d[i] += last * 2.6 * Math.exp(-(t - 0.02) / 0.75);
      }
      this.boomBuffer = buf;
    }
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.boomBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = inside ? 260 : 900;
    const g = ctx.createGain();
    g.gain.value = Math.min(1.6, gain * (inside ? 0.45 : 1.3));
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t0);
    // sub-bass thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t0);
    osc.frequency.exponentialRampToValueAtTime(28, t0 + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(Math.max(0.001, Math.min(1, gain * 0.9)), t0 + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    osc.connect(og).connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + 0.75);
  }

  // ---- ground roll: tyre rumble, brake squeal, anti-skid chatter, spoiler buffet
  _buildGround() {
    const ctx = this.ctx;
    const g = {};
    // runway rumble: brown noise through a low-pass that opens with speed
    const rumble = this._loop(this.brown);
    g.rumbleLP = ctx.createBiquadFilter();
    g.rumbleLP.type = 'lowpass';
    g.rumbleLP.frequency.value = 120;
    g.rumble = ctx.createGain();
    g.rumble.gain.value = 0;
    rumble.connect(g.rumbleLP).connect(g.rumble).connect(this.master);
    // brake moan / squeal: a resonant band on noise plus a faint tone
    const sq = this._loop(this.white);
    g.squealBP = ctx.createBiquadFilter();
    g.squealBP.type = 'bandpass';
    g.squealBP.Q.value = 18;
    g.squealBP.frequency.value = 900;
    g.squeal = ctx.createGain();
    g.squeal.gain.value = 0;
    sq.connect(g.squealBP).connect(g.squeal);
    // anti-skid: the brake noise is chopped at ~12 Hz while it cycles
    g.skid = ctx.createGain();
    g.skid.gain.value = 1;
    g.skidLfo = ctx.createOscillator();
    g.skidLfo.type = 'square';
    g.skidLfo.frequency.value = 12;
    g.skidDepth = ctx.createGain();
    g.skidDepth.gain.value = 0;
    g.skidLfo.connect(g.skidDepth).connect(g.skid.gain);
    g.squeal.connect(g.skid).connect(this.master);
    g.skidLfo.start();
    // spoiler buffet: low rumble with a slow wobble
    const buf = this._loop(this.brown);
    g.buffetLP = ctx.createBiquadFilter();
    g.buffetLP.type = 'lowpass';
    g.buffetLP.frequency.value = 220;
    g.buffet = ctx.createGain();
    g.buffet.gain.value = 0;
    buf.connect(g.buffetLP).connect(g.buffet).connect(this.master);
    this.ground = g;
  }

  updateGround(p) {
    if (!this.ctx) return;
    if (!this.ground) this._buildGround();
    const g = this.ground, t = this.ctx.currentTime;
    const on = p.onGround ? 1 : 0;
    const spd = Math.max(0, p.speed || 0);
    const muffle = p.cockpit ? 0.7 : 1;
    const v = Math.min(1, spd / 80);
    g.rumble.gain.setTargetAtTime(on * (spd > 0.5 ? 0.12 + v * 0.45 : 0) * muffle, t, 0.08);
    g.rumbleLP.frequency.setTargetAtTime(80 + v * 420, t, 0.1);
    // brakes moan at low speed and squeal near the stop
    const brake = on * Math.min(1, p.brake || 0) * (spd > 0.4 ? 1 : 0);
    const slow = 1 - Math.min(1, spd / 45);
    g.squeal.gain.setTargetAtTime(brake * (0.015 + slow * slow * 0.05) * muffle, t, 0.06);
    g.squealBP.frequency.setTargetAtTime(420 + slow * 1700 + Math.sin(t * 3.1) * 60, t, 0.1);
    g.skidDepth.gain.setTargetAtTime(p.antiskid && on ? 0.9 : 0, t, 0.03);
    g.buffet.gain.setTargetAtTime(on * (p.spoilers || 0) * v * 0.18 * muffle, t, 0.15);
  }

  // Tyre chirp + gear thump; firmer landings are louder and lower
  touchdown(vs, speed, pos, isPlayer) {
    if (!this.ctx) return;
    const firm = Math.min(1, Math.max(0, -vs / 4));
    const where = isPlayer ? null : pos;
    this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 2400 - firm * 700, freqEnd: 900, q: 2.5, gain: 0.25 + firm * 0.35, attack: 0.004, decay: 0.32, pos: where, ref: 300 });
    this._oneShot({ buffer: this.brown, filter: 'lowpass', freq: 260 - firm * 80, gain: 0.35 + firm * 0.9, attack: 0.005, decay: 0.45 + firm * 0.4, pos: where, ref: 300, rate: 0.8 });
    if (speed > 40) this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 1800, freqEnd: 1100, q: 3, gain: 0.15, attack: 0.01, decay: 0.25, pos: where, ref: 300 });
  }

  nosewheel() {
    this._oneShot({ buffer: this.brown, filter: 'lowpass', freq: 180, gain: 0.45, attack: 0.005, decay: 0.35, rate: 0.9 });
  }

  // Drag chute: canopy "whump" on deployment, a rip when it fails
  chute(state) {
    if (state === 'deploying') {
      this._oneShot({ buffer: this.brown, filter: 'lowpass', freq: 320, freqEnd: 90, gain: 0.8, attack: 0.02, decay: 0.7, rate: 0.7 });
      this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 700, freqEnd: 300, q: 0.8, gain: 0.25, attack: 0.05, decay: 0.9 });
    } else if (state === 'failed') {
      this._oneShot({ buffer: this.white, filter: 'highpass', freq: 1500, gain: 0.35, attack: 0.002, decay: 0.3 });
    } else if (state === 'jettisoned') {
      this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 2500, q: 3, gain: 0.12, attack: 0.002, decay: 0.08 });
    }
  }

  hit(pos) {
    this._oneShot({ buffer: this.white, filter: 'highpass', freq: 2500, gain: 0.35, attack: 0.001, decay: 0.06, pos, ref: 300 });
  }

  flare() {
    this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 1800, q: 1.5, gain: 0.25, attack: 0.002, decay: 0.12 });
  }

  click() {
    this._oneShot({ buffer: this.white, filter: 'bandpass', freq: 3000, q: 4, gain: 0.25, attack: 0.001, decay: 0.04 });
  }

  speak(text, key = text, minInterval = 6) {
    if (!this.voice || !window.speechSynthesis) return;
    const now = performance.now() / 1000;
    if (now - (this._speakTimes.get(key) || -99) < minInterval) return;
    this._speakTimes.set(key, now);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.15;
      u.pitch = 1.05;
      u.volume = Math.min(1, this.volume * 0.9);
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* ignore */
    }
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOut.gain.setTargetAtTime(0, t, 0.1);
    this.windGain.gain.setTargetAtTime(0, t, 0.1);
    this.gunGate.gain.setTargetAtTime(0, t, 0.01);
    this.seekGain.gain.setTargetAtTime(0, t, 0.02);
    this.warnGain.gain.setTargetAtTime(0, t, 0.02);
    if (this.ground) {
      for (const g of [this.ground.rumble, this.ground.squeal, this.ground.buffet]) g.gain.setTargetAtTime(0, t, 0.05);
    }
  }
}
