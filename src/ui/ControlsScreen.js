// Controls screen: the player's own control layout. Click a binding and press
// a key, mouse button or gamepad button to change it (Esc cancels, Backspace
// clears); pick the gamepad / joystick axes, dead zone and response curve;
// set up touch controls, tilt steering and vibration on phones and tablets.
import {
  ACTION_GROUPS, ACTION_LABELS, PRESETS, RESERVED_CODES, actionsUsing, applyPreset, codeName, padName, axisName, defaultControls, resolveControls,
} from '../core/Controls.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AXES = [['pitch', 'Pitch'], ['roll', 'Roll'], ['yaw', 'Rudder'], ['lookY', 'Look up / down'], ['throttle', 'Throttle lever (HOTAS)']];

export class ControlsScreen {
  constructor(menus) {
    this.menus = menus;
    this.capture = null; // { kind: 'key'|'pad'|'axis', action, slot }
    this.note = '';
    this._onKey = (e) => this._captureKey(e);
    this._onMouse = (e) => this._captureMouse(e);
    this._poll = () => this._pollPad();
  }

  get game() {
    return this.menus.game;
  }

  // a private copy of the live layout to edit
  _ctrl() {
    return resolveControls(JSON.parse(JSON.stringify(this.game.input.controls)));
  }

  _commit(ctrl) {
    this.game.applySetting('controls', JSON.parse(JSON.stringify(ctrl)));
  }

