// On-screen controls for phones and tablets: virtual stick, throttle slider
// and weapon buttons, written straight into Input.touch. The layout is the
// player's: every control can be dragged to a new place in the layout editor,
// resized, faded, mirrored for left-handed play, and the stick can float to
// wherever the thumb lands. A TILT button recentres the gyro.

// default centre positions as fractions of the screen (x from the left, y from the top)
const ITEMS = [
  { id: 'stick', x: 0.13, y: 0.7 },
  { id: 'throttle', x: 0.29, y: 0.72 },
  { id: 'gun', x: 0.9, y: 0.8, label: 'GUN', cls: 't-gun' },
  { id: 'missile', x: 0.79, y: 0.86, label: 'MSL', cls: 't-msl' },
  { id: 'flare', x: 0.8, y: 0.66, label: 'FLR' },
  { id: 'target', x: 0.91, y: 0.6, label: 'TGT' },
  { id: 'lockview', x: 0.69, y: 0.88, label: 'LOCK', cls: 't-small' },
  { id: 'camera', x: 0.69, y: 0.77, label: 'CAM' },
  { id: 'gear', x: 0.955, y: 0.13, label: 'GEAR', cls: 't-small' },
  { id: 'airbrake', x: 0.955, y: 0.24, label: 'BRK', cls: 't-small' },
  { id: 'reverser', x: 0.955, y: 0.35, label: 'REV', cls: 't-small' },
  { id: 'radio', x: 0.955, y: 0.46, label: 'RADIO', cls: 't-small' },
  { id: 'gyro', x: 0.4, y: 0.07, label: 'TILT', cls: 't-small t-gyro' },
  { id: 'pause', x: 0.5, y: 0.06, label: '❚❚', cls: 't-pause' },
];
const HOLD = new Set(['gun', 'airbrake']);

export function defaultTouchLayout() {
  return { scale: 1, opacity: 0.85, swap: false, floating: false, pos: {} };
}

