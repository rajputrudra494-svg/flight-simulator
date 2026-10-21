// DOM menus: title, campaign, briefing, free flight, hangar, settings,
// controls, pause and results screens.
import { MISSIONS } from '../game/missions.js';
import { JETS, MILITARY_ORDER, HEAVY_ORDER, AIRLINER_ORDER } from '../aircraft/jets.js';
import { MAPS, MAP_ORDER } from '../world/maps.js';
import { PRESETS, QUALITY_ORDER } from '../core/Quality.js';
import { ControlsScreen } from './ControlsScreen.js';

// line icons for the title menu (24 x 24, stroke = currentColor)
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  medal: svg('<path d="M8 3h8l-2 6h-4z"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.4l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/>'),
  jet: svg('<path d="M12 2.5l1.6 5.5 7.4 4v1.8l-7.4-1.6-.6 5.3 2.6 2v1.5L12 20l-3.6 1v-1.5l2.6-2-.6-5.3L3 13.8V12l7.4-4z"/>'),
  hangar: svg('<path d="M2.5 20.5V10L12 4l9.5 6v10.5"/><path d="M6.5 20.5v-6h11v6"/><path d="M9 17h6"/>'),
  pad: svg('<path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.4l-1 4.6a2.6 2.6 0 0 1-4.5 1.2L14 16h-4l-1.9 2.2A2.6 2.6 0 0 1 3.6 17l-1-4.6A4.5 4.5 0 0 1 7 7z"/><path d="M7.5 10.5v3M6 12h3"/><circle cx="15.5" cy="11" r=".6"/><circle cx="17.5" cy="13" r=".6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>'),
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n, max = 3) => Array.from({ length: max }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');
const TIME_LABELS = { default: 'Map default', dawn: 'Dawn', morning: 'Morning', noon: 'Noon', afternoon: 'Afternoon', sunset: 'Sunset', dusk: 'Dusk', night: 'Night' };
const MAP_GRADIENTS = {
  pacific: 'linear-gradient(135deg,#0f6f86,#3fb6a8 45%,#e7d9a8)',
  canyon: 'linear-gradient(135deg,#7a3a1e,#c46a3a 50%,#e2b07a)',
  alps: 'linear-gradient(135deg,#2c4a63,#8aa3b8 55%,#f2f5f8)',
  arctic: 'linear-gradient(135deg,#1c2f45,#6d8fae 50%,#f1c08a)',
  highlands: 'linear-gradient(135deg,#2e4a22,#7f9a45 50%,#f0a060)',
  metro: 'linear-gradient(135deg,#1c2a3a,#4f6f8f 45%,#c9d6e0)',
  desert: 'linear-gradient(135deg,#3a2414,#c27a3a 50%,#f4c46e)',
};

// which aircraft a mission accepts
function allowedJets(m) {
  if (m.aircraft === 'cargo') return [m.forceJet || 'an124'];
  if (m.aircraft === 'civil') return AIRLINER_ORDER.filter((id) => JETS[id].category !== 'cargo');
  return [...MILITARY_ORDER, ...HEAVY_ORDER];
}

const JET_TABS = [
  ['military', 'Fighters & attack', () => MILITARY_ORDER],
  ['heavy', 'Bombers & special', () => HEAVY_ORDER],
  ['civil', 'Airliners & cargo', () => AIRLINER_ORDER],
];

export class Menus {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.screen = null;
    this.history = [];
    this.selectedMission = 0;
    this.free = { map: 'pacific', time: 'default', enemies: 'none', ground: false, rings: true, start: 'air', traffic: 'light' };
    this.jetTab = 'military';
    this.controlsScreen = new ControlsScreen(this);
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    root.addEventListener('change', (e) => this._onInput(e));
  }

  get save() {
    return this.game.save;
  }

  show(screen, push = true) {
    if (push && this.screen && this.screen !== screen) this.history.push(this.screen);
    if (this.screen === 'controls' && screen !== 'controls') this.controlsScreen.leave();
    // re-rendering the same screen keeps its scroll position
    const same = this.screen === screen;
    const scroller = same ? this.root.querySelector('.panel') : null;
    const scroll = scroller ? scroller.scrollTop : 0;
    this.screen = screen;
    const fn = this['_' + screen];
    this.root.innerHTML = fn ? fn.call(this) : '';
    if (scroll) {
      const p = this.root.querySelector('.panel');
      if (p) p.scrollTop = scroll;
    }
    this.root.style.display = screen ? 'flex' : 'none';
    this.root.className = 'ui screen-' + screen;
    this.game.onMenuScreen(screen);
  }

  hide() {
    if (this.screen === 'controls') this.controlsScreen.leave();
    this.screen = null;
    this.root.innerHTML = '';
    this.root.style.display = 'none';
  }

  back() {
    const prev = this.history.pop();
    if (prev) this.show(prev, false);
    else this.show('title', false);
  }

  _onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    this.game.audio.init();
    this.game.audio.click();
    // iOS only grants motion access from a tap: ask on the first one in the menus
    const g = this.game;
    if (g.settings.gyro && g.gyro.needsPermission && g.gyro.permission === 'unknown') g._enableGyro(true);
    if (this.screen === 'controls' && this.controlsScreen.onClick(el)) return;
    const a = el.dataset.action;
    const v = el.dataset.value;
    switch (a) {
      case 'nav': this.show(v); break;
      case 'back': this.back(); break;
      case 'mission': {
        const i = Number(v);
        if (!this.save.isMissionUnlocked(i, MISSIONS)) return;
        this.selectedMission = i;
        this.show('briefing');
        break;
      }
      case 'jet-tab':
        this.jetTab = v;
        this.show(this.screen, false);
        break;
      case 'jet': {
        const jet = JETS[v];
        // free flight flies anything; the hangar shows anything; missions need the unlock
        if (this.screen === 'briefing' && !this.save.isJetUnlocked(jet)) return;
        this.save.data.jet = v;
        this.save.write();
        this.game.onJetSelected(v);
        this.show(this.screen, false);
        break;
      }
      case 'launch': {
        const m = MISSIONS[this.selectedMission];
        this.game.startMission(m, this._jetFor(m));
        break;
      }
      case 'launch-free': this.game.startFree({ ...this.free }, this.save.data.jet); break;
      // straight into the air over the current free-flight theatre
      case 'quick-flight': this.game.startFree({ ...this.free, start: 'air' }, this.save.data.jet); break;
      case 'title-jet': {
        const ids = [...MILITARY_ORDER, ...HEAVY_ORDER, ...AIRLINER_ORDER];
        const i = ids.indexOf(this.save.data.jet);
        const id = ids[(i + Number(v) + ids.length) % ids.length];
        this.save.data.jet = id;
        this.save.write();
        this.game.onJetSelected(id);
        this.show('title', false);
        break;
      }
      case 'free-map': this.free.map = v; this.game.onFreeMapPreview?.(v); this.show('free', false); break;
      case 'resume': this.game.resume(); break;
      case 'restart': this.game.restart(); break;
      case 'quit': this.game.quitToMenu(); break;
      case 'next': this.game.nextMission(); break;
      case 'reset-progress':
        if (confirm('Reset all campaign progress?')) { this.save.reset(); this.show('settings', false); }
        break;
      case 'fullscreen':
        if (!document.fullscreenElement) {
          const p = document.documentElement.requestFullscreen?.();
          // phones: hold landscape while fullscreen (where the browser allows it)
          if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape')?.catch?.(() => {})).catch(() => {});
        } else document.exitFullscreen?.();
        break;
      default: break;
    }
  }

  _onInput(e) {
    const el = e.target;
    if (this.screen === 'controls' && this.controlsScreen.onInput(el)) return;
    const key = el.dataset.setting;
    if (key) {
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'range') val = Number(el.value);
      else val = el.value;
      if (key === 'difficulty') val = Number(val);
      this.game.applySetting(key, val);
      if (el.type === 'range') {
        const out = el.parentElement.querySelector('output');
        if (out) out.textContent = key === 'volume' || key === 'brightness' ? `${Math.round(val * 100)}%` : val.toFixed(1);
      }
      return;
    }
    const fkey = el.dataset.free;
    if (fkey) {
      this.free[fkey] = el.type === 'checkbox' ? el.checked : el.value;
    }
  }

  // ---------------------------------------------------------------- screens
  // Title: logo, quick flight, the main menu with live info, and a featured
  // aircraft card that browses the whole hangar on the 3D showcase.
  _title() {
    const done = this.save.completedCount();
    const total = MISSIONS.length;
    const nJets = MILITARY_ORDER.length + HEAVY_ORDER.length + AIRLINER_ORDER.length;
    const jet = JETS[this.save.data.jet] || JETS.f16;
    const ids = [...MILITARY_ORDER, ...HEAVY_ORDER, ...AIRLINER_ORDER];
    const f = jet.flight;
    const span = jet.design.wing.stations[jet.design.wing.stations.length - 1].x * 2;
    const anim = this._titleShown ? 'no-anim' : '';
    this._titleShown = true;
    const item = (value, icon, label, sub, extra = '') => `
        <button data-action="nav" data-value="${value}"><span class="ic">${ICONS[icon]}</span><span class="tx"><b>${label}</b><small>${sub}</small></span>${extra}<span class="go">›</span></button>`;
    return `
    <div class="title-screen ${anim}">
      <div class="ts-frame"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></div>
      <div class="ts-left">
        <div class="logo">
          <div class="logo-kicker"><span></span>COMBAT FLIGHT SIMULATOR</div>
          <div class="logo-top">STRIKE</div>
          <div class="logo-bottom">HORIZON</div>
        </div>
        <button class="ts-play" data-action="quick-flight"><span class="play-ic">▶</span><span class="tx"><b>Quick flight</b><small>Take off now in the ${esc(jet.name)}</small></span></button>
        <nav class="ts-menu">
          ${item('campaign', 'medal', 'Campaign', `${total} missions · ${done} complete`, `<span class="prog"><i style="width:${Math.round((done / total) * 100)}%"></i></span>`)}
          ${item('free', 'jet', 'Free flight', `All ${nJets} aircraft unlocked · 7 theatres`)}
          ${item('hangar', 'hangar', 'Hangar', `${nJets} aircraft · specs &amp; history`)}
          ${item('controls', 'pad', 'Controls', 'Custom keys · gamepad · touch &amp; tilt')}
          ${item('settings', 'gear', 'Settings', 'Graphics · audio · gameplay')}
        </nav>
        <div class="ts-foot">
          <span class="chip">${esc(PRESETS[this.game.qualityKey].label)} graphics</span>
          <button class="link" data-action="fullscreen">⛶ Fullscreen</button>
        </div>
      </div>
      <div class="ts-reticle" id="ts-reticle"><i class="r tl"></i><i class="r tr"></i><i class="r bl"></i><i class="r br"></i><span class="ret-label">${esc(jet.name.toUpperCase())}</span><span class="ret-data" id="ts-ret-data"></span></div>
      <aside class="ts-card">
        <div class="tc-head"><span class="tc-tag">Featured aircraft</span><span class="tc-count">${ids.indexOf(jet.id) + 1} / ${ids.length}</span></div>
        <div class="tc-name">${esc(jet.name)}</div>
        <div class="tc-role">${esc(jet.role)}</div>
        <div class="tc-specs">
          <div><b>M ${f.maxMach}</b><small>Top speed</small></div>
          <div><b>${span.toFixed(1)} m</b><small>Span</small></div>
          <div><b>${f.maxG} G</b><small>Max load</small></div>
          <div><b>${((f.thrustAB * 1000) / (f.mass * 9.81)).toFixed(2)}</b><small>Thrust / wt</small></div>
        </div>
        <div class="tc-nav">
          <button data-action="title-jet" data-value="-1" aria-label="Previous aircraft">‹</button>
          <button class="tc-fly" data-action="quick-flight">Fly it ▸</button>
          <button data-action="title-jet" data-value="1" aria-label="Next aircraft">›</button>
        </div>
      </aside>
    </div>`;
  }

  _campaign() {
    const cards = MISSIONS.map((m, i) => {
      const unlocked = this.save.isMissionUnlocked(i, MISSIONS);
      const rec = this.save.data.completed[m.id];
      const map = MAPS[m.map];
      const special = !!m.requires;
      const hard = m.difficulty >= 5;
      return `
      <button class="mission-card ${unlocked ? '' : 'locked'} ${special ? 'special' : ''}" data-action="mission" data-value="${i}" style="--grad:${MAP_GRADIENTS[m.map]}" title="${!unlocked && special ? esc(m.requiresText || '') : ''}">
        <div class="mc-art"><span class="mc-num">${String(i + 1).padStart(2, '0')}</span>${hard ? '<span class="badge hard">HARD</span>' : ''}${special ? '<span class="badge sp">SPECIAL OP</span>' : ''}${unlocked ? '' : '<span class="lock">🔒</span>'}</div>`
        + (!unlocked && special ? `<div class="mc-req">${esc(m.requiresText || '')}</div>` : '') + `
        <div class="mc-body">
          <div class="mc-type">${esc(m.type)} · ${esc(map.name)}</div>
          <div class="mc-name">${esc(m.name)}</div>
          <div class="mc-meta"><span class="diff">${'◆'.repeat(m.difficulty)}${'◇'.repeat(5 - m.difficulty)}</span>${stars(rec ? rec.stars : 0)}</div>
        </div>
      </button>`;
    }).join('');
    return `
    <div class="panel wide">
      <header><button class="back" data-action="back">‹ Back</button><h2>Campaign</h2><span class="hint">Complete missions to unlock new aircraft</span></header>
      <div class="mission-grid">${cards}</div>
    </div>`;
  }

  _lockText(j) {
    if (j.requires) {
      const names = j.requires.map((id) => (MISSIONS.find((m) => m.id === id) || { name: id }).name);
      return `Complete ${names.join(', ')}`;
    }
    return `Complete ${j.unlock} missions`;
  }

  // the selected jet if the mission accepts it, else the first unlocked one
  _jetFor(m) {
    const allowed = allowedJets(m);
    const cur = this.save.data.jet;
    if (allowed.includes(cur) && this.save.isJetUnlocked(JETS[cur])) return cur;
    return allowed.find((id) => this.save.isJetUnlocked(JETS[id])) || allowed[0];
  }

  // allowed: fixed list for a mission briefing; otherwise tabs over the whole hangar.
  // free: free flight, where every aircraft is unlocked
  _jetPicker(allowed = null, free = false) {
    const tabs = !allowed;
    const tab = JET_TABS.find((t) => t[0] === this.jetTab) || JET_TABS[0];
    const ids = allowed || tab[2]();
    const cur = this.save.data.jet;
    const current = allowed ? (allowed.includes(cur) && this.save.isJetUnlocked(JETS[cur]) ? cur : allowed.find((id) => this.save.isJetUnlocked(JETS[id])) || allowed[0]) : cur;
    const tabHtml = tabs
      ? `<div class="jet-tabs">${JET_TABS.map(([id, label, list]) => `<button class="${this.jetTab === id ? 'on' : ''}" data-action="jet-tab" data-value="${id}">${esc(label)} <small>${list().length}</small></button>`).join('')}</div>`
      : '';
    const hangar = this.screen === 'hangar';
    return `${tabHtml}<div class="jet-picker">${ids.map((id) => {
      const j = JETS[id];
      const campaign = this.save.isJetUnlocked(j);
      const unlocked = free || campaign;
      const sel = (allowed ? current : this.save.data.jet) === id;
      const lockTxt = j.requires ? 'Special: ' + j.requires.length + ' set missions' : j.unlock + ' missions';
      // the hangar shows everything, with the campaign lock as a note
      const role = unlocked ? esc(j.role) : hangar ? `${esc(j.role)} · 🔒 campaign` : `🔒 ${esc(lockTxt)}`;
      return `<button class="jet-chip ${sel ? 'sel' : ''} ${unlocked || hangar ? '' : 'locked'} ${j.exclusive ? 'special' : ''}" data-action="jet" data-value="${id}" title="${unlocked ? '' : esc(this._lockText(j))}">
        <span class="jc-name">${esc(j.name)}</span><span class="jc-role">${role}</span></button>`;
    }).join('')}</div>`;
  }

  _statBars(j) {
    const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
    return `<div class="stats">${bar('Speed', j.stats.speed)}${bar('Agility', j.stats.agility)}${bar('Firepower', j.stats.firepower)}${bar('Armour', j.stats.armor)}</div>`;
  }

  _briefing() {
    const m = MISSIONS[this.selectedMission];
    const map = MAPS[m.map];
    const jet = JETS[this._jetFor(m)] || JETS.f16;
    const rec = this.save.data.completed[m.id];
    const allowed = allowedJets(m);
    return `
    <div class="panel wide briefing">
      <header><button class="back" data-action="back">‹ Back</button><h2>Mission ${this.selectedMission + 1}: ${esc(m.name)}</h2>${stars(rec ? rec.stars : 0)}</header>
      <div class="brief-grid">
        <section>
          <div class="brief-art" style="--grad:${MAP_GRADIENTS[m.map]}"><div><b>${esc(map.name)}</b><br>${esc(map.subtitle)}</div><div class="tod">${esc(TIME_LABELS[m.time] || 'Default')}</div></div>
          <h3>Briefing</h3>
          <p>${esc(m.briefing)}</p>
          <h3>Pilot notes</h3>
          <ul>${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          ${rec ? `<p class="best">Best score: <b>${rec.best}</b></p>` : ''}
        </section>
        <section>
          <h3>${m.aircraft === 'cargo' ? 'Assigned aircraft' : m.aircraft === 'civil' ? 'Select airliner' : 'Select aircraft'}</h3>
          ${this._jetPicker(allowed)}
          <div class="jet-detail"><b>${esc(jet.name)}</b> — ${esc(jet.role)}${this._statBars(jet)}</div>
          <button class="launch" data-action="launch">Launch mission ▸</button>
        </section>
      </div>
    </div>`;
  }

  _free() {
    const f = this.free;
    const mapCards = MAP_ORDER.map((id) => {
      const m = MAPS[id];
      return `<button class="map-card ${f.map === id ? 'sel' : ''}" data-action="free-map" data-value="${id}" style="--grad:${MAP_GRADIENTS[id]}"><b>${esc(m.name)}</b><small>${esc(m.subtitle)}</small></button>`;
    }).join('');
    const opt = (key, values, labels) => `<select data-free="${key}">${values.map((v, i) => `<option value="${v}" ${f[key] === v ? 'selected' : ''}>${labels[i]}</option>`).join('')}</select>`;
    return `
    <div class="panel wide">
      <header><button class="back" data-action="back">‹ Back</button><h2>Free Flight</h2><span class="hint">Explore any theatre. Land on the runway to rearm and repair.</span></header>
      <div class="map-grid">${mapCards}</div>
      <div class="free-opts">
        <label>Time of day ${opt('time', ['default', 'dawn', 'morning', 'noon', 'afternoon', 'sunset', 'dusk', 'night'], ['Map default', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Sunset', 'Dusk', 'Night'])}</label>
        <label>Air traffic ${opt('traffic', ['none', 'light', 'heavy'], ['None', 'Light', 'Heavy'])}</label>
        <label>Enemy fighters ${opt('enemies', ['none', 'few', 'many'], ['None', 'A few', 'Many'])}</label>
        <label>Start ${opt('start', ['air', 'runway'], ['In the air', 'On the runway'])}</label>
        <label class="chk"><input type="checkbox" data-free="ground" ${f.ground ? 'checked' : ''}> Ground targets</label>
        <label class="chk"><input type="checkbox" data-free="rings" ${f.rings ? 'checked' : ''}> Ring course</label>
      </div>
      <h3>Aircraft <small class="free-all">every aircraft is unlocked in free flight</small></h3>
      ${this._jetPicker(null, true)}
      <button class="launch" data-action="launch-free">Take off ▸</button>
    </div>`;
  }

  _hangar() {
    const jet = JETS[this.save.data.jet] || JETS.f16;
    const f = jet.flight;
    return `
    <div class="hangar">
      <div class="panel side">
        <header><button class="back" data-action="back">‹ Back</button><h2>Hangar</h2><span class="hint">${MILITARY_ORDER.length + HEAVY_ORDER.length + AIRLINER_ORDER.length} aircraft</span></header>
        ${this._jetPicker()}
      </div>
      <div class="panel side right">
        <h2>${esc(jet.name)}</h2>
        <div class="role">${esc(jet.role)}</div>
        <p>${esc(jet.description)}</p>
        ${this._statBars(jet)}
        <table class="specs">
          <tr><td>Length / span</td><td>${jet.design.length.toFixed(1)} m / ${(jet.design.wing.stations[jet.design.wing.stations.length - 1].x * 2).toFixed(1)} m</td></tr>
          <tr><td>Wing area</td><td>${f.wingArea} m²</td></tr>
          <tr><td>Max thrust</td><td>${f.thrustAB} kN${f.noAB ? '' : ' (AB)'}</td></tr>
          <tr><td>${jet.civil ? 'Flight weight' : 'Combat weight'}</td><td>${(f.mass / 1000).toFixed(1)} t</td></tr>
          <tr><td>Thrust / weight</td><td>${((f.thrustAB * 1000) / (f.mass * 9.81)).toFixed(2)}</td></tr>
          <tr><td>Max G</td><td>${f.maxG}</td></tr>
          <tr><td>Roll rate</td><td>${f.rollRate}°/s</td></tr>
          <tr><td>Max AoA</td><td>${f.maxAoA}°${f.tvc ? ' (thrust vectoring)' : ''}</td></tr>
          <tr><td>Top speed</td><td>Mach ${f.maxMach}</td></tr>
          <tr><td>Armament</td><td>${esc(this._armament(jet))}</td></tr>
          ${f.ceiling ? `<tr><td>Service ceiling</td><td>${Math.round(f.ceiling / 100) * 100} m</td></tr>` : ''}
          <tr><td>Radar signature</td><td>${(jet.stealth ?? 1) < 0.2 ? 'Very low (stealth)' : (jet.stealth ?? 1) < 0.5 ? 'Low (stealth)' : (jet.stealth ?? 1) < 1 ? 'Reduced' : (jet.stealth ?? 1) > 1.2 ? 'Very large' : 'Normal'}</td></tr>
        </table>
        ${this.save.isJetUnlocked(jet) ? '' : `<p class="unlock-note">🔒 Campaign: ${esc(this._lockText(jet))}. Free to fly in Free Flight.</p>`}
      </div>
    </div>`;
  }

  _armament(j) {
    const w = j.weapons;
    if (j.civil || j.unarmed || (!w.missiles && !w.bombs && !w.gunAmmo)) return 'None';
    const parts = [];
    if (w.bombs) parts.push(`${w.bombs} × ${w.bombName || 'guided bombs'}`);
    if (w.missiles) parts.push(`${w.missiles} missiles`);
    if (w.gunAmmo) parts.push(`gun ${w.gunAmmo} rds`);
    return parts.join(' · ');
  }

  _settings() {
    const s = this.game.settings;
    const sel = (key, values, labels) => `<select data-setting="${key}">${values.map((v, i) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${labels[i]}</option>`).join('')}</select>`;
    const chk = (key) => `<input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}>`;
    const rng = (key, min, max, step, fmt) => `<input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${fmt(s[key])}</output>`;
    return `
    <div class="panel">
      <header><button class="back" data-action="back">‹ Back</button><h2>Settings</h2></header>
      <div class="settings">
        <h3>Graphics</h3>
        <label>Quality ${sel('quality', ['auto', ...QUALITY_ORDER], ['Auto-detect', ...QUALITY_ORDER.map((q) => PRESETS[q].label)])}</label>
        <label>Dynamic resolution ${chk('dynamicRes')}</label>
        <label>Scene brightness ${rng('brightness', 0.5, 1.3, 0.05, (v) => `${Math.round(v * 100)}%`)}</label>
        <label>Show FPS ${chk('showFps')}</label>
        <label>Camera shake ${chk('cameraShake')}</label>
        <p class="note">Terrain and cloud detail changes apply from the next flight.</p>
        <h3>Controls</h3>
        <label>Invert pitch ${chk('invertPitch')}</label>
        <label>Mouse flight (pointer lock) ${chk('mouseFlight')}</label>
        <label>Mouse sensitivity ${rng('sensitivity', 0.3, 2.5, 0.1, (v) => Number(v).toFixed(1))}</label>
        <label>Tilt steering on phones (gyro) ${chk('gyro')}</label>
        <button class="small-btn" data-action="nav" data-value="controls">Key bindings, gamepad, touch layout &amp; tilt…</button>
        <h3>Gameplay</h3>
        <label>Difficulty ${sel('difficulty', [0.7, 1, 1.25], ['Recruit', 'Pilot', 'Ace'])}</label>
        <label>Lock-on assist (easy targeting) ${chk('lockAssist')}</label>
        <label>Targeting pod window ${chk('targetCam')}</label>
        <label>Units ${sel('units', ['imperial', 'metric'], ['Knots / feet', 'km/h / metres'])}</label>
        <label>Unlock all missions &amp; aircraft ${chk('unlockAll')}</label>
        <h3>Audio</h3>
        <label>Master volume ${rng('volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}</label>
        <label>Voice call-outs ${chk('voice')}</label>
        <label>ATC &amp; radio traffic ${sel('atc', ['full', 'essential', 'off'], ['Full (readbacks, traffic, chatter)', 'Essential clearances', 'Mission calls only'])}</label>
        <label>Radio static &amp; squelch ${chk('radioFx')}</label>
        <button class="danger" data-action="reset-progress">Reset campaign progress</button>
      </div>
    </div>`;
  }

  _controls() {
    return this.controlsScreen.render();
  }

  _pause() {
    return `
    <div class="panel narrow center">
      <h2>Paused</h2>
      <nav class="main-menu">
        <button data-action="resume" class="primary">Resume</button>
        <button data-action="restart">Restart</button>
        <button data-action="nav" data-value="settings">Settings</button>
        <button data-action="nav" data-value="controls">Controls</button>
        <button data-action="quit">Quit to menu</button>
      </nav>
    </div>`;
  }

  _results() {
    const r = this.game.lastResult;
    if (!r) return '';
    const m = MISSIONS.find((x) => x.id === r.missionId);
    const hasNext = r.success && m && MISSIONS.indexOf(m) < MISSIONS.length - 1;
    const mm = Math.floor(r.time / 60), ss = Math.floor(r.time % 60);
    const unlockedJets = this.game.newlyUnlocked || [];
    return `
    <div class="panel narrow center results ${r.success ? 'win' : 'lose'}">
      <h2>${r.success ? 'Mission Accomplished' : 'Mission Failed'}</h2>
      ${r.success ? `<div class="big-stars">${stars(r.stars)}</div>` : `<p class="reason">${esc(r.reason || '')}</p>`}
      <table class="score">
        <tr><td>Mission score</td><td>${r.breakdown.base}</td></tr>
        <tr><td>Time bonus</td><td>${r.breakdown.timeBonus}</td></tr>
        <tr><td>Accuracy bonus (${Math.round(r.accuracy * 100)}%)</td><td>${r.breakdown.accBonus}</td></tr>
        <tr><td>Airframe bonus</td><td>${r.breakdown.healthBonus}</td></tr>
        <tr class="total"><td>Total</td><td>${r.score}</td></tr>
        <tr><td>Kills (air / ground)</td><td>${r.kills.air} / ${r.kills.ground}</td></tr>
        ${r.rings ? `<tr><td>Checkpoints</td><td>${r.rings.passed} / ${r.rings.total}</td></tr>` : ''}
        <tr><td>Flight time</td><td>${mm}:${String(ss).padStart(2, '0')}</td></tr>
      </table>
      ${unlockedJets.length ? `<p class="unlock">New aircraft unlocked: <b>${unlockedJets.map((id) => esc(JETS[id].name)).join(', ')}</b></p>` : ''}
      <nav class="main-menu row">
        ${hasNext ? '<button data-action="next" class="primary">Next mission ▸</button>' : ''}
        <button data-action="restart" class="${hasNext ? '' : 'primary'}">Retry</button>
        <button data-action="quit">Menu</button>
      </nav>
    </div>`;
  }
}
