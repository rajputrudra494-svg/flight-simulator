// Camera-facing ribbon trails (wingtip vortices, contrails, missile trails)
// batched into a single dynamic mesh.
import * as THREE from 'three';
import { atmoUniforms } from '../world/atmosphere.js';

const vertexShader = /* glsl */ `
  attribute vec4 color4;
  varying vec4 vCol;
  #include <fog_pars_vertex>
  void main() {
    vCol = color4;
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uLight;
  varying vec4 vCol;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4( vCol.rgb * uLight, vCol.a );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Trail {
  constructor(system, { width = 0.6, life = 2, color = [1, 1, 1], maxPoints = 64, minDist = 4, growth = 1 }) {
    this.sys = system;
    this.width = width;
    this.life = life;
    this.color = color;
    this.max = maxPoints;
    this.minDist = minDist;
    this.growth = growth;
    this.pts = []; // {x,y,z,t,a,brk}
    this.last = null;
    this.alive = true;
  }

  add(pos, alpha, time) {
    const p = this.pts;
    const last = p[p.length - 1];
    if (alpha <= 0.001) {
      if (last) last.end = true;
      this.last = null;
      return;
    }
    if (this.last && last && !last.end) {
      const dx = pos.x - this.last.x, dy = pos.y - this.last.y, dz = pos.z - this.last.z;
      if (dx * dx + dy * dy + dz * dz < this.minDist * this.minDist) {
        // move the head point along with the source
        last.x = pos.x; last.y = pos.y; last.z = pos.z; last.a = alpha;
        return;
      }
    }
    p.push({ x: pos.x, y: pos.y, z: pos.z, t: time, a: alpha, end: false });
    this.last = { x: pos.x, y: pos.y, z: pos.z };
    if (p.length > this.max) p.shift();
  }

  stop() {
    const last = this.pts[this.pts.length - 1];
    if (last) last.end = true;
    this.last = null;
  }
}

export class TrailSystem {
  constructor(scene, maxVerts = 30000) {
    this.scene = scene;
    this.trails = new Set();
    this.max = maxVerts;
    this.pos = new Float32Array(maxVerts * 3);
    this.col = new Float32Array(maxVerts * 4);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color4', this.aCol);
    geo.setDrawRange(0, 0);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, atmoUniforms(), { uLight: { value: new THREE.Color(1, 1, 1) } });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.geo = geo;
    scene.add(this.mesh);
    this.time = 0;
    this._side = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._view = new THREE.Vector3();
  }

  create(opts) {
    const t = new Trail(this, opts);
    this.trails.add(t);
    return t;
  }

  remove(t) {
    t.alive = false;
  }

  setLighting(color) {
    this.uniforms.uLight.value.copy(color);
  }

  update(dt, camera) {
    this.time += dt;
    const now = this.time;
    const cam = camera.position;
    let v = 0;
    const P = this.pos, C = this.col;
    const side = this._side, tan = this._tan, view = this._view;
    for (const tr of this.trails) {
      const pts = tr.pts;
      while (pts.length && now - pts[0].t > tr.life) pts.shift();
      if (!tr.alive && pts.length === 0) {
        this.trails.delete(tr);
        continue;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a.end) continue;
        if (v + 6 > this.max) break;
        tan.set(b.x - a.x, b.y - a.y, b.z - a.z);
        view.set(a.x - cam.x, a.y - cam.y, a.z - cam.z);
        side.crossVectors(tan, view);
        const sl = side.length();
        if (sl < 1e-6) continue;
        const ageA = (now - a.t) / tr.life, ageB = (now - b.t) / tr.life;
        const wA = tr.width * (1 + ageA * tr.growth) * 0.5 / sl;
        const wB = tr.width * (1 + ageB * tr.growth) * 0.5 / sl;
        const alA = a.a * (1 - ageA) * (1 - ageA);
        const alB = b.a * (1 - ageB) * (1 - ageB);
        const ax0 = a.x - side.x * wA, ay0 = a.y - side.y * wA, az0 = a.z - side.z * wA;
        const ax1 = a.x + side.x * wA, ay1 = a.y + side.y * wA, az1 = a.z + side.z * wA;
        const bx0 = b.x - side.x * wB, by0 = b.y - side.y * wB, bz0 = b.z - side.z * wB;
        const bx1 = b.x + side.x * wB, by1 = b.y + side.y * wB, bz1 = b.z + side.z * wB;
        const c = tr.color;
        const put = (x, y, z, al) => {
          P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
          C[v * 4] = c[0]; C[v * 4 + 1] = c[1]; C[v * 4 + 2] = c[2]; C[v * 4 + 3] = al;
          v++;
        };
        put(ax0, ay0, az0, alA); put(ax1, ay1, az1, alA); put(bx0, by0, bz0, alB);
        put(ax1, ay1, az1, alA); put(bx1, by1, bz1, alB); put(bx0, by0, bz0, alB);
      }
    }
    this.geo.setDrawRange(0, v);
    if (v) {
      this.aPos.clearUpdateRanges();
      this.aCol.clearUpdateRanges();
      this.aPos.addUpdateRange(0, v * 3);
      this.aCol.addUpdateRange(0, v * 4);
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
    }
  }

  clear() {
    this.trails.clear();
    this.geo.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}