export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.layout = defaultTouchLayout();
    this.editing = false;
    this.onLayoutChange = null;
    this.onGyroButton = null;
    this.haptic = () => {};
    this.gyroOn = false;
    this.el = document.createElement('div');
    this.el.className = 'touch-ui';
    this.zone = document.createElement('div');
    this.zone.className = 't-zone';
    this.el.appendChild(this.zone);
    this.items = {};
    for (const it of ITEMS) {
      let e;
      if (it.id === 'stick') {
        e = document.createElement('div');
        e.className = 't-stick';
        e.innerHTML = '<div class="t-stick-knob"></div>';
      } else if (it.id === 'throttle') {
        e = document.createElement('div');
        e.className = 't-throttle';
        e.innerHTML = '<div class="t-throttle-fill"></div><div class="t-throttle-knob"></div><span>THR</span>';
      } else {
        e = document.createElement('button');
        e.className = `t-btn ${it.cls || ''}`;
        e.textContent = it.label;
      }
      e.dataset.b = it.id;
      this.el.appendChild(e);
      this.items[it.id] = { def: it, el: e };
    }
    this.toolbar = document.createElement('div');
    this.toolbar.className = 't-editbar';
    this.toolbar.innerHTML = `
      <b>Touch layout</b><span class="t-edit-hint">Drag any control to move it</span>
      <label>Size <input type="range" min="0.7" max="1.5" step="0.05" data-k="scale"></label>
      <label>Opacity <input type="range" min="0.3" max="1" step="0.05" data-k="opacity"></label>
      <label><input type="checkbox" data-k="swap"> Left-handed</label>
      <label><input type="checkbox" data-k="floating"> Floating stick</label>
      <button data-k="reset">Reset</button><button data-k="done" class="primary">Done</button>`;
    this.toolbar.style.display = 'none';
    root.appendChild(this.el);
    root.appendChild(this.toolbar);
    this.stick = this.items.stick.el;
    this.knob = this.stick.querySelector('.t-stick-knob');
    this.thr = this.items.throttle.el;
    this.thrFill = this.thr.querySelector('.t-throttle-fill');
    this.thrKnob = this.thr.querySelector('.t-throttle-knob');
    this.stickId = null;
    this.thrId = null;
    this.throttle = 0.75;
    this.floatCenter = null;
    this._bind();
    this._bindToolbar();
    this.setThrottle(0.75);
    this.visible = false;
    window.addEventListener('resize', () => this.applyLayout());
    this.applyLayout();
  }

  show(v) {
    this.visible = v;
    this.el.style.display = v ? 'block' : 'none';
    if (!v) this._releaseAll();
  }

  setLayout(layout) {
    this.layout = { ...defaultTouchLayout(), ...(layout || {}) };
    this.layout.pos = { ...(this.layout.pos || {}) };
    this.applyLayout();
  }

  setGyro(on) {
    this.gyroOn = !!on;
    this.applyLayout();
  }

  _pos(id) {
    const it = this.items[id].def;
    const p = this.layout.pos[id] || { x: it.x, y: it.y };
    return { x: this.layout.swap && id !== 'pause' ? 1 - p.x : p.x, y: p.y };
  }

  applyLayout() {
    const L = this.layout;
    this.el.style.setProperty('--t-scale', L.scale);
    this.el.style.setProperty('--t-opacity', L.opacity);
    for (const id of Object.keys(this.items)) {
      const { el } = this.items[id];
      const p = this._pos(id);
      el.style.left = `${(p.x * 100).toFixed(2)}%`;
      el.style.top = `${(p.y * 100).toFixed(2)}%`;
      if (id === 'gyro') el.style.display = this.gyroOn || this.editing ? '' : 'none';
    }
    // floating stick: the whole stick-side of the screen catches the thumb
    const side = this._pos('stick').x < 0.5 ? 'left' : 'right';
    this.zone.style.display = L.floating && !this.editing ? 'block' : 'none';
    this.zone.style.left = side === 'left' ? '0' : '55%';
    this.zone.style.right = side === 'left' ? '55%' : '0';
    this.stick.classList.toggle('floating', !!L.floating && !this.editing);
    for (const inp of this.toolbar.querySelectorAll('input')) {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!L[k];
      else inp.value = L[k];
    }
  }

  // layout editor: shows every control, drag to move
  edit(on) {
    this.editing = !!on;
    this.el.classList.toggle('editing', this.editing);
    this.toolbar.style.display = this.editing ? 'flex' : 'none';
    if (this.editing) this.show(true);
    this._releaseAll();
    this.applyLayout();
  }

  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v));
    this.thrFill.style.height = `${this.throttle * 100}%`;
    this.thrKnob.style.bottom = `calc(${this.throttle * 100}% - 14px)`;
    this.thrFill.classList.toggle('ab', this.throttle > 0.9);
  }

  _releaseAll() {
    const t = this.input.touch;
    t.active = false;
    t.x = t.y = 0;
    t.gun = false;
    t.buttons.delete('airbrake');
    this.stickId = this.thrId = null;
    this.knob.style.transform = 'translate(0,0)';
    this._resetFloat();
    for (const { el } of Object.values(this.items)) el.classList.remove('down');
  }

  _resetFloat() {
    if (!this.floatCenter) return;
    this.floatCenter = null;
    this.applyLayout();
  }

  _bind() {
    const t = this.input.touch;
    const stickMove = (e) => {
      const r = this.stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      t.x = dx;
      t.y = dy;
      t.active = true;
      this.knob.style.transform = `translate(${dx * r.width * 0.32}px, ${dy * r.height * 0.32}px)`;
    };
    const stickEnd = () => {
      this.stickId = null;
      t.active = false;
      t.x = t.y = 0;
      this.knob.style.transform = 'translate(0,0)';
      this._resetFloat();
    };
    const thrMove = (e) => {
      const r = this.thr.getBoundingClientRect();
      this.setThrottle(1 - (e.clientY - r.top) / r.height);
      t.throttle = this.throttle;
    };
    // floating stick: put the stick under the thumb, then steer from there
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.editing || this.stickId !== null) return;
      e.preventDefault();
      this.floatCenter = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stickId = e.pointerId;
      this.zone.setPointerCapture?.(e.pointerId);
      stickMove(e);
    });
    this.zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) stickMove(e); });
    for (const ev of ['pointerup', 'pointercancel']) this.zone.addEventListener(ev, (e) => { if (e.pointerId === this.stickId) stickEnd(); });

    for (const { def, el } of Object.values(this.items)) {
      const id = def.id;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
        if (this.editing) {
          const r = el.getBoundingClientRect();
          this._drag = { id, pid: e.pointerId, ox: e.clientX - (r.left + r.width / 2), oy: e.clientY - (r.top + r.height / 2) };
          el.classList.add('down');
          return;
        }
        if (id === 'stick') {
          this.stickId = e.pointerId;
          stickMove(e);
        } else if (id === 'throttle') {
          this.thrId = e.pointerId;
          thrMove(e);
        } else {
          el.classList.add('down');
          if (id === 'gun') t.gun = true;
          else if (id !== 'gyro') t.buttons.add(id);
          this.haptic(id === 'missile' ? 25 : 10);
        }
      });
      el.addEventListener('pointermove', (e) => {
        if (this.editing && this._drag && this._drag.pid === e.pointerId) {
          let x = (e.clientX - this._drag.ox) / window.innerWidth;
          const y = Math.max(0.03, Math.min(0.97, (e.clientY - this._drag.oy) / window.innerHeight));
          x = Math.max(0.03, Math.min(0.97, x));
          // stored un-mirrored so the left-handed switch keeps working
          this.layout.pos[id] = { x: this.layout.swap && id !== 'pause' ? 1 - x : x, y };
          el.style.left = `${x * 100}%`;
          el.style.top = `${y * 100}%`;
          return;
        }
        if (id === 'stick' && e.pointerId === this.stickId) stickMove(e);
        if (id === 'throttle' && e.pointerId === this.thrId) thrMove(e);
      });
      const up = (e) => {
        el.classList.remove('down');
        if (this.editing) {
          if (this._drag && this._drag.pid === e.pointerId) {
            this._drag = null;
            this.onLayoutChange?.(this.layout);
          }
          return;
        }
        if (id === 'stick' && e.pointerId === this.stickId) stickEnd();
        if (id === 'throttle' && e.pointerId === this.thrId) this.thrId = null;
        // on release: iOS only grants motion access from a completed tap
        if (id === 'gyro' && e.type === 'pointerup') this.onGyroButton?.();
        if (HOLD.has(id)) {
          if (id === 'gun') t.gun = false;
          else t.buttons.delete(id);
        }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  _bindToolbar() {
    const tb = this.toolbar;
    tb.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      this.layout[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
      this.applyLayout();
      this.onLayoutChange?.(this.layout);
    });
    tb.addEventListener('click', (e) => {
      const k = e.target.dataset && e.target.dataset.k;
      if (k === 'reset') {
        this.layout = defaultTouchLayout();
        this.applyLayout();
        this.onLayoutChange?.(this.layout);
      } else if (k === 'done') {
        this.edit(false);
        this.onEditDone?.();
      }
    });
    for (const ev of ['pointerdown', 'touchstart']) tb.addEventListener(ev, (e) => e.stopPropagation());
  }
}
