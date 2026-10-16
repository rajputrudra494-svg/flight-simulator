// Radio: the single speech channel shared by ATC, AWACS, wingmen, the crew and
// the aircraft's automated voices. Speech uses the Web Speech API, one
// utterance at a time, with a priority queue, readbacks and realistic gaps;
// the radio sound (mic click, carrier hiss, squelch tail) is procedural Web
// Audio. Everything degrades gracefully: without speech synthesis or audio the
// transcript still appears and the queue advances on estimated durations.

const ROLE_ORDER = ['tower', 'awacs', 'player', 'approach', 'heavy', 'ground', 'traffic1', 'departure', 'traffic2', 'wingman', 'crew', 'callout', 'warning'];

// per-role delivery so even a single installed voice yields distinct speakers.
// Real frequencies are fast: controllers run 200+ words a minute in a flat,
// clipped monotone; AWACS is calm, pilots a touch slower, crew deliberate.
const ROLE_STYLE = {
  tower: { rate: 1.3, pitch: 1.0 },
  ground: { rate: 1.24, pitch: 0.9 },
  approach: { rate: 1.32, pitch: 1.06 },
  departure: { rate: 1.28, pitch: 0.94 },
  awacs: { rate: 1.16, pitch: 0.86 },
  heavy: { rate: 1.14, pitch: 0.8 },
  wingman: { rate: 1.24, pitch: 1.1 },
  player: { rate: 1.2, pitch: 1.0 },
  crew: { rate: 1.08, pitch: 0.94 },
  traffic1: { rate: 1.26, pitch: 1.06 },
  traffic2: { rate: 1.22, pitch: 0.84 },
  callout: { rate: 1.0, pitch: 0.7 },
  warning: { rate: 1.1, pitch: 1.1 },
};

// radio character per station kind: hiss level, flutter depth, crackle.
// VHF AM (towers, airliners) hisses; UHF (AWACS, fighters) crackles more.
const FX_KIND = {
  atc: { hiss: 0.024, flutter: 0.3, crackle: 0.1 },
  awacs: { hiss: 0.032, flutter: 0.55, crackle: 0.45 },
  pilot: { hiss: 0.03, flutter: 0.45, crackle: 0.3 },
  player: { hiss: 0.012, flutter: 0.15, crackle: 0 },
  traffic: { hiss: 0.038, flutter: 0.6, crackle: 0.55 },
};

const FEMALE = /zira|aria|jenny|samantha|susan|hazel|libby|sonia|female|karen|moira|tessa|fiona|victoria|allison|ava|serena|emma|michelle|natasha|clara|catherine|heera|linda|eva/i;

const CALLOUT_STATION = { id: 'callout', name: 'Aircraft', short: 'ACFT', freq: '', kind: 'crew', voice: 'callout' };
const WARNING_STATION = { id: 'warning', name: 'Warning', short: 'WARN', freq: '', kind: 'crew', voice: 'warning' };

