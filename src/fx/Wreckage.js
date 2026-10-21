// Aircraft break-up. A destroyed aircraft is cut into the pieces it is really
// made of (each wing, the tail, the nose and the centre fuselage) by sorting
// its meshes by position; the pieces keep the livery, tumble away with the
// aircraft's momentum, glow hot and char as they burn, trail fire and smoke,
// bounce and skid along the ground or sink in the sea, then smoulder under a
// column of smoke next to a scorch mark.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const DARK = new THREE.Color(0.11, 0.105, 0.1);

let scorchTex = null;
function getScorchTexture() {
  if (scorchTex) return scorchTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(8,7,6,0.95)');
  g.addColorStop(0.45, 'rgba(20,17,14,0.8)');
  g.addColorStop(0.8, 'rgba(40,34,28,0.35)');
  g.addColorStop(1, 'rgba(40,34,28,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // ragged soot streaks
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = S * (0.15 + Math.random() * 0.32);
    ctx.fillStyle = `rgba(10,9,8,${0.15 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 3 + Math.random() * 10, 2 + Math.random() * 5, a, 0, Math.PI * 2);
    ctx.fill();
  }
  scorchTex = new THREE.CanvasTexture(c);
  scorchTex.colorSpace = THREE.SRGBColorSpace;
  return scorchTex;
}

// which piece a mesh belongs to, from its centre in the aircraft's own frame
function pieceOf(local, model) {
  const half = model.span / 2;
  const len = model.length;
  const fus = Math.max(model.maxWidth * 1.5, half * 0.22);
  if (Math.abs(local.x) > fus) {
    const side = local.x > 0 ? 'R' : 'L';
    // long wings break again outboard
    if (half > 12 && Math.abs(local.x) > half * 0.6) return 'wingTip' + side;
    return 'wing' + side;
  }
  if (local.z > len * 0.22) return 'tail';
  if (local.z < -len * 0.27) return 'nose';
  return 'centre';
}

function skipMesh(o) {
  if (!o.isMesh || !o.visible) return true;
  const m = o.material;
  if (!m || Array.isArray(m)) return true;
  // flames, light glows, vapour and other effects are not wreckage
  if (m.isShaderMaterial || m.isMeshBasicMaterial || m.blending === THREE.AdditiveBlending) return true;
  return false;
}

function visibleInTree(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

export class Wreckage {
  constructor(battle, quality) {
    this.battle = battle;
    this.scene = battle.scene;
    this.low = quality.particles < 1200;
    this.pieces = [];
    this.scorches = [];
    this.maxPieces = this.low ? 16 : 36;
  }

  // Break an aircraft up. opts.only: a single piece to shed (the aircraft
  // keeps flying without it); opts.ground / opts.water: it hit the surface.
  breakUp(ac, opts = {}) {
    const model = ac.model;
    const root = model.root;
    if (!root.parent) return null;
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    const groups = new Map();
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (skipMesh(o) || !visibleInTree(o, root)) return;
      if (o.userData.noWreck) return;
      const geo = o.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      _v.copy(geo.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const local = _w.copy(_v).applyMatrix4(_inv);
      const key = pieceOf(local, model);
      if (opts.only && key !== opts.only) return;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { meshes: [], centre: new THREE.Vector3(), n: 0 }));
      g.meshes.push(o);
      g.centre.add(_v);
      g.n++;
    });
    if (!groups.size) return null;
    const vel = ac.velocity;
    const speed = vel.length();
    const scale = Math.max(1, Math.sqrt(ac.fm.mass / 14000));
    let main = null;
    for (const [key, g] of groups) {
      g.centre.divideScalar(g.n);
      const group = new THREE.Group();
      group.position.copy(g.centre);
      this.scene.add(group);
      group.updateMatrixWorld();
      _inv.copy(group.matrixWorld).invert();
      const mats = new Map();
      box.makeEmpty();
      for (const o of g.meshes) {
        let mat = mats.get(o.material);
        if (!mat) {
          mat = o.material.clone();
          mat.userData.base = mat.color ? mat.color.clone() : null;
          mats.set(o.material, mat);
        }
        const piece = new THREE.Mesh(o.geometry, mat);
        _m.multiplyMatrices(_inv, o.matrixWorld);
        _m.decompose(piece.position, piece.quaternion, piece.scale);
        piece.castShadow = o.castShadow;
        group.add(piece);
        if (opts.only) o.visible = false;
      }
      box.setFromObject(group);
      const size = box.getSize(_w).length() * 0.5;
      const wing = key.startsWith('wing');
      // light pieces get thrown harder and flutter; the heavy centre carries on
      const kick = (opts.impulse ?? 14) * (wing ? 1.3 : key === 'centre' ? 0.5 : 1);
      const away = _v.copy(g.centre).sub(ac.position);
      if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0.3, Math.random() - 0.5);
      away.normalize();
      const pv = new THREE.Vector3().copy(vel).multiplyScalar(opts.ground ? 0.55 + Math.random() * 0.2 : 0.88 + Math.random() * 0.1);
      pv.addScaledVector(away, kick * (0.6 + Math.random() * 0.8));
      if (opts.ground) pv.y = Math.abs(pv.y) * 0.15 + 4 + Math.random() * (wing ? 14 : 7);
      const spin = wing ? 2.5 + Math.random() * 3 : key === 'centre' ? 0.4 + Math.random() * 0.9 : 1 + Math.random() * 2.5;
      const piece = {
        key, group, model, mats: [...mats.values()], vel: pv, size: Math.max(1, size),
        av: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spin),
        drag: wing ? 0.3 : key === 'centre' ? 0.04 : 0.12, age: 0, life: (this.low ? 26 : 45) + Math.random() * 10,
        heat: 1, fire: key === 'centre' || key.startsWith('wingL') || key.startsWith('wingR') ? 1 : 0.4 + Math.random() * 0.4,
        landed: false, sunk: false, water: !!opts.water, emitT: 0, scale, main: key === 'centre' || (!main && groups.size === 1),
      };
      if (piece.main) main = piece;
      this.pieces.push(piece);
    }
    // keep the scene bounded: oldest wreckage goes first
    while (this.pieces.length > this.maxPieces) this._remove(this.pieces[0]);
    if (!opts.only && opts.ground && !opts.water) this.scorch(ac.position, 9 * scale + speed * 0.04);
    if (!main) main = this.pieces[this.pieces.length - 1];
    return main ? main.group.position : null;
  }

  scorch(pos, radius) {
    const map = this.battle.map;
    const h = map.surfaceAt(pos.x, pos.z);
    if (map.heightAt(pos.x, pos.z) < map.waterLevel) return;
    const mat = new THREE.MeshBasicMaterial({ map: getScorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, color: 0xffffff, opacity: 0.95, fog: true });
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), mat);
    m.position.set(pos.x, h + 0.25, pos.z);
    map.normalAt?.(pos.x, pos.z, _n);
    if (_n.lengthSq() > 0.5) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
    else m.rotation.x = -Math.PI / 2;
    m.rotateZ(Math.random() * Math.PI * 2);
    m.renderOrder = 2;
    this.scene.add(m);
    this.scorches.push({ mesh: m, age: 0, life: 120 });
    if (this.scorches.length > 12) this._removeScorch(this.scorches[0]);
  }

  update(dt) {
    const b = this.battle;
    const map = b.map;
    const fx = b.effects;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      const g = p.group;
      // hot metal glows, then chars
      p.heat = Math.max(0, p.heat - dt * (p.landed ? 0.06 : 0.25));
      const char = Math.min(1, p.age / 2.5);
      for (const m of p.mats) {
        if (m.userData.base && m.color) m.color.copy(m.userData.base).lerp(DARK, char * 0.85);
        if (m.emissive) m.emissive.setRGB(0.9 * p.heat * p.fire, 0.28 * p.heat * p.fire, 0.04 * p.heat * p.fire);
      }
      if (!p.landed) {
        p.vel.y -= 9.81 * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        g.position.addScaledVector(p.vel, dt);
        const ang = p.av.length() * dt;
        if (ang > 0) {
          _q.setFromAxisAngle(_v.copy(p.av).normalize(), ang);
          g.quaternion.premultiply(_q);
        }
        // fire and a smoke trail while falling
        p.emitT -= dt;
        if (p.emitT <= 0 && fx) {
          p.emitT = this.low ? 0.08 : 0.04;
          if (p.fire > 0.3) fx.burning(g.position, p.vel, (0.5 + p.fire * 0.8) * Math.min(1.8, p.scale));
          else fx.particles.smoke.emit({ x: g.position.x, y: g.position.y, z: g.position.z, vx: 0, vy: 1, vz: 0, life: 3, size0: 1.5, size1: 8, color0: [0.12, 0.12, 0.12, 0.55], color1: [0.3, 0.3, 0.3, 0], cell: 0, drag: 1.2 });
        }
        const ground = map.surfaceAt(g.position.x, g.position.z, g.position.y);
        const water = map.heightAt(g.position.x, g.position.z) < map.waterLevel;
        if (g.position.y - p.size * 0.25 <= ground) {
          g.position.y = ground + p.size * 0.25;
          const impact = p.vel.length();
          if (water) {
            p.landed = true;
            p.sunk = true;
            p.water = true;
            if (fx && impact > 12) fx.waterCrash(g.position, p.vel, Math.min(2, 0.4 + p.size * 0.08));
            p.vel.set(p.vel.x * 0.1, -1.5, p.vel.z * 0.1);
          } else {
            if (fx && impact > 22 && p.main) fx.crashFireball(g.position, p.vel, Math.min(2.4, 0.5 * p.scale + 0.3));
            else if (fx && impact > 22) fx.groundExplosion(g.position, Math.min(1, 0.25 + p.size * 0.04));
            // bounce and skid with friction
            p.vel.y = Math.abs(p.vel.y) * (impact > 30 ? 0.22 : 0.1);
            p.vel.x *= 0.55;
            p.vel.z *= 0.55;
            p.av.multiplyScalar(0.45);
            if (impact < 6) {
              p.landed = true;
              p.vel.set(0, 0, 0);
              if (p.main && !p.scorched) {
                p.scorched = true;
                this.scorch(g.position, 5 + p.size * 0.6);
              }
            }
          }
        }
      } else if (p.sunk) {
        // slips under the waves
        g.position.y -= dt * 1.5;
        p.vel.multiplyScalar(Math.max(0, 1 - dt));
        g.position.addScaledVector(p.vel, dt);
        if (g.position.y < map.waterLevel - p.size * 2 - 3) p.age = p.life;
      } else {
        // smouldering on the ground
        const burn = p.fire * Math.max(0, 1 - p.age / (p.life * 0.75));
        p.emitT -= dt;
        if (burn > 0.05 && p.emitT <= 0 && fx) {
          p.emitT = this.low ? 0.18 : 0.09;
          fx.wreckFire(g.position, Math.min(2.2, burn * (0.6 + p.size * 0.08)));
        }
        // last seconds: settles into the ground and is gone
        const left = p.life - p.age;
        if (left < 4) g.position.y -= dt * p.size * 0.12;
      }
      if (p.age >= p.life) this._remove(p);
    }
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.age += dt;
      s.mesh.material.opacity = 0.95 * Math.min(1, (s.life - s.age) / 20);
      if (s.age >= s.life) this._removeScorch(s);
    }
  }

  _remove(p) {
    const i = this.pieces.indexOf(p);
    if (i >= 0) this.pieces.splice(i, 1);
    this.scene.remove(p.group);
    for (const m of p.mats) m.dispose();
    // the pieces share the aircraft's geometry: free it once both are gone
    if (p.model.disposed) p.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  _removeScorch(s) {
    const i = this.scorches.indexOf(s);
    if (i >= 0) this.scorches.splice(i, 1);
    this.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
  }

  clear() {
    while (this.pieces.length) this._remove(this.pieces[0]);
    while (this.scorches.length) this._removeScorch(this.scorches[0]);
  }

  dispose() {
    this.clear();
  }
}
