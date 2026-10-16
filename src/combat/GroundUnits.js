// Ground and naval units: SAM launchers, AAA, tanks, trucks, radar, fuel
// depots, bunkers and destroyers. SAM/AAA/ships actively engage aircraft.
import * as THREE from 'three';
import { mergeGeometries } from '../aircraft/geometry.js';

let nextId = 1000;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  const n = g.getAttribute('position').count;
  const col = new THREE.Color(color);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cy = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

const geoCache = {};
function unitGeometry(type, palette) {
  const key = type + palette;
  if (geoCache[key]) return geoCache[key];
  const olive = palette === 'desert' ? '#a08a5c' : palette === 'snow' ? '#c9ccc8' : '#55603e';
  const olive2 = palette === 'desert' ? '#8a7650' : palette === 'snow' ? '#a9aeb0' : '#454f33';
  const dark = '#2a2c2a', metal = '#6a6c6a', white = '#d8d8d2', glass = '#203038';
  const parts = [];
  const wheels = (len, w, n) => {
    for (let i = 0; i < n; i++) {
      for (const s of [-1, 1]) parts.push(part(Cy(0.55, 0.55, 0.4, 10), dark, s * w, 0.55, -len / 2 + (i + 0.5) * (len / n), 0, 0, Math.PI / 2));
    }
  };
  switch (type) {
    case 'sam': {
      parts.push(part(B(2.6, 1.2, 8), olive, 0, 1.3, 0));
      parts.push(part(B(2.5, 1.6, 2.2), olive2, 0, 2.2, -3.2));
      parts.push(part(B(2.4, 0.5, 1.0), glass, 0, 2.6, -4.1));
      wheels(7.5, 1.2, 4);
      // launcher with 4 canisters, elevated
      for (let i = 0; i < 4; i++) {
        const x = (i % 2 ? 0.55 : -0.55), y = i < 2 ? 0 : 0.95;
        parts.push(part(Cy(0.42, 0.42, 6.5, 10), olive2, x, 3.6 + y * Math.cos(0.6), 1.2 + y * Math.sin(0.6), Math.PI / 2 - 0.6));
      }
      // radar panel
      parts.push(part(B(0.3, 3.2, 3.2), metal, 0, 4.0, -9.5, 0.3));
      parts.push(part(B(2.4, 1.6, 4), olive, 0, 1.6, -10.5));
      parts.push(part(Cy(0.15, 0.15, 2, 6), metal, 0, 3.0, -9.5));
      break;
    }
    case 'aaa': {
      parts.push(part(Cy(2.4, 2.8, 1.2, 12), olive, 0, 0.6, 0));
      parts.push(part(B(2.4, 1.6, 2.4), olive2, 0, 2.0, 0));
      for (const s of [-0.6, 0.6]) parts.push(part(Cy(0.09, 0.12, 4.2, 6), dark, s, 2.9, -2.2, Math.PI / 2 - 0.55));
      parts.push(part(B(1.2, 0.9, 1.0), metal, 0, 3.1, 0.6));
      // sandbag ring
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push(part(B(2.2, 0.9, 0.9), '#8a7a5a', Math.cos(a) * 5, 0.45, Math.sin(a) * 5, 0, -a));
      }
      break;
    }
    case 'tank': {
      parts.push(part(B(3.4, 1.1, 7.0), olive, 0, 1.0, 0));
      parts.push(part(B(3.6, 0.9, 7.4), dark, 0, 0.5, 0));
      parts.push(part(Cy(1.5, 1.7, 0.9, 10), olive2, 0, 1.95, 0.4));
      parts.push(part(Cy(0.12, 0.14, 5.0, 8), olive2, 0, 2.0, -2.6, Math.PI / 2));
      break;
    }
    case 'truck': {
      parts.push(part(B(2.4, 2.4, 2.2), olive2, 0, 1.7, -2.6));
      parts.push(part(B(2.3, 0.5, 0.9), glass, 0, 2.3, -3.6));
      parts.push(part(B(2.5, 2.6, 5.2), olive, 0, 2.0, 1.2));
      wheels(6.5, 1.15, 3);
      break;
    }
    case 'radar': {
      parts.push(part(B(6, 3, 6), white, 0, 1.5, 0));
      parts.push(part(Cy(0.5, 0.7, 10, 8), metal, 0, 8, 0));
      parts.push(part(B(4, 2.4, 2.5), olive, 7, 1.2, 0));
      break;
    }
    case 'fuel': {
      for (let i = 0; i < 4; i++) parts.push(part(Cy(5, 5, 7, 16), i % 2 ? '#c8c4b4' : '#b8b4a4', (i % 2) * 13 - 6.5, 3.5, Math.floor(i / 2) * 13 - 6.5));
      parts.push(part(B(30, 0.4, 30), '#6a6a62', 0, 0.2, 0));
      break;
    }
    case 'bunker': {
      parts.push(part(B(16, 5, 12), '#7a7a70', 0, 2.5, 0));
      parts.push(part(B(17, 1, 13), '#6a6a62', 0, 5.4, 0));
      parts.push(part(B(6, 3, 0.4), dark, 0, 1.6, -6.1));
      break;
    }
    case 'ship': {
      // hull from an extruded deck outline
      const shape = new THREE.Shape();
      shape.moveTo(0, -75);
      shape.quadraticCurveTo(8, -45, 9, -10);
      shape.lineTo(9, 55);
      shape.quadraticCurveTo(8, 75, 0, 76);
      shape.quadraticCurveTo(-8, 75, -9, 55);
      shape.lineTo(-9, -10);
      shape.quadraticCurveTo(-8, -45, 0, -75);
      const hull = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false, curveSegments: 8 });
      hull.rotateX(Math.PI / 2);
      hull.translate(0, 6, 0);
      parts.push(part(hull, '#5e666e', 0, 0, 0));
      parts.push(part(B(17.6, 0.3, 150), '#4a4f54', 0, 6.1, 0));
      parts.push(part(B(12, 7, 24), '#7a838b', 0, 9.5, 2));
      parts.push(part(B(9, 5, 10), '#7a838b', 0, 15, -2));
      parts.push(part(B(7, 1.6, 3), glass, 0, 16.2, -7.2));
      parts.push(part(Cy(0.5, 0.8, 16, 6), '#6a737b', 0, 25, 0));
      parts.push(part(B(6, 0.4, 0.4), '#6a737b', 0, 30, 0));
      parts.push(part(Cy(2.2, 2.6, 6, 10), '#4a5056', 0, 13, 14));
      parts.push(part(B(8, 5, 12), '#7a838b', 0, 8.5, 28));
      parts.push(part(Cy(2.2, 2.4, 1.8, 12), '#7a838b', 0, 7, -40));
      parts.push(part(Cy(0.25, 0.3, 6, 8), '#3a3e42', 0, 7.6, -44, Math.PI / 2));
      parts.push(part(B(6, 1.2, 8), '#555c62', 0, 6.8, -28));
      parts.push(part(B(6, 1.2, 8), '#555c62', 0, 6.8, 44));
      break;
    }
    default: {
      parts.push(part(B(10, 6, 10), '#7a7a70', 0, 3, 0));
    }
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  geoCache[key] = g;
  return g;
}