const hasSpeech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.settings = { voice: true, chatter: 'full', fx: true };
    this.time = 0;
    this.current = null;
    this.log = [];
    this.queue = [];
    this._seq = 0;
    this._gapUntil = 0;
    this._keys = new Map();
    this._utter = null;
    this._voices = null;
    this._roleVoice = {};
    this._fx = null;
    if (hasSpeech()) {
      const synth = window.speechSynthesis;
      const refresh = () => { this._voices = null; };
      if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh);
      else synth.onvoiceschanged = refresh;
    }
  }

  // ------------------------------------------------------------------ public
  transmit(station, text, opts = {}) {
    if (!station || !text) return false;
    const priority = opts.priority ?? 1;
    const chatter = this.settings.chatter;
    if (chatter === 'off' && priority < 2) return false;
    if (chatter === 'essential' && priority < 1) return false;
    if (!this._rateOk(opts.key, opts.minInterval)) return false;
    if (opts.key && this.queue.some((q) => q.key === opts.key)) return false;
    const item = this._item(station, text, opts, priority);
    if (priority >= 3) {
      // urgent: cut whatever is on the air (unless it is urgent too)
      if (this.current && this.current.priority < 3) this._cut(true);
      item.front = true;
    }
    this._enqueue(item);
    return true;
  }

  // Aircraft automated voice (radio altimeter, TCAS, GPWS): no squelch, a
  // distinct synthetic voice, never waits behind radio traffic.
  callout(text, opts = {}) {
    if (!this._speechOn()) return false;
    if (!this._rateOk(opts.key, opts.minInterval)) return false;
    const item = this._item(CALLOUT_STATION, text, { ...opts, squelch: false }, 2.5);
    item.expiresAt = this.time + (opts.expires ?? 2.5);
    item.front = true;
    item.log = !!opts.log;
    item.machine = true;
    // a newer callout supersedes an older one; routine traffic is cut and repeated,
    // clearances wait (the callout expires quickly if it cannot get through)
    if (this.current && (this.current.machine ? this.current.priority < 4 : this.current.priority < 2)) this._cut(true);
    this.queue = this.queue.filter((q) => !q.machine || q.station === WARNING_STATION);
    this._enqueue(item);
    return true;
  }

  // Master-warning voice: interrupts anything, rate limited per key.
  warn(text, key = text, minInterval = 4) {
    if (!this._speechOn()) return false;
    if (this.current && this.current.key === key && this.current.station === WARNING_STATION) return false;
    if (!this._rateOk(key, minInterval)) return false;
    const item = this._item(WARNING_STATION, text, { key, squelch: false }, 4);
    item.expiresAt = this.time + 2;
    item.front = true;
    item.log = false;
    item.machine = true;
    if (this.current) this._cut(true);
    this._enqueue(item);
    return true;
  }

  update(dt) {
    this.time += dt;
    const cur = this.current;
    if (cur) {
      const elapsed = this.time - cur.start;
      const done = cur.ended || (cur.silent ? elapsed >= cur.duration : elapsed > cur.duration * 2 + 2);
      if (done) this._finish();
    }
    this._updateFx();
    if (this.current || this.time < this._gapUntil) return;
    const next = this._next();
    if (next) this._start(next);
  }

  // new mission / quit: silence everything and forget the transcript
  reset() {
    this._cancelSpeech();
    this.current = null;
    this.queue.length = 0;
    this.log.length = 0;
    this._keys.clear();
    this._gapUntil = this.time + 0.5;
    this._fxOff();
  }

  // pause / results: stop talking but keep the transcript
  pause() {
    this._cancelSpeech();
    this.current = null;
    this.queue.length = 0;
    this._gapUntil = this.time + 0.4;
    this._fxOff();
  }

  get busy() {
    return !!this.current || this.queue.length > 0;
  }

  // ------------------------------------------------------------------ queue
  _item(station, text, opts, priority) {
    const rate = (ROLE_STYLE[station.voice] || ROLE_STYLE.tower).rate;
    const words = String(text).split(/\s+/).length;
    return {
      station, text: String(text), display: opts.display ?? String(text), priority,
      expiresAt: this.time + (opts.expires ?? 12), key: opts.key || null, readback: opts.readback || null,
      squelch: opts.squelch ?? station.kind !== 'crew', seq: this._seq++, front: false, log: opts.log ?? true,
      duration: 0.4 + (words * 0.34) / rate, notBefore: this.time + (opts.delay || 0),
      // 1 = loud and clear, lower = more static and fading (distance, terrain)
      signal: Math.max(0.1, Math.min(1, opts.signal ?? 1)),
    };
  }

  _rateOk(key, minInterval) {
    if (!key) return true;
    const last = this._keys.get(key);
    if (last !== undefined && this.time - last < (minInterval ?? 0)) return false;
    this._keys.set(key, this.time);
    return true;
  }

  _enqueue(item) {
    this.queue.push(item);
    // at most five waiting: drop the least important, oldest first
    while (this.queue.length > 5) {
      let worst = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i], w = this.queue[worst];
        if (a.priority < w.priority || (a.priority === w.priority && !a.front && a.seq < w.seq)) worst = i;
      }
      this.queue.splice(worst, 1);
    }
  }

  _next() {
    const t = this.time;
    this.queue = this.queue.filter((q) => q.expiresAt >= t);
    let best = null;
    for (const q of this.queue) {
      if (q.notBefore > t) continue;
      if (!best) { best = q; continue; }
      // readbacks and interrupting calls keep their place at the front unless something urgent waits
      const qa = q.front ? q.priority + 1.5 : q.priority;
      const ba = best.front ? best.priority + 1.5 : best.priority;
      if (qa > ba || (qa === ba && q.seq < best.seq)) best = q;
    }
    if (best) this.queue.splice(this.queue.indexOf(best), 1);
    return best;
  }

  _start(item) {
    item.start = this.time;
    item.ended = false;
    this.current = item;
    if (item.log && !item.logged) {
      item.logged = true;
      this.log.push({ station: item.station, display: item.display, time: this.time, kind: item.station.kind });
      if (this.log.length > 6) this.log.shift();
    }
    const fxOn = this._fxReady() && item.squelch;
    item.fxDelay = fxOn ? 0.12 : 0;
    if (fxOn) this._keyUp(item.station.kind, item.signal);
    item.silent = !this._speechOn();
    if (item.silent) return;
    const speak = () => {
      if (this.current !== item) return;
      try {
        const synth = window.speechSynthesis;
        const u = new window.SpeechSynthesisUtterance(item.text);
        const style = ROLE_STYLE[item.station.voice] || ROLE_STYLE.tower;
        const v = this._voiceFor(item.station.voice);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
        u.rate = style.rate;
        u.pitch = style.pitch;
        u.volume = Math.max(0, Math.min(1, (this.audio ? this.audio.volume : 0.8) * 0.95));
        // keep a strong reference: Chrome drops onend for collected utterances
        this._utter = u;
        u.onend = () => { if (this._utter === u) item.ended = true; };
        u.onerror = () => { if (this._utter === u) item.ended = true; };
        if (synth.paused) synth.resume();
        synth.speak(u);
      } catch (e) {
        item.silent = true;
      }
    };
    if (item.fxDelay > 0) setTimeout(speak, item.fxDelay * 1000);
    else speak();
  }

  _finish() {
    const item = this.current;
    this.current = null;
    this._utter = null;
    if (item.squelch && this._fxReady()) this._squelchTail(item.station.kind, item.signal);
    else this._fxOff();
    // the reply follows 0.5-1.0 s later and keeps its place in the queue
    const rb = item.readback;
    if (rb && rb.station && this.settings.chatter === 'full') {
      const gap = 0.5 + Math.random() * 0.5;
      const r = this._item(rb.station, rb.text, { display: rb.display, expires: 8, readback: rb.readback }, Math.max(1, item.priority));
      r.front = true;
      r.notBefore = this.time + gap;
      this.queue.unshift(r);
      this._gapUntil = this.time + gap;
    } else {
      this._gapUntil = this.time + (item.machine ? 0.15 : 0.35 + Math.random() * 0.55);
    }
  }

  // stop the current transmission; important calls get repeated afterwards
  _cut(requeue) {
    const item = this.current;
    if (!item) return;
    this._cancelSpeech();
    this.current = null;
    this._fxOff();
    if (requeue && !item.machine && item.priority >= 1 && !item.requeued && this.time - item.start < item.duration * 0.8) {
      item.requeued = true;
      item.front = true;
      item.notBefore = 0;
      item.expiresAt = this.time + 10;
      this.queue.push(item);
    }
    this._gapUntil = this.time + 0.08;
  }

  _cancelSpeech() {
    this._utter = null;
    if (!hasSpeech()) return;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  _speechOn() {
    return this.settings.voice !== false && !!(this.audio ? this.audio.voice !== false : true) && hasSpeech();
  }

  // ------------------------------------------------------------------ voices
  _voiceFor(role) {
    if (!this._voices) this._pickVoices();
    return this._roleVoice[role] || this._roleVoice.tower || null;
  }

  _pickVoices() {
    this._roleVoice = {};
    let list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) { list = []; }
    const en = list.filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
    this._voices = en;
    if (!en.length) return;
    const score = (v) => (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2) + (v.localService === false ? -0.2 : 0);
    const sorted = en.slice().sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
    // deterministic: each role in turn takes the next voice, wrapping around
    ROLE_ORDER.forEach((role, i) => { this._roleVoice[role] = sorted[i % sorted.length]; });
    const female = sorted.find((v) => FEMALE.test(v.name));
    if (female) this._roleVoice.warning = female;
    // the automated callout voice should differ from the crew voice when possible
    if (sorted.length > 1 && this._roleVoice.callout === this._roleVoice.crew) {
      this._roleVoice.callout = sorted[(sorted.indexOf(this._roleVoice.crew) + 1) % sorted.length];
    }
  }

  // ------------------------------------------------------------------ radio FX
  _fxReady() {
    if (!this.settings.fx || !this._speechOn()) return false;
    const a = this.audio;
    if (!a || !a.ctx || !a.master || !a.white) return false;
    if (!this._fx) this._buildFx();
    return !!this._fx;
  }

  _buildFx() {
    const a = this.audio, ctx = a.ctx;
    try {
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(a.master);
      // carrier hiss: band-limited noise with a slow flutter
      const src = ctx.createBufferSource();
      src.buffer = a.white;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 350;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6.5;
      const depth = ctx.createGain();
      depth.gain.value = 0;
      lfo.connect(depth).connect(hiss.gain);
      // crackle: a choppy square-wave gate on high-passed noise
      const chop = ctx.createOscillator();
      chop.type = 'square';
      chop.frequency.value = 13;
      const chopDepth = ctx.createGain();
      chopDepth.gain.value = 0;
      const crackle = ctx.createGain();
      crackle.gain.value = 0;
      chop.connect(chopDepth).connect(crackle.gain);
      const chp = ctx.createBiquadFilter();
      chp.type = 'highpass';
      chp.frequency.value = 1800;
      src.connect(hp).connect(lp).connect(hiss).connect(out);
      src.connect(chp).connect(crackle).connect(out);
      src.start();
      lfo.start();
      chop.start();
      this._fx = { out, hiss, depth, crackle, chopDepth, chop, lfo, level: 0 };
    } catch (e) {
      this._fx = null;
      this.settings.fx = false;
    }
  }

  _keyUp(kind, signal = 1) {
    const fx = this._fx, ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const base = FX_KIND[kind] || FX_KIND.atc;
    // weak signals: louder hiss, deeper fading and more crackle
    const weak = 1 - signal;
    const k = { hiss: base.hiss * (1 + weak * 2.2), flutter: Math.min(0.9, base.flutter + weak * 0.4), crackle: Math.min(1, base.crackle + weak * 0.7) };
    // mic key click + short noise burst as the carrier comes up
    this._burst({ type: 'bandpass', freq: 2600, q: 3, gain: 0.1, attack: 0.002, decay: 0.035 });
    this._burst({ type: 'bandpass', freq: 1500, q: 0.6, gain: 0.07 + weak * 0.05, attack: 0.004, decay: 0.09, delay: 0.02 });
    fx.hiss.gain.cancelScheduledValues(t);
    fx.hiss.gain.setTargetAtTime(k.hiss, t + 0.03, 0.02);
    fx.depth.gain.setTargetAtTime(k.hiss * k.flutter, t + 0.03, 0.05);
    fx.lfo.frequency.setValueAtTime(4 + Math.random() * 5, t);
    fx.crackle.gain.setTargetAtTime(k.hiss * k.crackle * 0.6, t + 0.03, 0.05);
    fx.chopDepth.gain.setTargetAtTime(k.hiss * k.crackle * 0.6, t + 0.03, 0.05);
    fx.chop.frequency.setValueAtTime(9 + Math.random() * 14, t);
    fx.level = k.hiss;
  }

  // the classic "kssht" as the carrier drops
  _squelchTail(kind, signal = 1) {
    const k = FX_KIND[kind] || FX_KIND.atc;
    this._burst({ type: 'bandpass', freq: 1700 + Math.random() * 500, q: 0.55, gain: 0.09 + k.crackle * 0.05 + (1 - signal) * 0.05, attack: 0.004, decay: 0.15 + Math.random() * 0.07 });
    this._fxOff(0.03);
  }

  _fxOff(tc = 0.02) {
    const fx = this._fx;
    if (!fx || !this.audio.ctx) return;
    const t = this.audio.ctx.currentTime;
    for (const g of [fx.hiss.gain, fx.depth.gain, fx.crackle.gain, fx.chopDepth.gain]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0, t, tc);
    }
    fx.level = 0;
  }

  _updateFx() {
    // keep the hiss alive only while something is on the air
    if (this._fx && this._fx.level > 0 && !this.current) this._fxOff();
  }

  _burst({ type, freq, q, gain, attack, decay, delay = 0 }) {
    const a = this.audio, ctx = a.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = a.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    src.connect(f).connect(g).connect(this._fx.out);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + attack + decay + 0.05);
  }
}
