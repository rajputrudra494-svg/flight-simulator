// GPU-instanced billboard particle pools (alpha-blended smoke + additive fire).
// Particles are simulated on the CPU in flat typed arrays (no allocation).
import * as THREE from 'three';
import { atmoUniforms } from '../world/atmosphere.js';
import { getParticleAtlas } from '../world/textures.js';

const vertexShader = /* glsl */ `
  attribute vec3 iPos;
  attribute vec2 iSizeRot;
  attribute vec4 iColor;
  attribute float iCell;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvCenter = modelViewMatrix * vec4( iPos, 1.0 );
    float c = cos( iSizeRot.y ), s = sin( iSizeRot.y );
    vec2 p = position.xy;
    vec2 r = vec2( c * p.x - s * p.y, s * p.x + c * p.y ) * iSizeRot.x;
    vec4 mvPosition = mvCenter + vec4( r, 0.0, 0.0 );
    gl_Position = projectionMatrix * mvPosition;
    float cx = mod( iCell, 2.0 ), cy = floor( iCell / 2.0 );
    vUv = ( uv + vec2( cx, cy ) ) * 0.5;
    vColor = iColor;
    #include <fog_vertex>
  }
`;

const fragmentNormal = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D( uAtlas, vUv );
    float a = t.a * vColor.a;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vColor.rgb * t.rgb * uLight, a );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const fragmentAdditive = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D( uAtlas, vUv );
    float a = t.a * vColor.a;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vColor.rgb * a, 1.0 );
    #ifdef USE_FOG
      vec3 atmoRay = vFogWorldPos - cameraPosition;
      float atmoDist = length( atmoRay );
      float fogF = atmoFogAmount( atmoDist, atmoRay / max( atmoDist, 1e-3 ), fogDensity );
      gl_FragColor.rgb *= 1.0 - fogF;
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class Pool {
  constructor(capacity, additive, scene) {
    this.cap = capacity;
    this.n = 0;
    this.additive = additive;
    const C = capacity;
    this.px = new Float32Array(C); this.py = new Float32Array(C); this.pz = new Float32Array(C);
    this.vx = new Float32Array(C); this.vy = new Float32Array(C); this.vz = new Float32Array(C);
    this.age = new Float32Array(C); this.life = new Float32Array(C);
    this.s0 = new Float32Array(C); this.s1 = new Float32Array(C);
    this.rot = new Float32Array(C); this.rv = new Float32Array(C);
    this.c0 = new Float32Array(C * 4); this.c1 = new Float32Array(C * 4);
    this.cell = new Float32Array(C);
    this.drag = new Float32Array(C); this.grav = new Float32Array(C);

    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(C * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(C * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(C * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(C), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSizeRot', this.aSR);
    geo.setAttribute('iColor', this.aCol);
    geo.setAttribute('iCell', this.aCell);
    geo.instanceCount = 0;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, atmoUniforms(), {
      uAtlas: { value: getParticleAtlas() },
      uLight: { value: new THREE.Color(1, 1, 1) },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader: additive ? fragmentAdditive : fragmentNormal,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 30 : 25;
    this.geo = geo;
    scene.add(this.mesh);
    this._order = new Uint32Array(C);
    this._d = new Float32Array(C);
  }

  emit(o) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else {
      // recycle the oldest-ish particle
      i = Math.floor(Math.random() * this.cap);
    }
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.age[i] = 0;
    this.life[i] = o.life || 1;
    this.s0[i] = o.size0 ?? 1;
    this.s1[i] = o.size1 ?? this.s0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28;
    this.rv[i] = o.rotVel ?? (Math.random() - 0.5);
    const c0 = o.color0 || [1, 1, 1, 1], c1 = o.color1 || c0;
    this.c0.set(c0, i * 4);
    this.c1.set(c1, i * 4);
    this.cell[i] = o.cell || 0;
    this.drag[i] = o.drag ?? 0.5;
    this.grav[i] = o.gravity ?? 0;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.age[i] = this.age[j]; this.life[i] = this.life[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.rot[i] = this.rot[j]; this.rv[i] = this.rv[j];
    for (let k = 0; k < 4; k++) {
      this.c0[i * 4 + k] = this.c0[j * 4 + k];
      this.c1[i * 4 + k] = this.c1[j * 4 + k];
    }
    this.cell[i] = this.cell[j];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
  }

  update(dt, camPos, sort) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this._kill(i);
        i--;
        continue;
      }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] = this.vy[i] * dr - this.grav[i] * dt; this.vz[i] *= dr;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rv[i] * dt;
    }
    const n = this.n;
    const order = this._order;
    for (let i = 0; i < n; i++) order[i] = i;
    if (sort && n > 1) {
      const d = this._d;
      for (let i = 0; i < n; i++) {
        const dx = this.px[i] - camPos.x, dy = this.py[i] - camPos.y, dz = this.pz[i] - camPos.z;
        d[i] = dx * dx + dy * dy + dz * dz;
      }
      const sub = order.subarray(0, n);
      sub.sort((a, b) => d[b] - d[a]);
    }
    const P = this.aPos.array, SR = this.aSR.array, CO = this.aCol.array, CE = this.aCell.array;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      const t = this.age[i] / this.life[i];
      P[k * 3] = this.px[i]; P[k * 3 + 1] = this.py[i]; P[k * 3 + 2] = this.pz[i];
      SR[k * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      SR[k * 2 + 1] = this.rot[i];
      const i4 = i * 4, k4 = k * 4;
      // colour: linear blend; alpha fades in quickly then out
      const fadeIn = Math.min(1, t * 12);
      CO[k4] = this.c0[i4] + (this.c1[i4] - this.c0[i4]) * t;
      CO[k4 + 1] = this.c0[i4 + 1] + (this.c1[i4 + 1] - this.c0[i4 + 1]) * t;
      CO[k4 + 2] = this.c0[i4 + 2] + (this.c1[i4 + 2] - this.c0[i4 + 2]) * t;
      CO[k4 + 3] = (this.c0[i4 + 3] + (this.c1[i4 + 3] - this.c0[i4 + 3]) * t) * fadeIn;
      CE[k] = this.cell[i];
    }
    this.geo.instanceCount = n;
    if (n) {
      this.aPos.addUpdateRange(0, n * 3);
      this.aSR.addUpdateRange(0, n * 2);
      this.aCol.addUpdateRange(0, n * 4);
      this.aCell.addUpdateRange(0, n);
      this.aPos.needsUpdate = this.aSR.needsUpdate = this.aCol.needsUpdate = this.aCell.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

export class Particles {
  constructor(scene, quality) {
    this.scene = scene;
    const cap = quality.particles;
    this.smoke = new Pool(cap, false, scene);
    this.fire = new Pool(Math.round(cap * 0.7), true, scene);
    this.frame = 0;
  }

  setLighting(color) {
    this.smoke.uniforms.uLight.value.copy(color);
  }

  update(dt, camera) {
    this.frame++;
    this.smoke.update(dt, camera.position, this.frame % 2 === 0);
    this.fire.update(dt, camera.position, false);
  }

  // ---- presets -------------------------------------------------------------
  explosion(pos, scale = 1, vel = null) {
    const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    // flash
    this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.25, size0: 30 * scale, size1: 60 * scale, color0: [6, 4.5, 3, 1], color1: [2, 1, 0.4, 0], cell: 2 });
    // shockwave
    this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.5, size0: 6 * scale, size1: 90 * scale, color0: [1.5, 1.3, 1.1, 0.6], color1: [1, 1, 1, 0], cell: 3, rotVel: 0 });
    const nFire = Math.round(26 * Math.min(scale, 2.5));
    for (let i = 0; i < nFire; i++) {
      const d = randDir();
      const sp = (8 + Math.random() * 30) * scale;
      this.fire.emit({
        x: pos.x + d[0] * 2 * scale, y: pos.y + d[1] * 2 * scale, z: pos.z + d[2] * 2 * scale,
        vx: vx + d[0] * sp, vy: vy + d[1] * sp + 4, vz: vz + d[2] * sp,
        life: 0.6 + Math.random() * 0.9, size0: (6 + Math.random() * 8) * scale, size1: (16 + Math.random() * 14) * scale,
        color0: [4.5, 2.6, 1.0, 1], color1: [1.2, 0.25, 0.05, 0], cell: 1, drag: 2.2,
      });
    }
    const nSmoke = Math.round(22 * Math.min(scale, 2.5));
    for (let i = 0; i < nSmoke; i++) {
      const d = randDir();
      const sp = (5 + Math.random() * 18) * scale;
      const g = 0.12 + Math.random() * 0.1;
      this.smoke.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: vx + d[0] * sp, vy: vy + d[1] * sp + 3, vz: vz + d[2] * sp,
        life: 3 + Math.random() * 4, size0: (8 + Math.random() * 6) * scale, size1: (30 + Math.random() * 25) * scale,
        color0: [g, g, g, 0.85], color1: [g * 2.2, g * 2.2, g * 2.2, 0], cell: 0, drag: 1.4, gravity: -1.2,
      });
    }
    const nSparks = Math.round(24 * Math.min(scale, 2));
    for (let i = 0; i < nSparks; i++) {
      const d = randDir();
      const sp = (30 + Math.random() * 70) * scale;
      this.fire.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: vx + d[0] * sp, vy: vy + d[1] * sp + 10, vz: vz + d[2] * sp,
        life: 0.8 + Math.random() * 1.4, size0: 1.6 * scale, size1: 0.4 * scale,
        color0: [6, 3.5, 1.2, 1], color1: [2, 0.6, 0.1, 0], cell: 2, drag: 0.6, gravity: 9.8,
      });
    }
  }

  groundImpact(pos, water) {
    if (water) {
      for (let i = 0; i < 4; i++) {
        this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: 8 + Math.random() * 10, vz: (Math.random() - 0.5) * 3, life: 1.2, size0: 1.5, size1: 5, color0: [1.1, 1.15, 1.2, 0.7], color1: [1, 1, 1, 0], cell: 0, drag: 1.5, gravity: 9 });
      }
    } else {
      this.smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: 0, vy: 3, vz: 0, life: 1.5, size0: 2, size1: 7, color0: [0.45, 0.38, 0.3, 0.8], color1: [0.5, 0.45, 0.4, 0], cell: 0, drag: 1 });
      this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.1, size0: 2.5, size1: 3, color0: [5, 3, 1, 1], color1: [1, 0.4, 0, 0], cell: 2 });
    }
  }

  hitSparks(pos, vel) {
    for (let i = 0; i < 6; i++) {
      const d = randDir();
      this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x + d[0] * 40, vy: vel.y + d[1] * 40, vz: vel.z + d[2] * 40, life: 0.3 + Math.random() * 0.3, size0: 1.2, size1: 0.3, color0: [6, 4, 2, 1], color1: [2, 0.5, 0.1, 0], cell: 2, drag: 1 });
    }
    this.fire.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z, life: 0.12, size0: 4, size1: 6, color0: [6, 4, 2, 1], color1: [2, 1, 0.3, 0], cell: 2, drag: 0 });
  }

  clear() {
    this.smoke.clear();
    this.fire.clear();
  }

  dispose() {
    this.smoke.dispose(this.scene);
    this.fire.dispose(this.scene);
  }
}

export function randDir() {
  let x, y, z, l;
  do {
    x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1;
    l = x * x + y * y + z * z;
  } while (l > 1 || l < 1e-4);
  l = Math.sqrt(l);
  return [x / l, y / l, z / l];
}
