// Fighter-style head-up display drawn on a 2D canvas overlay: pitch ladder,
// flight path marker, speed/altitude tapes, heading tape, target boxes,
// missile seeker, gun pipper, radar scope, warnings and mission info.
import * as THREE from 'three';
import { MISSILE_TYPES } from '../combat/Weapons.js';

const HUD_GREEN = 'rgba(110,255,150,0.92)';
const HUD_DIM = 'rgba(110,255,150,0.55)';
const RED = 'rgba(255,70,60,0.95)';
const AMBER = 'rgba(255,190,60,0.95)';
const CYAN = 'rgba(90,220,255,0.95)';
const WHITE = 'rgba(235,245,240,0.95)';
const FONT = '"Share Tech Mono", "Consolas", monospace';
const UI_FONT = '"Rajdhani", "Segoe UI", sans-serif';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.units = 'imperial';
    this.visible = true;
    this.hitMarker = 0;
    this.dpr = 1;
    this.flash = 0;
    this.centerText = null;
    this.centerTimer = 0;
    this.maxG = 1;
    this.damageFlash = 0;
    this.resize();
  }

  resize(maxDpr = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.scale = Math.max(0.62, Math.min(1.25, Math.min(this.w, this.h * 1.6) / 1100));
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  showCenter(text, time = 2) {
    this.centerText = text;
    this.centerTimer = time;
  }

  // project world point to screen; returns {x,y,behind}
  project(camera, p, out = {}) {
    _p.copy(p).project(camera);
    const behind = _p.z > 1;
    out.x = (_p.x * 0.5 + 0.5) * this.w;
    out.y = (-_p.y * 0.5 + 0.5) * this.h;
    out.behind = behind;
    out.on = !behind && out.x > 0 && out.x < this.w && out.y > 0 && out.y < this.h;
    return out;
  }

  draw(dt, g) {
    const { camera, battle, mission, targeting, cameraMode, settings } = g;
    const ctx = this.ctx;
    this.clear();
    if (!this.visible || !battle || !battle.player) return;
    const p = battle.player;
    const fm = p.fm;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const S = this.scale;
    const W = this.w, H = this.h;
    const cx = W / 2, cy = H / 2;
    this.units = settings.units;
    const metric = this.units === 'metric';
    const att = fm.attitude(this._att || (this._att = {}));
    if (Math.abs(fm.gLoad) > Math.abs(this.maxG)) this.maxG = fm.gLoad;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.centerTimer -= dt;
    this.flash += dt;
    const blink = Math.floor(this.flash * 3) % 2 === 0;
    const alive = p.alive && !p.dying;

    ctx.lineWidth = 1.6 * S;
    ctx.strokeStyle = HUD_GREEN;
    ctx.fillStyle = HUD_GREEN;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 0;

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const pxPerDeg = (H / 2) / Math.tan(fovRad / 2) * Math.tan(Math.PI / 180);

    if (alive) {
      // --- Boresight & flight path marker
      _v.set(0, 0, -1).applyQuaternion(p.quaternion).multiplyScalar(3000).add(p.position);
      const bore = this.project(camera, _v, {});
      let fpm = null;
      if (fm.airspeed > 20) {
        _w.copy(p.velocity).normalize().multiplyScalar(3000).add(p.position);
        fpm = this.project(camera, _w, {});
      }
      const hudCx = bore.on ? bore.x : cx;
      const hudCy = bore.on ? bore.y : cy;

      // --- Pitch ladder centred on the boresight, rotated by roll
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - 260 * S, cy - 230 * S, 520 * S, 460 * S);
      ctx.clip();
      ctx.translate(hudCx, hudCy);
      ctx.rotate(this._cameraRoll(camera));
      ctx.font = `${12 * S}px ${FONT}`;
      for (let a = -90; a <= 90; a += 5) {
        const dy = (att.pitch - a) * pxPerDeg;
        if (Math.abs(dy) > 260 * S) continue;
        const major = a % 10 === 0;
        const halfW = a === 0 ? 170 * S : major ? 70 * S : 40 * S;
        const gap = 26 * S;
        ctx.strokeStyle = a === 0 ? HUD_GREEN : HUD_DIM;
        ctx.setLineDash(a < 0 ? [6 * S, 5 * S] : []);
        ctx.beginPath();
        ctx.moveTo(-halfW, dy); ctx.lineTo(-gap, dy);
        ctx.moveTo(gap, dy); ctx.lineTo(halfW, dy);
        if (a !== 0) {
          const tick = (a > 0 ? 8 : -8) * S;
          ctx.moveTo(-halfW, dy); ctx.lineTo(-halfW, dy + tick);
          ctx.moveTo(halfW, dy); ctx.lineTo(halfW, dy + tick);
        }
        ctx.stroke();
        if (major && a !== 0) {
          ctx.fillStyle = HUD_DIM;
          ctx.textAlign = 'right';
          ctx.fillText(String(Math.abs(a)), -halfW - 5 * S, dy);
          ctx.textAlign = 'left';
          ctx.fillText(String(Math.abs(a)), halfW + 5 * S, dy);
        }
      }
      ctx.setLineDash([]);
      ctx.restore();

      // waterline symbol
      ctx.strokeStyle = HUD_GREEN;
      ctx.beginPath();
      const ws = 14 * S;
      ctx.moveTo(hudCx - ws * 2, hudCy); ctx.lineTo(hudCx - ws, hudCy); ctx.lineTo(hudCx - ws / 2, hudCy + ws / 2);
      ctx.lineTo(hudCx, hudCy); ctx.lineTo(hudCx + ws / 2, hudCy + ws / 2); ctx.lineTo(hudCx + ws, hudCy); ctx.lineTo(hudCx + ws * 2, hudCy);
      ctx.stroke();
      // flight path marker
      if (fpm && fpm.on) {
        const r = 7 * S;
        ctx.beginPath();
        ctx.arc(fpm.x, fpm.y, r, 0, Math.PI * 2);
        ctx.moveTo(fpm.x - r, fpm.y); ctx.lineTo(fpm.x - r * 2.6, fpm.y);
        ctx.moveTo(fpm.x + r, fpm.y); ctx.lineTo(fpm.x + r * 2.6, fpm.y);
        ctx.moveTo(fpm.x, fpm.y - r); ctx.lineTo(fpm.x, fpm.y - r * 2);
        ctx.stroke();
      }

      // --- Speed / altitude boxes
      const kts = fm.ias * 1.94384;
      const spdVal = metric ? fm.ias * 3.6 : kts;
      const altVal = metric ? p.position.y : p.position.y * 3.28084;
      this._tape(cx - 250 * S, cy, spdVal, metric ? 50 : 50, 'left', S, metric ? 'KMH' : 'KTS');
      this._tape(cx + 250 * S, cy, altVal, metric ? 100 : 500, 'right', S, metric ? 'M' : 'FT');
      // radar altimeter
      const agl = p.position.y - battle.map.surfaceAt(p.position.x, p.position.z);
      ctx.font = `${13 * S}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = agl < 150 ? AMBER : HUD_GREEN;
      if (agl < 1500) ctx.fillText(`R ${Math.round(metric ? agl : agl * 3.28084)}`, cx + 222 * S, cy + 40 * S);
      ctx.fillStyle = HUD_GREEN;
      // vertical speed
      const vs = metric ? p.velocity.y : p.velocity.y * 196.85;
      ctx.fillText(`VS ${vs >= 0 ? '+' : ''}${Math.round(vs)}`, cx + 222 * S, cy + 58 * S);

      // --- Heading tape
      this._headingTape(cx, cy - 210 * S, att.heading, S);

      // --- Left data block
      ctx.font = `${14 * S}px ${FONT}`;
      ctx.textAlign = 'left';
      const lx = cx - 290 * S, ly = cy + 110 * S;
      ctx.fillStyle = Math.abs(fm.gLoad) > p.spec.flight.maxG * 0.95 ? AMBER : HUD_GREEN;
      ctx.fillText(`G  ${fm.gLoad.toFixed(1)}`, lx, ly);
      ctx.fillStyle = HUD_GREEN;
      ctx.fillText(`M  ${fm.mach.toFixed(2)}`, lx, ly + 18 * S);
      ctx.fillStyle = fm.stallWarn ? AMBER : HUD_GREEN;
      ctx.fillText(`α  ${THREE.MathUtils.radToDeg(fm.alpha).toFixed(1)}`, lx, ly + 36 * S);
      ctx.fillStyle = HUD_DIM;
      ctx.fillText(`${this.maxG.toFixed(1)}`, lx + 90 * S, ly);
      // throttle
      this._throttle(cx - 330 * S, cy + 40 * S, fm.throttle, fm.afterburner, S, p.controls.airbrake, p.controls.gear);

      // --- Weapons block
      const rx = cx + 200 * S, ry = cy + 110 * S;
      ctx.textAlign = 'left';
      ctx.fillStyle = HUD_GREEN;
      const mt = targeting ? MISSILE_TYPES[targeting.missileType].name : 'IR';
      ctx.fillText(`${mt} MSL ${p.missiles}`, rx, ry);
      ctx.fillText(`GUN ${p.gunAmmo}`, rx, ry + 18 * S);
      ctx.fillStyle = p.flares > 0 ? HUD_GREEN : AMBER;
      ctx.fillText(`FLR ${p.flares}`, rx, ry + 36 * S);

      // --- Targets
      this._targets(camera, battle, targeting, p, S, blink);
      // --- Next ring
      if (mission && mission.rings && mission.rings.current) this._ringMarker(camera, mission.rings.current, p, S);
      // --- Incoming missiles
      this._threats(camera, battle, p, S);

      // hit marker
      if (this.hitMarker > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, this.hitMarker * 4)})`;
        ctx.lineWidth = 2 * S;
        const r1 = 8 * S, r2 = 16 * S;
        ctx.beginPath();
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          ctx.moveTo(hudCx + sx * r1, hudCy + sy * r1);
          ctx.lineTo(hudCx + sx * r2, hudCy + sy * r2);
        }
        ctx.stroke();
        ctx.lineWidth = 1.6 * S;
      }

      // --- Warnings
      const warns = [];
      if (p.incoming > 0) warns.push(['MISSILE', RED]);
      const pullUp = this._pullUp(p, battle.map, agl);
      if (pullUp) warns.push(['PULL UP', RED]);
      if (fm.stallWarn && agl > 5 && !fm.onGround) warns.push(['STALL', AMBER]);
      if (p.lockedBy > 0 && p.incoming === 0) warns.push(['LOCK', AMBER]);
      if (mission && mission.outTimer > 0) warns.push([`RETURN TO AREA ${Math.ceil(20 - mission.outTimer)}`, AMBER]);
      if (mission && mission.ceilingTimer > 0) warns.push([`${mission.ceilingMsg || 'TOO HIGH'} ${Math.ceil(8 - mission.ceilingTimer)}`, AMBER]);
      if (p.health < p.maxHealth * 0.3) warns.push(['DAMAGE CRITICAL', RED]);
      ctx.textAlign = 'center';
      ctx.font = `bold ${20 * S}px ${FONT}`;
      warns.forEach(([t, c], i) => {
        if (!blink && c === RED) return;
        ctx.fillStyle = c;
        ctx.fillText(t, cx, cy + 150 * S + i * 26 * S);
      });
      this.warnings = { missile: p.incoming > 0, pullup: pullUp, stall: fm.stallWarn && !fm.onGround && agl > 5, radar: p.lockedBy > 0 };
    } else {
      this.warnings = { missile: false, pullup: false, stall: false, radar: false };
    }

    // --- Radar scope
    this._radar(battle, mission, p, S);
    // --- Mission panel
    if (mission) this._missionPanel(mission, S);
    // --- Health
    this._health(p, S);

    // --- Centre text
    if (this.centerText && this.centerTimer > 0) {
      ctx.textAlign = 'center';
      ctx.font = `600 ${26 * S}px ${UI_FONT}`;
      ctx.fillStyle = `rgba(240,250,245,${Math.min(1, this.centerTimer * 2)})`;
      ctx.shadowBlur = 6;
      ctx.fillText(this.centerText, cx, cy - 120 * S);
      ctx.shadowBlur = 0;
    }
    if (cameraMode && this.modeText && this.modeTimer > 0) {
      this.modeTimer -= dt;
      ctx.textAlign = 'center';
      ctx.font = `${14 * S}px ${UI_FONT}`;
      ctx.fillStyle = `rgba(240,250,245,${Math.min(1, this.modeTimer)})`;
      ctx.fillText(this.modeText, cx, H - 30 * S);
    }
  }

  // Screen-space angle of the horizon for the current camera (canvas rotation)
  _cameraRoll(camera) {
    _v.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _w.set(1, 0, 0).applyQuaternion(camera.quaternion);
    return Math.atan2(_w.y, _v.y);
  }

  _pullUp(p, map, agl) {
    if (p.fm.onGround || p.fm.gearDown) return false;
    const vy = p.velocity.y;
    if (vy >= -5) return false;
    const t = agl / -vy;
    // also look ahead along the velocity
    _v.copy(p.position).addScaledVector(p.velocity, 4);
    const ahead = _v.y - map.surfaceAt(_v.x, _v.z);
    return t < 6 || ahead < 30;
  }

  _tape(x, y, value, step, side, S, unit) {
    const ctx = this.ctx;
    const hBox = 22 * S, wBox = 66 * S;
    const dir = side === 'left' ? -1 : 1;
    ctx.strokeStyle = HUD_GREEN;
    ctx.fillStyle = HUD_GREEN;
    // ticks
    const range = step * 4;
    const pxPer = (130 * S) / range;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 60 * S, y - 135 * S, 120 * S, 270 * S);
    ctx.clip();
    ctx.font = `${12 * S}px ${FONT}`;
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    const start = Math.floor((value - range) / (step / 2)) * (step / 2);
    ctx.beginPath();
    for (let v = start; v <= value + range; v += step / 2) {
      const yy = y - (v - value) * pxPer;
      const major = Math.abs(v % step) < 1e-6;
      const len = (major ? 10 : 5) * S;
      ctx.moveTo(x + dir * 30 * S, yy);
      ctx.lineTo(x + dir * (30 * S + len), yy);
      if (major && Math.abs(yy - y) > hBox * 0.7) ctx.fillText(String(Math.round(v)), x + dir * 44 * S, yy);
    }
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    // value box
    ctx.fillStyle = 'rgba(0,20,8,0.35)';
    const bx = side === 'left' ? x - wBox + 26 * S : x - 26 * S;
    ctx.fillRect(bx, y - hBox / 2, wBox, hBox);
    ctx.strokeRect(bx, y - hBox / 2, wBox, hBox);
    ctx.fillStyle = HUD_GREEN;
    ctx.font = `${16 * S}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), bx + wBox / 2, y + 1);
    ctx.font = `${11 * S}px ${FONT}`;
    ctx.fillStyle = HUD_DIM;
    ctx.fillText(unit, bx + wBox / 2, y - hBox);
  }

  _headingTape(x, y, heading, S) {
    const ctx = this.ctx;
    const pxPerDeg = 6 * S;
    const half = 120 * S;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - half, y - 20 * S, half * 2, 40 * S);
    ctx.clip();
    ctx.strokeStyle = HUD_GREEN;
    ctx.fillStyle = HUD_GREEN;
    ctx.font = `${12 * S}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.beginPath();
    const start = Math.floor((heading - 25) / 5) * 5;
    for (let h = start; h <= heading + 25; h += 5) {
      const xx = x + (h - heading) * pxPerDeg;
      const major = h % 10 === 0;
      ctx.moveTo(xx, y + 8 * S);
      ctx.lineTo(xx, y + (major ? 0 : 4) * S);
      if (major) {
        const hh = ((h % 360) + 360) % 360;
        const label = hh === 0 ? 'N' : hh === 90 ? 'E' : hh === 180 ? 'S' : hh === 270 ? 'W' : String(hh / 10).padStart(2, '0');
        ctx.fillText(label, xx, y - 8 * S);
      }
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x, y + 10 * S);
    ctx.lineTo(x - 5 * S, y + 18 * S);
    ctx.lineTo(x + 5 * S, y + 18 * S);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${13 * S}px ${FONT}`;
    ctx.fillText(String(Math.round(heading) % 360).padStart(3, '0'), x, y + 30 * S);
  }

  _throttle(x, y, thr, ab, S, airbrake, gear) {
    const ctx = this.ctx;
    const h = 120 * S, w = 8 * S;
    ctx.strokeStyle = HUD_DIM;
    ctx.strokeRect(x, y - h, w, h);
    ctx.fillStyle = ab > 0.01 ? AMBER : HUD_GREEN;
    ctx.fillRect(x, y - h * thr, w, h * thr);
    ctx.strokeStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(x - 3 * S, y - h * 0.9);
    ctx.lineTo(x + w + 3 * S, y - h * 0.9);
    ctx.stroke();
    ctx.font = `${12 * S}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ab > 0.01 ? AMBER : HUD_GREEN;
    ctx.fillText(ab > 0.01 ? 'AB' : `${Math.round(thr * 100)}`, x + w / 2, y + 12 * S);
    ctx.fillStyle = HUD_GREEN;
    if (airbrake) ctx.fillText('BRK', x + w / 2, y + 28 * S);
    if (gear) ctx.fillText('GEAR', x + w / 2, y + 44 * S);
  }

  _targets(camera, battle, targeting, p, S, blink) {
    const ctx = this.ctx;
    const scr = {};
    const cur = targeting ? targeting.target : null;
    const W = this.w, H = this.h;
    const ents = [];
    for (const a of battle.aircraft) if (a.alive && !a.dying && a !== p) ents.push(a);
    for (const g of battle.ground) if (g.alive) ents.push(g);
    ctx.font = `${11 * S}px ${FONT}`;
    for (const e of ents) {
      const d = e.position.distanceTo(p.position);
      if (d > 20000 && e !== cur) continue;
      this.project(camera, e.position, scr);
      const hostile = e.team !== p.team;
      if (!scr.on) continue;
      const col = hostile ? (e === cur ? RED : 'rgba(255,110,90,0.8)') : CYAN;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      const sz = (e.kind === 'air' ? 11 : 9) * S;
      ctx.beginPath();
      if (e === cur) {
        ctx.lineWidth = 2 * S;
        ctx.strokeRect(scr.x - sz * 1.6, scr.y - sz * 1.6, sz * 3.2, sz * 3.2);
        ctx.lineWidth = 1.6 * S;
      } else if (e.kind === 'air') {
        ctx.moveTo(scr.x, scr.y - sz); ctx.lineTo(scr.x + sz, scr.y); ctx.lineTo(scr.x, scr.y + sz); ctx.lineTo(scr.x - sz, scr.y); ctx.closePath();
        ctx.stroke();
      } else {
        ctx.rect(scr.x - sz * 0.8, scr.y - sz * 0.8, sz * 1.6, sz * 1.6);
        ctx.stroke();
      }
      if (e === cur || d < 6000) {
        ctx.textAlign = 'center';
        const label = e.kind === 'air' ? (e.label || 'BANDIT') : e.name;
        const dist = this.units === 'metric' ? `${(d / 1000).toFixed(1)}km` : `${(d / 1852).toFixed(1)}nm`;
        ctx.fillText(label, scr.x, scr.y - sz * 2.4);
        ctx.fillText(dist, scr.x, scr.y + sz * 2.6);
      }
    }
    if (!cur || !p.alive) return;
    // current target: seeker, lock and gun pipper
    const d = cur.position.distanceTo(p.position);
    this.project(camera, cur.position, scr);
    if (!scr.on) {
      // off-screen arrow
      _v.subVectors(cur.position, camera.position).applyQuaternion(_q.copy(camera.quaternion).invert());
      const ang = Math.atan2(-_v.y, _v.x);
      const r = Math.min(W, H) * 0.32;
      const ax = W / 2 + Math.cos(ang) * r, ay = H / 2 + Math.sin(ang) * r;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.moveTo(14 * S, 0); ctx.lineTo(-8 * S, -9 * S); ctx.lineTo(-8 * S, 9 * S); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.fillStyle = RED;
      ctx.fillText(`${(d / 1000).toFixed(1)}`, ax, ay + 18 * S);
    }
    // missile seeker circle
    if (p.missiles > 0 && targeting) {
      _v.set(0, 0, -1).applyQuaternion(p.quaternion).multiplyScalar(3000).add(p.position);
      const bore = this.project(camera, _v, {});
      const cone = MISSILE_TYPES[targeting.missileType].lockCone;
      const rad = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.tan(cone);
      ctx.strokeStyle = targeting.locked ? RED : HUD_DIM;
      ctx.setLineDash(targeting.inCone ? [] : [4 * S, 6 * S]);
      ctx.beginPath();
      ctx.arc(bore.x, bore.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (scr.on && targeting.lock > 0) {
        const k = targeting.lock / targeting.lockTime;
        const lx = bore.x + (scr.x - bore.x) * k, ly = bore.y + (scr.y - bore.y) * k;
        const ds = (22 - 10 * k) * S;
        ctx.strokeStyle = targeting.locked ? RED : AMBER;
        ctx.lineWidth = 2 * S;
        ctx.beginPath();
        ctx.moveTo(lx, ly - ds); ctx.lineTo(lx + ds, ly); ctx.lineTo(lx, ly + ds); ctx.lineTo(lx - ds, ly); ctx.closePath();
        ctx.stroke();
        ctx.lineWidth = 1.6 * S;
        if (targeting.locked && blink) {
          ctx.fillStyle = RED;
          ctx.font = `bold ${15 * S}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText('LOCK', lx, ly - ds - 12 * S);
        }
      }
    }
    // gun pipper (lead computing) for air targets in range
    if (cur.kind === 'air' && d < 1800 && p.gunAmmo > 0) {
      const tof = d / 1030;
      _v.copy(cur.position).addScaledVector(cur.velocity, tof).addScaledVector(p.velocity, -tof);
      _v.y += 0.5 * 9.81 * tof * tof;
      const pip = this.project(camera, _v, {});
      if (pip.on) {
        const r = 22 * S;
        ctx.strokeStyle = d < 1000 ? HUD_GREEN : HUD_DIM;
        ctx.beginPath();
        ctx.arc(pip.x, pip.y, r, 0, Math.PI * 2);
        ctx.moveTo(pip.x + 2 * S, pip.y);
        ctx.arc(pip.x, pip.y, 2 * S, 0, Math.PI * 2);
        ctx.stroke();
        // range arc
        const frac = Math.max(0, 1 - d / 1800);
        ctx.lineWidth = 3 * S;
        ctx.beginPath();
        ctx.arc(pip.x, pip.y, r + 5 * S, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.6 * S;
      }
    }
  }

  _ringMarker(camera, point, p, S) {
    const ctx = this.ctx;
    const scr = this.project(camera, point, {});
    const d = point.distanceTo(p.position);
    ctx.strokeStyle = CYAN;
    ctx.fillStyle = CYAN;
    ctx.font = `${12 * S}px ${FONT}`;
    ctx.textAlign = 'center';
    if (scr.on) {
      const s = 10 * S;
      ctx.beginPath();
      ctx.moveTo(scr.x - s, scr.y - s * 0.4); ctx.lineTo(scr.x - s, scr.y - s); ctx.lineTo(scr.x - s * 0.4, scr.y - s);
      ctx.moveTo(scr.x + s, scr.y - s * 0.4); ctx.lineTo(scr.x + s, scr.y - s); ctx.lineTo(scr.x + s * 0.4, scr.y - s);
      ctx.moveTo(scr.x - s, scr.y + s * 0.4); ctx.lineTo(scr.x - s, scr.y + s); ctx.lineTo(scr.x - s * 0.4, scr.y + s);
      ctx.moveTo(scr.x + s, scr.y + s * 0.4); ctx.lineTo(scr.x + s, scr.y + s); ctx.lineTo(scr.x + s * 0.4, scr.y + s);
      ctx.stroke();
      ctx.fillText(`${Math.round(d)} m`, scr.x, scr.y + s * 2);
    } else {
      _v.subVectors(point, camera.position).applyQuaternion(_q.copy(camera.quaternion).invert());
      const ang = Math.atan2(-_v.y, _v.x);
      const r = Math.min(this.w, this.h) * 0.3;
      const ax = this.w / 2 + Math.cos(ang) * r, ay = this.h / 2 + Math.sin(ang) * r;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(14 * S, 0); ctx.lineTo(-8 * S, -9 * S); ctx.lineTo(-8 * S, 9 * S); ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillText(`${Math.round(d)} m`, ax, ay + 18 * S);
    }
  }

  _threats(camera, battle, p, S) {
    const ctx = this.ctx;
    const threats = battle.weapons.threatsTo(p);
    if (!threats.length) return;
    _q.copy(camera.quaternion).invert();
    for (const m of threats) {
      _v.subVectors(m.pos, camera.position).applyQuaternion(_q);
      const ang = Math.atan2(-_v.y, _v.x);
      const d = m.pos.distanceTo(p.position);
      const r = 70 * S;
      ctx.save();
      ctx.translate(this.w / 2 + Math.cos(ang) * r, this.h / 2 + Math.sin(ang) * r);
      ctx.rotate(ang);
      ctx.fillStyle = RED;
      ctx.globalAlpha = Math.max(0.4, 1 - d / 6000);
      ctx.beginPath();
      ctx.moveTo(16 * S, 0); ctx.lineTo(0, -8 * S); ctx.lineTo(0, 8 * S); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _radar(battle, mission, p, S) {
    const ctx = this.ctx;
    const R = 78 * S;
    const x = 20 * S + R, y = this.h - 20 * S - R;
    const range = 16000;
    ctx.fillStyle = 'rgba(4,20,12,0.55)';
    ctx.strokeStyle = 'rgba(110,255,150,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, R / 2, 0, Math.PI * 2);
    ctx.moveTo(x - R, y); ctx.lineTo(x + R, y);
    ctx.moveTo(x, y - R); ctx.lineTo(x, y + R);
    ctx.strokeStyle = 'rgba(110,255,150,0.18)';
    ctx.stroke();
    const att = p.fm.attitude(this._att2 || (this._att2 = {}));
    const hd = THREE.MathUtils.degToRad(att.heading);
    const cs = Math.cos(hd), sn = Math.sin(hd);
    const toRadar = (pos, out) => {
      const dx = pos.x - p.position.x, dz = pos.z - p.position.z;
      // rotate so heading points up
      const rx = dx * cs + dz * sn;
      const ry = -(-dx * sn + dz * cs);
      let px = (rx / range) * R, py = (-ry / range) * R;
      const l = Math.hypot(px, py);
      out.clamped = l > R;
      if (l > R) { px *= R / l; py *= R / l; }
      out.x = x + px; out.y = y + py;
      return out;
    };
    const pt = {};
    // airbase
    const ab = battle.map.airbase;
    toRadar({ x: ab.x, z: ab.z }, pt);
    if (!pt.clamped) {
      ctx.strokeStyle = WHITE;
      ctx.beginPath();
      ctx.moveTo(pt.x - 4 * S, pt.y); ctx.lineTo(pt.x + 4 * S, pt.y);
      ctx.moveTo(pt.x, pt.y - 4 * S); ctx.lineTo(pt.x, pt.y + 4 * S);
      ctx.stroke();
    }
    if (mission && mission.rings && mission.rings.current) {
      toRadar(mission.rings.current, pt);
      ctx.fillStyle = CYAN;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const g of battle.ground) {
      if (!g.alive) continue;
      toRadar(g.position, pt);
      ctx.fillStyle = g.team === p.team ? CYAN : 'rgba(255,120,90,0.9)';
      ctx.fillRect(pt.x - 2.5 * S, pt.y - 2.5 * S, 5 * S, 5 * S);
    }
    for (const a of battle.aircraft) {
      if (!a.alive || a.dying || a === p) continue;
      toRadar(a.position, pt);
      ctx.fillStyle = a.team === p.team ? CYAN : RED;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - 4.5 * S); ctx.lineTo(pt.x + 4 * S, pt.y + 3.5 * S); ctx.lineTo(pt.x - 4 * S, pt.y + 3.5 * S); ctx.closePath();
      ctx.fill();
    }
    for (const m of battle.weapons.missiles) {
      toRadar(m.pos, pt);
      ctx.fillStyle = m.target === p ? RED : AMBER;
      ctx.fillRect(pt.x - 1.5 * S, pt.y - 1.5 * S, 3 * S, 3 * S);
    }
    ctx.fillStyle = HUD_GREEN;
    ctx.beginPath();
    ctx.moveTo(x, y - 6 * S); ctx.lineTo(x + 4 * S, y + 4 * S); ctx.lineTo(x - 4 * S, y + 4 * S); ctx.closePath();
    ctx.fill();
    ctx.font = `${10 * S}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${range / 1000} km`, x, y - R - 8 * S);
  }

  _missionPanel(mission, S) {
    const ctx = this.ctx;
    const x = 18 * S, y = 22 * S;
    ctx.textAlign = 'left';
    ctx.font = `600 ${16 * S}px ${UI_FONT}`;
    ctx.fillStyle = WHITE;
    ctx.shadowBlur = 4;
    ctx.fillText(mission.free ? 'FREE FLIGHT' : mission.def.name.toUpperCase(), x, y);
    ctx.font = `${14 * S}px ${UI_FONT}`;
    const lines = mission.objectiveLines();
    lines.forEach((l, i) => {
      ctx.fillStyle = l.done ? 'rgba(120,255,160,0.95)' : WHITE;
      ctx.fillText(`${l.done ? '✔' : '▸'} ${l.text}  ${l.progress}`, x, y + (22 + i * 19) * S);
    });
    // timer + score
    ctx.textAlign = 'right';
    ctx.font = `600 ${16 * S}px ${UI_FONT}`;
    const t = mission.time;
    const lim = mission.def.timeLimit;
    const show = lim ? Math.max(0, lim - t) : t;
    const mm = Math.floor(show / 60), ss = Math.floor(show % 60);
    ctx.fillStyle = lim && lim - t < 30 ? AMBER : WHITE;
    ctx.fillText(`${lim ? 'TIME LEFT ' : ''}${mm}:${String(ss).padStart(2, '0')}`, this.w - 18 * S, y);
    ctx.fillStyle = WHITE;
    ctx.fillText(`SCORE ${mission.score}`, this.w - 18 * S, y + 20 * S);
    // messages
    ctx.textAlign = 'center';
    ctx.font = `600 ${18 * S}px ${UI_FONT}`;
    const msgs = mission.messages.filter((m) => mission.time - m.time < 3.5);
    msgs.forEach((m, i) => {
      const a = Math.min(1, (3.5 - (mission.time - m.time)) * 1.5);
      const col = m.kind === 'kill' ? `rgba(255,220,120,${a})` : m.kind === 'warn' || m.kind === 'fail' ? `rgba(255,110,90,${a})` : m.kind === 'success' ? `rgba(120,255,160,${a})` : `rgba(140,230,255,${a})`;
      ctx.fillStyle = col;
      ctx.fillText(m.text, this.w / 2, this.h * 0.24 + i * 24 * S);
    });
    // radio log
    ctx.textAlign = 'left';
    ctx.font = `${14 * S}px ${UI_FONT}`;
    const radio = mission.radioLog.filter((r) => mission.time - r.time < 8);
    radio.forEach((r, i) => {
      ctx.fillStyle = `rgba(150,220,255,${Math.min(1, (8 - (mission.time - r.time)))})`;
      ctx.fillText(`📻 ${r.text}`, x, this.h * 0.36 + i * 20 * S);
    });
    ctx.shadowBlur = 0;
  }

  _health(p, S) {
    const ctx = this.ctx;
    const w = 160 * S, h = 7 * S;
    const x = this.w - w - 20 * S, y = this.h - 26 * S;
    const f = Math.max(0, p.health / p.maxHealth);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = f > 0.5 ? 'rgba(110,255,150,0.85)' : f > 0.25 ? AMBER : RED;
    ctx.fillRect(x, y, w * f, h);
    ctx.font = `${12 * S}px ${UI_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = WHITE;
    ctx.fillText(`${p.spec.name}  ${Math.round(f * 100)}%`, x + w, y - 10 * S);
  }
}