  render() {
    const g = this.game;
    const s = g.settings;
    const c = g.input.controls;
    const cap = this.capture;
    const cell = (action, slot) => {
      const capturing = cap && cap.kind === 'key' && cap.action === action && cap.slot === slot;
      const code = c.keys[action] ? c.keys[action][slot] : null;
      return `<button class="bind ${capturing ? 'capturing' : ''} ${code ? '' : 'empty'}" data-action="ctl-key" data-value="${action}:${slot}">${capturing ? 'Press a key…' : code ? esc(codeName(code)) : '—'}</button>`;
    };
    const padCell = (action) => {
      const capturing = cap && cap.kind === 'pad' && cap.action === action;
      const list = c.pad[action] || [];
      return `<button class="bind pad ${capturing ? 'capturing' : ''} ${list.length ? '' : 'empty'}" data-action="ctl-pad" data-value="${action}">${capturing ? 'Press a button…' : list.length ? list.map(padName).join(' / ') : '—'}</button>`;
    };
    const groups = ACTION_GROUPS.map((grp) => `
      <tr class="grp"><th colspan="4">${esc(grp.name)}</th></tr>
      ${grp.actions.map(([id, label]) => `<tr><td>${esc(label)}</td><td>${cell(id, 0)}</td><td>${cell(id, 1)}</td><td>${padCell(id)}</td></tr>`).join('')}`).join('');
    const pad = g.input.gamepad();
    const nAxes = Math.max(4, pad ? pad.axes.length : 4);
    const axisRows = AXES.map(([id, label]) => {
      const a = c.axes[id] || { axis: -1, invert: false };
      const capturing = cap && cap.kind === 'axis' && cap.action === id;
      const opts = [-1, ...Array.from({ length: nAxes }, (_, i) => i)].map((i) => `<option value="${i}" ${a.axis === i ? 'selected' : ''}>${esc(axisName(i))}</option>`).join('');
      return `<tr><td>${esc(label)}</td><td><select data-ctl-axis="${id}">${opts}</select></td>
        <td><label class="inline"><input type="checkbox" data-ctl-invert="${id}" ${a.invert ? 'checked' : ''}> Invert</label></td>
        <td><button class="bind ${capturing ? 'capturing' : ''}" data-action="ctl-axis" data-value="${id}">${capturing ? 'Move the axis…' : 'Detect'}</button></td></tr>`;
    }).join('');
    const rng = (key, min, max, step, val, fmt) => `<input type="range" data-ctl="${key}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${fmt(val)}</output>`;
    const sel = (key, values, labels) => `<select data-setting="${key}">${values.map((v, i) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${labels[i]}</option>`).join('')}</select>`;
    const chk = (key) => `<input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}>`;
    const gy = g.gyro;
    const gyroNote = !gy.available ? 'This device has no motion sensors.' : gy.permission === 'denied' ? 'Motion access was refused: allow it in the browser settings, then switch tilt steering on again.' : 'Hold the device the way you like to fly and press TILT (or Recentre) to set the neutral attitude.';
    return `
    <div class="panel wide controls-screen">
      <header><button class="back" data-action="back">‹ Back</button><h2>Controls</h2>
        <span class="hint">Click a binding, then press the key, mouse button or gamepad button you want</span></header>
      <div class="ctl-bar">
        <label>Layout preset <select data-ctl-preset><option value="">Choose…</option>${Object.entries(PRESETS).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join('')}</select></label>
        <button class="small-btn" data-action="ctl-reset">Reset all to defaults</button>
        ${this.note ? `<span class="ctl-note">${esc(this.note)}</span>` : ''}
      </div>
      <div class="ctl-grid">
        <section>
          <h3>Keyboard, mouse &amp; gamepad buttons</h3>
          <table class="controls binds"><tr><th>Action</th><th>Primary</th><th>Alternate</th><th>Gamepad</th></tr>${groups}</table>
          <p class="note">Esc always pauses. Backspace clears a binding while it is waiting for a key. Left / right mouse buttons only act as bindings in mouse flight (pointer lock); the middle and side buttons work anytime. With the ATC menu open (radio key), 1-6 pick a request.</p>
        </section>
        <section>
          <h3>Gamepad &amp; joystick axes</h3>
          <p class="note">${pad ? `Connected: ${esc(pad.id.slice(0, 60))}` : 'No gamepad detected: press any button on it to wake it up.'}</p>
          <table class="controls axes"><tr><th>Axis</th><th>Input</th><th></th><th></th></tr>${axisRows}</table>
          <div class="settings">
            <label>Stick dead zone ${rng('deadzone', 0, 0.35, 0.01, c.deadzone, (v) => Number(v).toFixed(2))}</label>
            <label>Stick response curve ${rng('expo', 0, 1, 0.05, c.expo, (v) => (v < 0.15 ? 'linear' : Number(v).toFixed(2)))}</label>
          </div>
          <h3>Keyboard &amp; mouse</h3>
          <div class="settings">
            <label>Keyboard stick speed ${rng('keyRate', 0.4, 2.5, 0.1, c.keyRate, (v) => Number(v).toFixed(1) + '×')}</label>
            <label>Invert pitch (all devices) ${chk('invertPitch')}</label>
            <label>Mouse flight (pointer lock) ${chk('mouseFlight')}</label>
            <label>Mouse sensitivity <input type="range" data-setting="sensitivity" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}"><output>${Number(s.sensitivity).toFixed(1)}</output></label>
          </div>
          <h3>Touch &amp; tilt (phones / tablets)</h3>
          <div class="settings">
            <label>On-screen controls ${sel('touchControls', ['auto', 'on', 'off'], ['Auto', 'Always on', 'Off'])}</label>
            <button class="small-btn" data-action="ctl-touch-edit">Customise touch layout…</button>
            <label>Tilt steering (gyro) ${chk('gyro')}</label>
            <label>Tilt sensitivity <input type="range" data-setting="gyroSensitivity" min="0.4" max="2.5" step="0.1" value="${s.gyroSensitivity}"><output>${Number(s.gyroSensitivity).toFixed(1)}</output></label>
            <label>Invert tilt pitch ${chk('gyroInvertPitch')}</label>
            <button class="small-btn" data-action="ctl-gyro-center" ${s.gyro ? '' : 'disabled'}>Recentre tilt</button>
            <label>Vibration ${chk('haptics')}</label>
            <p class="note">${esc(gyroNote)}</p>
          </div>
        </section>
      </div>
    </div>`;
  }

  onClick(el) {
    const a = el.dataset.action;
    const v = el.dataset.value;
    if (!a || !a.startsWith('ctl-')) return false;
    if (a === 'ctl-key') {
      const [action, slot] = v.split(':');
      this._startCapture({ kind: 'key', action, slot: Number(slot) });
    } else if (a === 'ctl-pad') {
      this._startCapture({ kind: 'pad', action: v });
    } else if (a === 'ctl-axis') {
      this._startCapture({ kind: 'axis', action: v });
    } else if (a === 'ctl-reset') {
      if (confirm('Reset every key, button and axis to the defaults?')) {
        this._commit(defaultControls());
        this.note = 'Defaults restored';
        this._refresh();
      }
    } else if (a === 'ctl-touch-edit') {
      this._stopCapture();
      this.game.editTouchLayout();
    } else if (a === 'ctl-gyro-center') {
      this.game.gyro.calibrate();
      this.note = 'Tilt centred on the current attitude';
      this._refresh();
    }
    return true;
  }

  onInput(el) {
    if (el.dataset.ctlPreset !== undefined) {
      if (!el.value) return true;
      const ctrl = applyPreset(this._ctrl(), el.value);
      this._commit(ctrl);
      this.note = `Preset: ${PRESETS[el.value].label}`;
      this._refresh();
      return true;
    }
    if (el.dataset.ctlAxis) {
      const ctrl = this._ctrl();
      ctrl.axes[el.dataset.ctlAxis].axis = Number(el.value);
      this._commit(ctrl);
      return true;
    }
    if (el.dataset.ctlInvert) {
      const ctrl = this._ctrl();
      ctrl.axes[el.dataset.ctlInvert].invert = el.checked;
      this._commit(ctrl);
      return true;
    }
    if (el.dataset.ctl) {
      const ctrl = this._ctrl();
      ctrl[el.dataset.ctl] = Number(el.value);
      this._commit(ctrl);
      const out = el.parentElement.querySelector('output');
      const k = el.dataset.ctl, v = Number(el.value);
      if (out) out.textContent = k === 'keyRate' ? v.toFixed(1) + '×' : k === 'expo' ? (v < 0.15 ? 'linear' : v.toFixed(2)) : v.toFixed(2);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- capture
  _startCapture(c) {
    this._stopCapture();
    this.capture = c;
    this.note = '';
    this.game.input.capturing = true;
    window.addEventListener('keydown', this._onKey, true);
    if (c.kind === 'key') setTimeout(() => this.capture === c && window.addEventListener('mousedown', this._onMouse, true), 0);
    if (c.kind !== 'key') {
      const pad = this.game.input.gamepad();
      this._padBase = pad ? { buttons: pad.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...pad.axes] } : null;
      this._raf = requestAnimationFrame(this._poll);
    }
    this._refresh();
  }

  _stopCapture() {
    if (!this.capture) return;
    this.capture = null;
    this.game.input.capturing = false;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('mousedown', this._onMouse, true);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  leave() {
    this._stopCapture();
    this.note = '';
  }

  _assignKey(code) {
    const cap = this.capture;
    const ctrl = this._ctrl();
    const list = ctrl.keys[cap.action] || [null, null];
    if (code) {
      // a code drives one action: take it away from any other
      const others = actionsUsing(ctrl, code, cap.action);
      for (const id of others) ctrl.keys[id] = ctrl.keys[id].map((k) => (k === code ? null : k));
      if (list[1 - cap.slot] === code) list[1 - cap.slot] = null;
      this.note = others.length ? `${codeName(code)} moved from “${ACTION_LABELS[others[0]]}”` : '';
    }
    list[cap.slot] = code;
    ctrl.keys[cap.action] = list;
    this._commit(ctrl);
    this._stopCapture();
    this._refresh();
  }

  _captureKey(e) {
    if (!this.capture) return;
    e.preventDefault();
    e.stopPropagation();
    const cap = this.capture;
    if (e.code === 'Escape') {
      this._stopCapture();
      this._refresh();
      return;
    }
    if (cap.kind !== 'key') return;
    if (e.code === 'Backspace' || e.code === 'Delete') {
      this._assignKey(null);
      return;
    }
    if (RESERVED_CODES.has(e.code) || !e.code) {
      this.note = `${e.code || 'That key'} is reserved by the browser`;
      this._refresh();
      return;
    }
    this._assignKey(e.code);
  }

  _captureMouse(e) {
    if (!this.capture || this.capture.kind !== 'key') return;
    // clicking another binding cancels instead of binding the left button
    if (e.button === 0 && e.target.closest && e.target.closest('[data-action]')) {
      this._stopCapture();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this._assignKey('Mouse' + e.button);
  }

  _pollPad() {
    const cap = this.capture;
    if (!cap || cap.kind === 'key') return;
    const pad = this.game.input.gamepad();
    if (pad) {
      if (!this._padBase) this._padBase = { buttons: pad.buttons.map((b) => b.pressed || b.value > 0.5), axes: [...pad.axes] };
      const base = this._padBase;
      if (cap.kind === 'pad') {
        const i = pad.buttons.findIndex((b, k) => (b.pressed || b.value > 0.5) && !base.buttons[k]);
        if (i >= 0) {
          const ctrl = this._ctrl();
          for (const id of Object.keys(ctrl.pad)) if (id !== cap.action) ctrl.pad[id] = ctrl.pad[id].filter((b) => b !== i);
          ctrl.pad[cap.action] = [i];
          this._commit(ctrl);
          this.note = `${ACTION_LABELS[cap.action]}: ${padName(i)}`;
          this._stopCapture();
          this._refresh();
          return;
        }
      } else {
        let best = -1, bestD = 0.5;
        pad.axes.forEach((v, k) => {
          const d = Math.abs(v - (base.axes[k] || 0));
          if (d > bestD) { bestD = d; best = k; }
        });
        if (best >= 0) {
          const ctrl = this._ctrl();
          ctrl.axes[cap.action].axis = best;
          this._commit(ctrl);
          this.note = `${cap.action === 'throttle' ? 'Throttle' : cap.action}: ${axisName(best)}`;
          this._stopCapture();
          this._refresh();
          return;
        }
      }
    }
    this._raf = requestAnimationFrame(this._poll);
  }

  _refresh() {
    if (this.menus.screen === 'controls') this.menus.show('controls', false);
  }
}
