// Billboard cumulus clouds: clusters of soft lit puffs rendered as a single
// instanced draw, depth-sorted on the CPU and wrapped around the camera so the
// sky is never empty no matter how far you fly.
import * as THREE from 'three';
import { atmoUniforms } from './atmosphere.js';
import { getCloudAtlas } from './textures.js';
import { mulberry32 } from './noise.js';

const vertexShader = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iData; // size, rotation, vertical shade (0..1), sunward (-1..1)
  attribute float iCell;
  varying vec2 vUv;
  varying float vShade;
  varying float vSunward;
  varying float vFade;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    float size = iData.x;
    float rot = iData.y;
    vec4 mvCenter = viewMatrix * vec4( iPos, 1.0 );
    float c = cos( rot ), s = sin( rot );
    vec2 corner = position.xy;
    vec2 rc = vec2( c * corner.x - s * corner.y, s * corner.x + c * corner.y );
    vec4 mvPosition = mvCenter + vec4( rc * size, 0.0, 0.0 );
    gl_Position = projectionMatrix * mvPosition;
    float cellX = mod( iCell, 2.0 ), cellY = floor( iCell / 2.0 );
    vUv = ( uv + vec2( cellX, cellY ) ) * 0.5;
    vShade = iData.z;
    vSunward = iData.w;
    float d = -mvCenter.z;
    vFade = smoothstep( size * 0.35, size * 1.6, length( mvCenter.xyz ) ) * step( 0.0, d + size );
    vWorld = iPos;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vShade;
  varying float vSunward;
  varying float vFade;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D( uAtlas, vUv );
    float a = t.a * vFade * uOpacity;
    if ( a < 0.01 ) discard;
    vec3 viewDir = normalize( vWorld - cameraPosition );
    float forward = pow( max( dot( viewDir, uAtmoSunDir ), 0.0 ), 5.0 );
    float sunH = clamp( uAtmoSunDir.y * 2.0, 0.15, 1.0 );
    float lit = mix( 0.45, 1.0, vShade ) * ( 0.72 + 0.28 * vSunward ) * mix( 0.85, 1.05, t.b );
    vec3 col = uAmbient * mix( 0.75, 1.0, vShade ) + uSunColor * lit * 0.95 * sunH;
    col += uSunColor * t.g * forward * 1.6;
    gl_FragColor = vec4( col, a );
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Clouds {
  constructor(mapDef, quality, scene) {
    this.scene = scene;
    const cfg = mapDef.clouds;
    const rand = mulberry32(mapDef.seed * 31 + 7);
    this.tile = 64000;
    this.clusters = [];
    const clusterCount = Math.round(150 * cfg.density * quality.clouds);
    const puffs = [];
    for (let i = 0; i < clusterCount; i++) {
      const cx = (rand() - 0.5) * this.tile;
      const cz = (rand() - 0.5) * this.tile;
      const big = rand();
      const rx = 400 + big * 900;
      const ry = 160 + big * 380;
      const base = cfg.base + rand() * (cfg.top - cfg.base) * 0.6;
      const cluster = { x: cx, y: base + ry, z: cz, rx, ry };
      this.clusters.push(cluster);
      const n = Math.round(6 + big * 12 * Math.max(0.5, quality.clouds));
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand());
        const ox = Math.cos(a) * r * rx * 0.85;
        const oz = Math.sin(a) * r * rx * 0.85;
        const hmax = ry * Math.sqrt(Math.max(0, 1 - r * r));
        const oy = rand() * hmax * 1.1 - ry * 0.25;
        const size = (180 + rand() * 260) * (0.7 + big * 0.7);
        const vshade = Math.max(0, Math.min(1, (oy + ry * 0.4) / (ry * 1.4)));
        puffs.push({ cluster, ox, oy, oz, size, rot: rand() * Math.PI * 2, shade: vshade, cell: Math.floor(rand() * 4) });
      }
    }
    this.puffs = puffs;
    const count = puffs.length;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.iCell = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iData.setUsage(THREE.DynamicDrawUsage);
    this.iCell.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iData', this.iData);
    geo.setAttribute('iCell', this.iCell);
    geo.instanceCount = count;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, atmoUniforms(), {
      uAtlas: { value: getCloudAtlas(quality.textureSize >= 1024 ? 256 : 128) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.5, 0.55, 0.65) },
      uOpacity: { value: 0.92 },
    });
    const mat = new THREE.ShaderMaterial({
      name: 'Clouds',
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'clouds';
    scene.add(this.mesh);
    this._order = new Array(count).fill(0).map((_, i) => i);
    this._dist = new Float32Array(count);
    this._wx = new Float32Array(count);
    this._wy = new Float32Array(count);
    this._wz = new Float32Array(count);
    this._sun = new THREE.Vector3(0, 1, 0);
    this._timer = 0;
    this.wind = new THREE.Vector2(6, 2);
    this.time = 0;
  }

  setLighting(sunColor, ambient, sunDir) {
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uAmbient.value.copy(ambient);
    this._sun.copy(sunDir);
    this._timer = 0;
  }

  _wrap(v, c) {
    const T = this.tile;
    return v + T * Math.round((c - v) / T);
  }

  update(camera, dt) {
    this.time += dt;
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.25;
    const cam = camera.position;
    const wx = this.wind.x * this.time, wz = this.wind.y * this.time;
    const n = this.puffs.length;
    for (let i = 0; i < n; i++) {
      const p = this.puffs[i];
      const c = p.cluster;
      const x = this._wrap(c.x + wx, cam.x) + p.ox;
      const z = this._wrap(c.z + wz, cam.z) + p.oz;
      const y = c.y + p.oy;
      this._wx[i] = x; this._wy[i] = y; this._wz[i] = z;
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      this._dist[i] = dx * dx + dy * dy + dz * dz;
    }
    const d = this._dist;
    this._order.sort((a, b) => d[b] - d[a]);
    const P = this.iPos.array, D = this.iData.array, C = this.iCell.array;
    const s = this._sun;
    for (let k = 0; k < n; k++) {
      const i = this._order[k];
      const p = this.puffs[i];
      P[k * 3] = this._wx[i];
      P[k * 3 + 1] = this._wy[i];
      P[k * 3 + 2] = this._wz[i];
      const len = Math.hypot(p.ox, p.oy, p.oz) || 1;
      D[k * 4] = p.size;
      D[k * 4 + 1] = p.rot;
      D[k * 4 + 2] = p.shade;
      D[k * 4 + 3] = (p.ox * s.x + p.oy * s.y + p.oz * s.z) / len;
      C[k] = p.cell;
    }
    this.iPos.needsUpdate = true;
    this.iData.needsUpdate = true;
    this.iCell.needsUpdate = true;
  }

  // 0..1 how deep inside a cloud a point is (for the white-out overlay)
  densityAt(pos) {
    const wx = this.wind.x * this.time, wz = this.wind.y * this.time;
    let best = 0;
    for (const c of this.clusters) {
      const x = this._wrap(c.x + wx, pos.x), z = this._wrap(c.z + wz, pos.z);
      const dx = (pos.x - x) / (c.rx * 0.9), dy = (pos.y - c.y) / (c.ry * 1.1), dz = (pos.z - z) / (c.rx * 0.9);
      const q = dx * dx + dy * dy + dz * dz;
      if (q < 1) best = Math.max(best, 1 - q);
    }
    return Math.min(1, best * 1.6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