const UNIT_STATS = {
  sam: { health: 70, radius: 9, score: 150, label: 'SAM SITE' },
  aaa: { health: 45, radius: 6, score: 100, label: 'AAA' },
  tank: { health: 55, radius: 5, score: 75, label: 'TANK' },
  truck: { health: 25, radius: 5, score: 50, label: 'TRUCK' },
  radar: { health: 90, radius: 9, score: 150, label: 'RADAR' },
  fuel: { health: 60, radius: 16, score: 120, label: 'FUEL DEPOT' },
  bunker: { health: 140, radius: 10, score: 120, label: 'BUNKER' },
  ship: { health: 380, radius: 38, score: 300, label: 'DESTROYER' },
};

const materials = {};
function unitMaterial(kind) {
  if (!materials[kind]) {
    materials[kind] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: kind === 'ship' ? 0.3 : 0.1 });
  }
  return materials[kind];
}

export class GroundUnit {
  constructor(type, position, heading, opts = {}) {
    this.id = nextId++;
    this.type = type;
    this.kind = type === 'ship' ? 'ship' : 'ground';
    this.team = opts.team || 'enemy';
    const st = UNIT_STATS[type] || UNIT_STATS.bunker;
    this.stats = st;
    this.maxHealth = st.health * (opts.healthScale || 1);
    this.health = this.maxHealth;
    this.radius = st.radius;
    this.name = st.label;
    this.score = st.score;
    this.alive = true;
    this.isTarget = opts.isTarget ?? true;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.heading = heading;
    this.group = opts.group || null;
    const mesh = new THREE.Mesh(unitGeometry(type, opts.palette || 'green'), unitMaterial(this.kind));
    mesh.castShadow = !!opts.shadows;
    mesh.receiveShadow = !!opts.shadows;
    this.mesh = mesh;
    this.root = new THREE.Group();
    this.root.add(mesh);
    this.root.position.copy(position);
    this.root.rotation.y = -heading;
    if (type === 'radar' || type === 'sam') {
      const dish = new THREE.Mesh(
        type === 'radar' ? new THREE.CylinderGeometry(5, 4, 0.6, 16, 1, false) : new THREE.BoxGeometry(0.3, 2.6, 2.6),
        new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.5, metalness: 0.4 }),
      );
      dish.rotation.x = type === 'radar' ? 1.2 : 0;
      const pivot = new THREE.Group();
      pivot.position.set(0, type === 'radar' ? 13 : 5.6, type === 'radar' ? 0 : -9.5);
      pivot.add(dish);
      this.root.add(pivot);
      this.spinner = pivot;
    }
    // behaviour
    this.range = type === 'sam' ? 8500 : type === 'aaa' ? 2600 : type === 'ship' ? 9000 : 0;
    this.lockTime = 0;
    this.cooldown = 2 + Math.random() * 4;
    this.missilesLeft = type === 'sam' ? 6 : type === 'ship' ? 10 : 0;
    this.burst = 0;
    this.burstTimer = 0;
    this.difficulty = opts.difficulty ?? 1;
    this.losTimer = 0;
    this.hasLos = false;
    this.wreckTime = 0;
    this.speed = opts.speed || 0;
    this.elevation = opts.elevation ?? null;
    // moving units follow a looping route (convoys) or zig-zag (ships)
    this.route = opts.route || null;
    this.routeIndex = opts.routeStart || 0;
    this.turnRate = this.kind === 'ship' ? 0.05 : 0.5;
    this.zigTimer = 10 + Math.random() * 20;
    this.targetHeading = heading;
  }

  attach(scene, map) {
    this.scene = scene;
    if (this.kind === 'ship') {
      this.position.y = map.waterLevel;
      this.root.position.copy(this.position);
    } else if (this.elevation !== null) {
      // rooftop site
      this.position.y = this.elevation;
      this.root.position.copy(this.position);
      this.root.quaternion.setFromAxisAngle(UP, -this.heading);
    } else {
      this.position.y = map.heightAt(this.position.x, this.position.z);
      this.root.position.copy(this.position);
      map.normalAt(this.position.x, this.position.z, _n);
      _q.setFromUnitVectors(UP, _n);
      this.root.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, -this.heading));
    }
    this.map = map;
    // aim point slightly above the ground
    this.position.y += this.kind === 'ship' ? 8 : 2;
    scene.add(this.root);
  }

  damage(amount, source, battle) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this.destroy(source, battle);
  }

  destroy(source, battle) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    const big = this.type === 'fuel' || this.type === 'ship' ? 2.5 : this.type === 'sam' || this.type === 'radar' ? 1.6 : 1.1;
    battle.effects.groundExplosion(this.position, big);
    // wreck: darkened, tilted
    this.mesh.material = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 1 });
    this.root.rotation.z += (Math.random() - 0.5) * 0.3;
    this.root.position.y -= this.kind === 'ship' ? 4 : 0.6;
    if (this.spinner) this.spinner.visible = false;
    this.wreckTime = this.kind === 'ship' ? 90 : 45;
    if (source && source.owner) source.owner.kills++;
    battle.onGroundKilled(this, source);
  }

  _lineOfSight(map, target) {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const x = this.position.x + (target.position.x - this.position.x) * t;
      const y = this.position.y + (target.position.y - this.position.y) * t;
      const z = this.position.z + (target.position.z - this.position.z) * t;
      if (map.heightAt(x, z) > y) return false;
    }
    return true;
  }

  update(dt, battle) {
    if (!this.alive) {
      if (this.wreckTime > 0) {
        this.wreckTime -= dt;
        if (Math.random() < dt * 6) battle.effects.smokeColumn(this.position);
        if (this.kind === 'ship') {
          this.root.position.y -= dt * 0.15;
          this.root.rotation.z += dt * 0.004;
        }
      }
      return;
    }
    if (this.spinner) this.spinner.rotation.y += dt * (this.type === 'radar' ? 1.2 : 0.6);
    if (this.speed > 0) this._move(dt, battle.map);
    if (!this.range || this.team !== 'enemy') return;
    // pick nearest hostile aircraft
    let target = null, best = Infinity;
    for (const ac of battle.aircraft) {
      if (!ac.alive || ac.dying || ac.team === this.team || ac.team === 'civil') continue;
      const d = ac.position.distanceTo(this.position);
      if (d < best) { best = d; target = ac; }
    }
    if (!target || best > this.range) {
      this.lockTime = Math.max(0, this.lockTime - dt);
      return;
    }
    const agl = target.position.y - battle.map.surfaceAt(target.position.x, target.position.z);
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.5;
      this.hasLos = this._lineOfSight(battle.map, target);
    }
    const masked = !this.hasLos || agl < 45;
    if (this.type === 'sam' || this.type === 'ship') {
      if (!masked) {
        this.lockTime += dt;
        target.lockedBy = Math.max(target.lockedBy, this.lockTime > 0.5 ? 1 : 0);
      } else this.lockTime = Math.max(0, this.lockTime - dt * 2);
      this.cooldown -= dt;
      if (this.lockTime > 3.0 / this.difficulty && this.cooldown <= 0 && this.missilesLeft > 0) {
        const origin = _w.copy(this.position).add(new THREE.Vector3(0, 6, 0)).clone();
        battle.weapons.launchMissile(this, target, 'sam', origin);
        this.missilesLeft--;
        this.cooldown = (10 + Math.random() * 6) / this.difficulty;
        this.lockTime = 1.5;
      }
    }
    if ((this.type === 'aaa' || this.type === 'ship') && best < 2600 && !masked) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burst = 1.6;
        this.burstTimer = 3.2 + Math.random() * 2;
      }
      if (this.burst > 0) {
        this.burst -= dt;
        this.cooldown -= dt;
        if (Math.random() < dt * 14) {
          const speed = 900;
          const tof = best / speed;
          const aimErr = 18 / this.difficulty;
          _v.copy(target.position).addScaledVector(target.velocity, tof);
          _v.x += (Math.random() - 0.5) * aimErr * tof * 4;
          _v.y += (Math.random() - 0.5) * aimErr * tof * 4 + 4.9 * tof * tof;
          _v.z += (Math.random() - 0.5) * aimErr * tof * 4;
          const origin = this.position.clone().add(new THREE.Vector3(0, 3, 0));
          const vel = _v.sub(origin).normalize().multiplyScalar(speed);
          battle.weapons.fireBullet(this, origin, vel.clone(), 4, 3.2);
        }
      }
    }
  }

  _move(dt, map) {
    if (this.route && this.route.length > 1) {
      const wp = this.route[this.routeIndex % this.route.length];
      const dx = wp.x - this.position.x, dz = wp.z - this.position.z;
      if (dx * dx + dz * dz < 30 * 30) this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this.targetHeading = Math.atan2(dx, -dz);
    } else if (this.kind === 'ship') {
      // zig-zag and turn away from shallow water
      this.zigTimer -= dt;
      if (this.zigTimer <= 0) {
        this.zigTimer = 20 + Math.random() * 25;
        this.targetHeading = this.heading + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
      }
      const ax = this.position.x + Math.sin(this.heading) * 400, az = this.position.z - Math.cos(this.heading) * 400;
      if (map.heightAt(ax, az) > map.waterLevel - 10) this.targetHeading = this.heading + 2.2;
    }
    let dh = this.targetHeading - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += Math.sign(dh) * Math.min(Math.abs(dh), this.turnRate * dt);
    const sx = Math.sin(this.heading), sz = -Math.cos(this.heading);
    this.velocity.set(sx, 0, sz).multiplyScalar(this.speed);
    this.position.x += sx * this.speed * dt;
    this.position.z += sz * this.speed * dt;
    if (this.kind === 'ship') {
      this.root.position.set(this.position.x, map.waterLevel, this.position.z);
      this.root.rotation.set(0, -this.heading, Math.sin(this.wreckTime + this.position.x * 0.01) * 0.01);
    } else {
      const h = map.heightAt(this.position.x, this.position.z);
      this.position.y = h + 2;
      this.root.position.set(this.position.x, h, this.position.z);
      map.normalAt(this.position.x, this.position.z, _n);
      _q.setFromUnitVectors(UP, _n);
      this.root.quaternion.copy(_q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, -this.heading));
    }
  }

  dispose() {
    if (this.scene) this.scene.remove(this.root);
  }
}

export { UNIT_STATS };
