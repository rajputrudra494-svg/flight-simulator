// Quadtree level-of-detail terrain streamed around the camera. Chunks are
// generated from the map height function within a per-frame time budget, and
// shaded by a procedural splatting shader (sand / grass / forest / farmland /
// rock strata / snow / underwater tint).
import * as THREE from 'three';
import { getNoiseTexture } from './textures.js';

const terrainShaderPars = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uWaterLevel;
  uniform float uSnowLine;
  uniform float uBeach;
  uniform float uForest;
  uniform float uFields;
  uniform float uStrata;
  uniform vec3 uSand;
  uniform vec3 uGrass1;
  uniform vec3 uGrass2;
  uniform vec3 uForestCol;
  uniform vec3 uRock1;
  uniform vec3 uRock2;
  uniform vec3 uSnow;
  uniform vec3 uDirt;
  uniform vec3 uFieldA;
  uniform vec3 uFieldB;
  uniform vec3 uFieldC;
  uniform vec3 uWaterDeep;
  uniform float uAbsorb;
  uniform float uTreeLine;
  uniform float uCityOn;
  uniform sampler2D uCityTex;
  uniform vec2 uCityOrigin;
  uniform vec2 uCityCell;
  uniform float uCityN;
  uniform float uNight;
  uniform float uTime;
  uniform vec4 uRoads[ 4 ];
  uniform float uRoadCount;
  varying vec3 vTPos;
  varying vec3 vTNormal;
  vec3 tCityEmit = vec3( 0.0 );

  float tSegDist( vec2 p, vec2 a, vec2 b ) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 );
    return length( pa - ba * h );
  }

  // Street grid, parks, docks and (at night) sodium street lighting for the
  // city cells encoded in uCityTex, plus highways from uRoads.
  void cityPaint( inout vec3 col, vec2 p, vec4 nC, vec4 nD ) {
    float px = max( fwidth( p.x ), fwidth( p.y ) );
    vec3 asphalt = vec3( 0.13, 0.135, 0.14 ) * ( 0.9 + 0.25 * nD.r );
    vec3 sodium = vec3( 1.0, 0.62, 0.28 );
    for ( int i = 0; i < 4; i++ ) {
      if ( float( i ) >= uRoadCount ) break;
      vec4 r = uRoads[ i ];
      float d = tSegDist( p, r.xy, r.zw );
      float road = 1.0 - smoothstep( 12.0 - px, 12.0 + px, d );
      if ( road > 0.0 ) {
        float lane = ( 1.0 - smoothstep( 0.2, 0.2 + px, abs( d - 6.0 ) ) ) * step( 0.5, fract( dot( p, normalize( r.zw - r.xy ) ) / 10.0 ) ) * ( 1.0 - smoothstep( 2.0, 6.0, px ) );
        col = mix( col, mix( asphalt, vec3( 0.85 ), lane ), road );
        tCityEmit += uNight * uNight * 0.6 * sodium * road * ( 0.12 + 0.5 * exp( -pow( abs( fract( dot( p, normalize( r.zw - r.xy ) ) / 40.0 ) - 0.5 ) * 40.0, 2.0 ) / max( 2.0, px * px ) ) * ( 1.0 - smoothstep( 9.0, 12.0, d ) ) );
      }
    }
    vec2 g = ( p - uCityOrigin ) / uCityCell.x;
    if ( g.x < 0.0 || g.y < 0.0 || g.x >= uCityN || g.y >= uCityN ) return;
    float type = floor( texture2D( uCityTex, ( floor( g ) + 0.5 ) / uCityN ).r * 255.0 + 0.5 );
    if ( type < 0.5 ) return;
    float C = uCityCell.x;
    vec2 f = fract( g ) * C;
    vec2 e = min( f, C - f );
    bool alongZ = e.x < e.y;
    float edge = min( e.x, e.y );
    float hs = uCityCell.y * 0.5;
    float aa = px * 0.75 + 0.1;
    float road = 1.0 - smoothstep( hs - aa, hs + aa, edge );
    float walk = 1.0 - smoothstep( hs + 3.5 - aa, hs + 3.5 + aa, edge );
    vec3 lot;
    if ( type < 1.5 ) lot = vec3( 0.4, 0.395, 0.375 ) * ( 0.85 + 0.3 * nC.g );
    else if ( type < 2.5 ) lot = mix( uGrass1, uForestCol, 0.3 ) * ( 0.85 + 0.3 * nC.b );
    else lot = vec3( 0.47, 0.46, 0.44 ) * ( 0.88 + 0.2 * nC.r );
    vec3 sidewalk = vec3( 0.56, 0.55, 0.52 );
    float along = alongZ ? p.y : p.x;
    float centre = ( 1.0 - smoothstep( 0.18, 0.18 + aa, edge ) ) * step( 0.5, fract( along / 9.0 ) ) * ( 1.0 - smoothstep( 2.0, 6.0, px ) );
    vec3 c = mix( lot, sidewalk, walk * ( type < 1.5 ? 1.0 : 0.6 ) );
    c = mix( c, asphalt, road );
    c = mix( c, vec3( 0.85, 0.82, 0.6 ), centre * road );
    // average the pattern out far away so it never shimmers
    float far = smoothstep( 8.0, 30.0, px );
    vec3 avgCol = mix( lot, asphalt, min( 1.0, ( hs * 2.0 ) / C * 1.7 ) );
    col = mix( c, avgCol, far );
    if ( uNight > 0.01 ) {
      float lp = abs( fract( along / 32.0 ) - 0.5 ) * 32.0;
      float ld = length( vec2( lp, edge - ( hs + 1.2 ) ) );
      float bulb = exp( -ld * ld / max( 1.5, px * px * 0.8 ) );
      float pool = exp( -ld * ld / 90.0 ) * road * 0.35;
      float lineGlow = ( 1.0 - smoothstep( hs, hs + 2.0 + px * 1.5, edge ) ) * 0.12;
      float near = 1.0 - smoothstep( 3.0, 12.0, px );
      // moving car lights in the streets
      float lane = edge - hs * 0.5;
      float dir = ( alongZ ? f.x : f.y ) < C * 0.5 ? -1.0 : 1.0;
      float carPos = fract( along / 55.0 + fract( floor( g.x ) * 0.37 + floor( g.y ) * 0.61 ) + uTime * 0.24 * dir );
      float car = ( 1.0 - smoothstep( 0.0, 1.2 + px, abs( lane ) ) ) * ( 1.0 - smoothstep( 0.0, 0.04 + px / 55.0, abs( carPos - 0.5 ) ) ) * near;
      tCityEmit += uNight * uNight * ( sodium * mix( lineGlow * 1.6, bulb * 1.6 + pool * 0.6, near ) + vec3( 1.0, 0.9, 0.75 ) * car * 1.2 );
    }
  }

  float tHash( vec2 p ) {
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
  }

  vec3 fieldColor( vec2 p, float dist ) {
    vec2 q = mat2( 0.8, -0.6, 0.6, 0.8 ) * p;
    q += ( texture2D( uNoise, p / 9000.0 ).rg - 0.5 ) * 500.0;
    vec2 sz = vec2( 430.0, 290.0 );
    vec2 cell = floor( q / sz );
    vec2 f = fract( q / sz );
    float h = tHash( cell );
    vec3 c = h < 0.22 ? uFieldA : h < 0.42 ? uFieldB : h < 0.6 ? uFieldC : h < 0.8 ? uGrass2 : uGrass1;
    c *= 0.9 + 0.2 * tHash( cell + 7.0 );
    float edgeW = 3.0 + dist * 0.0025;
    float edge = min( min( f.x, 1.0 - f.x ) * sz.x, min( f.y, 1.0 - f.y ) * sz.y );
    float hedge = 1.0 - smoothstep( edgeW, edgeW * 2.5, edge );
    c = mix( c, uForestCol * 1.1, hedge * smoothstep( 9000.0, 2000.0, dist ) * 0.8 );
    float furrow = sin( ( h > 0.5 ? q.x : q.y ) * 1.4 ) * smoothstep( 1500.0, 200.0, dist );
    c *= 0.94 + 0.06 * furrow;
    return c;
  }

  vec3 terrainAlbedo() {
    vec3 n = normalize( vTNormal );
    float slope = 1.0 - n.y;
    float h = vTPos.y;
    vec2 p = vTPos.xz;
    float dist = length( vTPos - cameraPosition );
    vec4 nA = texture2D( uNoise, p / 4096.0 );
    vec4 nB = texture2D( uNoise, p / 640.0 );
    vec4 nC = texture2D( uNoise, p / 96.0 );
    vec4 nD = texture2D( uNoise, p / 14.0 );

    float above = h - uWaterLevel;

    // grass base with macro variation
    vec3 col = mix( uGrass1, uGrass2, smoothstep( 0.3, 0.7, nA.r + ( nB.g - 0.5 ) * 0.5 ) );
    col = mix( col, uDirt, smoothstep( 0.62, 0.8, nB.a + ( nC.r - 0.5 ) * 0.3 ) * 0.5 );

    // farmland patchwork on flat low ground
    if ( uFields > 0.0 ) {
      float fieldMask = uFields * smoothstep( 0.1, 0.03, slope ) * smoothstep( 420.0, 250.0, above ) * smoothstep( 4.0, 14.0, above );
      fieldMask *= smoothstep( 0.35, 0.5, nA.g );
      if ( fieldMask > 0.001 ) col = mix( col, fieldColor( p, dist ), fieldMask );
    }

    // forests
    float forest = smoothstep( 0.56, 0.64, nA.b + ( nB.r - 0.5 ) * 0.3 + ( nC.g - 0.5 ) * 0.12 ) * uForest;
    forest *= smoothstep( 0.42, 0.25, slope ) * smoothstep( uBeach, uBeach + 15.0, above ) * smoothstep( uTreeLine, uTreeLine - 150.0, h );
    vec3 forestCol = uForestCol * ( 0.7 + 0.6 * nC.g ) * ( 0.75 + 0.5 * nD.b );
    forestCol = mix( forestCol, uGrass1 * 0.8, smoothstep( 0.6, 0.85, nB.g ) * 0.4 );
    col = mix( col, forestCol, forest );

    // beaches
    float beach = 1.0 - smoothstep( uBeach * 0.4, uBeach, above + ( nB.b - 0.5 ) * uBeach * 0.8 );
    col = mix( col, uSand * ( 0.92 + 0.16 * nC.a ), beach );

    // rock on slopes, with optional strata bands (canyons)
    vec3 rock = mix( uRock1, uRock2, smoothstep( 0.3, 0.7, nB.a + ( nC.b - 0.5 ) * 0.4 ) );
    if ( uStrata > 0.0 ) {
      float band = sin( h * 0.13 + nB.r * 5.0 ) * 0.5 + 0.5;
      float band2 = sin( h * 0.041 + nA.g * 3.0 ) * 0.5 + 0.5;
      rock *= mix( 1.0, 0.78 + 0.32 * band, uStrata );
      rock = mix( rock, uSand * 0.95, uStrata * smoothstep( 0.7, 0.95, band2 ) * 0.5 );
    }
    rock *= 0.85 + 0.3 * nD.r;
    float rockAmt = smoothstep( 0.24, 0.42, slope + ( nC.g - 0.5 ) * 0.18 );
    col = mix( col, rock, rockAmt );

    // snow
    float snowAmt = smoothstep( uSnowLine - 120.0, uSnowLine + 120.0, h + ( nA.r - 0.5 ) * 500.0 + ( nC.r - 0.5 ) * 60.0 );
    snowAmt *= 1.0 - smoothstep( 0.42, 0.62, slope + ( nC.b - 0.5 ) * 0.2 );
    col = mix( col, uSnow * ( 0.93 + 0.07 * nD.g ), snowAmt );

    if ( uCityOn > 0.5 ) cityPaint( col, p, nC, nD );

    // fine detail
    float detailFade = smoothstep( 2500.0, 200.0, dist );
    col *= 1.0 + ( nD.a - 0.5 ) * 0.35 * detailFade + ( nC.a - 0.5 ) * 0.2;

    // wet sand / underwater absorption
    if ( above < 0.0 ) {
      float depth = -above;
      col *= vec3( 0.75, 0.88, 0.92 );
      col = mix( col, uWaterDeep, 1.0 - exp( -depth / uAbsorb ) );
    } else {
      col *= mix( 0.75, 1.0, smoothstep( 0.0, 2.5, above ) );
    }
    return col;
  }
`;

// Close-range micro relief: a bump from the noise texture at three scales
// (clods and stones, tussocks, gentle undulation) perturbs the shading normal
// and fades out with distance, so far terrain keeps its smooth look.
const terrainBump = /* glsl */ `
  {
    float tbDist = length( vTPos - cameraPosition );
    float tbFade = 1.0 - smoothstep( 250.0, 2200.0, tbDist );
    if ( tbFade > 0.0 && vTPos.y > uWaterLevel + 0.5 ) {
      vec2 bp = vTPos.xz;
      float hb = texture2D( uNoise, bp / 14.0 ).a * 0.6 + texture2D( uNoise, bp / 3.7 ).r * 0.35 + texture2D( uNoise, bp / 60.0 ).g * 1.4;
      vec3 sp = -vViewPosition;
      vec3 dpx = dFdx( sp ), dpy = dFdy( sp );
      float dhx = dFdx( hb ), dhy = dFdy( hb );
      vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
      float det = dot( dpx, r1 );
      vec3 grad = sign( det ) * ( dhx * r1 + dhy * r2 );
      normal = normalize( abs( det ) * normal - grad * 1.1 * tbFade );
    }
  }
`;

function cityTexture(city) {
  const N = city.N;
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = city.types[k];
    data[k * 4 + 1] = city.heightClass[k];
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createTerrainMaterial(mapDef, quality, map = null) {
  const pal = mapDef.palette;
  const col = (hex) => new THREE.Color(hex);
  const city = map && map.city;
  const uniforms = {
    uNoise: { value: getNoiseTexture() },
    uWaterLevel: { value: mapDef.water.level },
    uSnowLine: { value: mapDef.snowLine },
    uBeach: { value: mapDef.beach },
    uForest: { value: mapDef.forest },
    uFields: { value: mapDef.fields },
    uStrata: { value: mapDef.strata },
    uTreeLine: { value: (mapDef.trees?.maxAlt ?? 1500) + mapDef.water.level },
    uSand: { value: col(pal.sand) },
    uGrass1: { value: col(pal.grass1) },
    uGrass2: { value: col(pal.grass2) },
    uForestCol: { value: col(pal.forest) },
    uRock1: { value: col(pal.rock1) },
    uRock2: { value: col(pal.rock2) },
    uSnow: { value: col(pal.snow) },
    uDirt: { value: col(pal.dirt) },
    uFieldA: { value: col(pal.fieldA || '#c9b25c') },
    uFieldB: { value: col(pal.fieldB || '#7b5b3a') },
    uFieldC: { value: col(pal.fieldC || '#9bb84f') },
    uWaterDeep: { value: col(mapDef.water.shallow) },
    uAbsorb: { value: mapDef.water.absorb },
    uCityOn: { value: city ? 1 : 0 },
    uCityTex: { value: city ? cityTexture(city) : null },
    uCityOrigin: { value: new THREE.Vector2(city ? city.x0 : 0, city ? city.z0 : 0) },
    uCityCell: { value: new THREE.Vector2(city ? city.cell : 100, city ? city.street : 10) },
    uCityN: { value: city ? city.N : 1 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uRoads: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uRoadCount: { value: 0 },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvTPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvTNormal = objectNormal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + terrainShaderPars)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = terrainAlbedo();')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + terrainBump)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += tCityEmit;');
  };
  mat.customProgramCacheKey = () => 'terrain-v3';
  mat.userData.uniforms = uniforms;
  return mat;
}

// ---------------------------------------------------------------------------

const indexCache = new Map();

function getIndex(N) {
  if (indexCache.has(N)) return indexCache.get(N);
  const V = N + 1;
  const idx = [];
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const a = z * V + x, b = a + 1, c = a + V, d = c + 1;
      // alternate diagonal for nicer shading
      if ((x + z) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  // skirts: 4 edges, each with N quads joining edge vertex to skirt vertex
  const skirtBase = V * V;
  const edges = [];
  for (let i = 0; i <= N; i++) edges.push(i); // top edge z=0
  for (let i = 0; i <= N; i++) edges.push(i * V + N); // right x=N
  for (let i = 0; i <= N; i++) edges.push(N * V + (N - i)); // bottom z=N reversed
  for (let i = 0; i <= N; i++) edges.push((N - i) * V); // left x=0 reversed
  for (let e = 0; e < 4; e++) {
    for (let i = 0; i < N; i++) {
      const k = e * (N + 1) + i;
      const a = edges[k], b = edges[k + 1];
      const sa = skirtBase + k, sb = skirtBase + k + 1;
      idx.push(a, sa, b, b, sa, sb);
      idx.push(a, b, sa, b, sb, sa);
    }
  }
  const attr = new THREE.BufferAttribute(V * V + 4 * (N + 1) > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
  const out = { attr, edges };
  indexCache.set(N, out);
  return out;
}

export class Terrain {
  constructor(map, quality, scene) {
    this.map = map;
    this.scene = scene;
    this.N = quality.terrainSegments;
    this.lodFactor = quality.lodFactor;
    this.minSize = quality.minNodeSize;
    this.viewDistance = quality.viewDistance;
    this.budgetMs = quality.chunkBudgetMs;
    let root = this.minSize;
    this.maxLevel = 0;
    while (root < this.viewDistance / 1.4) {
      root *= 2;
      this.maxLevel++;
    }
    this.rootSize = root;
    this.material = createTerrainMaterial(map.def, quality, map);
    this.receiveShadow = quality.shadows;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.chunks = new Map();
    this.visible = new Set();
    this.requests = new Map();
    this.frame = 0;
    this._index = getIndex(this.N);
    this._heights = new Float32Array((this.N + 3) * (this.N + 3));
  }

  key(level, ix, iz) {
    return level + ':' + ix + ':' + iz;
  }

  nodeSize(level) {
    return this.rootSize / (1 << level);
  }

  buildChunk(level, ix, iz) {
    const N = this.N;
    const size = this.nodeSize(level);
    const x0 = ix * size, z0 = iz * size;
    const cx = x0 + size / 2, cz = z0 + size / 2;
    const step = size / N;
    const W = N + 3;
    const H = this._heights;
    const map = this.map;
    for (let j = 0; j < W; j++) {
      const z = z0 + (j - 1) * step;
      for (let i = 0; i < W; i++) {
        H[j * W + i] = map.heightAt(x0 + (i - 1) * step, z);
      }
    }
    const V = N + 1;
    const vertCount = V * V + 4 * V;
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    let minH = Infinity, maxH = -Infinity;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const hi = (j + 1) * W + (i + 1);
        const h = H[hi];
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        const o = (j * V + i) * 3;
        pos[o] = x0 + i * step - cx;
        pos[o + 1] = h;
        pos[o + 2] = z0 + j * step - cz;
        const nx = H[hi - 1] - H[hi + 1];
        const nz = H[hi - W] - H[hi + W];
        const ny = 2 * step;
        const l = Math.hypot(nx, ny, nz);
        nor[o] = nx / l;
        nor[o + 1] = ny / l;
        nor[o + 2] = nz / l;
      }
    }
    const skirt = Math.max(15, size * 0.015);
    const edges = this._index.edges;
    for (let k = 0; k < 4 * V; k++) {
      const src = edges[k] * 3;
      const o = (V * V + k) * 3;
      pos[o] = pos[src];
      pos[o + 1] = pos[src + 1] - skirt;
      pos[o + 2] = pos[src + 2];
      nor[o] = nor[src];
      nor[o + 1] = nor[src + 1];
      nor[o + 2] = nor[src + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(this._index.attr);
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(-size / 2, minH - skirt, -size / 2),
      new THREE.Vector3(size / 2, maxH, size / 2),
    );
    geo.boundingSphere = new THREE.Sphere();
    geo.boundingBox.getBoundingSphere(geo.boundingSphere);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx, 0, cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = this.receiveShadow;
    mesh.visible = false;
    this.group.add(mesh);
    return { mesh, minH, maxH, lastUsed: this.frame };
  }

  _dist(level, ix, iz, cam, chunk) {
    const size = this.nodeSize(level);
    const x0 = ix * size, z0 = iz * size;
    const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + size));
    const dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + size));
    let dy = 0;
    if (chunk) dy = Math.max(chunk.minH - cam.y, 0, cam.y - chunk.maxH);
    else dy = Math.max(0, cam.y - 1500);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _request(level, ix, iz, priority) {
    const k = this.key(level, ix, iz);
    const r = this.requests.get(k);
    if (!r || r.priority > priority) this.requests.set(k, { level, ix, iz, priority });
  }

  _visit(level, ix, iz, cam, drawList) {
    const k = this.key(level, ix, iz);
    const chunk = this.chunks.get(k);
    const size = this.nodeSize(level);
    const d = this._dist(level, ix, iz, cam, chunk);
    if (level < this.maxLevel && d < size * this.lodFactor && chunk) {
      let ready = true;
      for (let c = 0; c < 4; c++) {
        const cx = ix * 2 + (c & 1), cz = iz * 2 + (c >> 1);
        if (!this.chunks.has(this.key(level + 1, cx, cz))) {
          ready = false;
          this._request(level + 1, cx, cz, d);
        }
      }
      if (ready) {
        for (let c = 0; c < 4; c++) this._visit(level + 1, ix * 2 + (c & 1), iz * 2 + (c >> 1), cam, drawList);
        return;
      }
    }
    if (chunk) {
      chunk.lastUsed = this.frame;
      drawList.push(chunk.mesh);
    } else {
      this._request(level, ix, iz, level === 0 ? -1 : d);
    }
  }

  update(cam, force = false) {
    this.frame++;
    const drawList = [];
    const R = this.rootSize;
    const reach = this.viewDistance + R * 0.5;
    const i0 = Math.floor((cam.x - reach) / R), i1 = Math.floor((cam.x + reach) / R);
    const k0 = Math.floor((cam.z - reach) / R), k1 = Math.floor((cam.z + reach) / R);
    for (let iz = k0; iz <= k1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const d = this._dist(0, ix, iz, cam, null);
        if (d > this.viewDistance) continue;
        this._visit(0, ix, iz, cam, drawList);
      }
    }
    // Swap visibility
    const nextVisible = new Set(drawList);
    for (const m of this.visible) if (!nextVisible.has(m)) m.visible = false;
    for (const m of nextVisible) m.visible = true;
    this.visible = nextVisible;

    // Generate requested chunks within the time budget (closest first)
    let built = 0;
    if (this.requests.size) {
      const list = [...this.requests.values()].sort((a, b) => a.priority - b.priority);
      const t0 = performance.now();
      const budget = force ? 1e9 : this.budgetMs;
      for (const r of list) {
        const k = this.key(r.level, r.ix, r.iz);
        if (!this.chunks.has(k)) {
          this.chunks.set(k, this.buildChunk(r.level, r.ix, r.iz));
          built++;
        }
        this.requests.delete(k);
        if (performance.now() - t0 > budget) break;
      }
      // stale requests are re-issued next frame if still needed
      this.requests.clear();
    }
    this._evict();
    return built;
  }

  // Pre-generate everything needed around a position (loading screen).
  warmup(cam, maxIterations = 40) {
    for (let i = 0; i < maxIterations; i++) {
      if (this.update(cam, true) === 0) break;
    }
    this.update(cam, true);
  }

  _evict() {
    const max = 900;
    if (this.chunks.size <= max) return;
    const entries = [...this.chunks.entries()].filter(([, c]) => !c.mesh.visible);
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    const remove = this.chunks.size - max + 100;
    for (let i = 0; i < remove && i < entries.length; i++) {
      const [k, c] = entries[i];
      if (k.startsWith('0:')) continue;
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      this.chunks.delete(k);
    }
  }

  dispose() {
    for (const c of this.chunks.values()) c.mesh.geometry.dispose();
    this.chunks.clear();
    this.material.userData.uniforms.uCityTex.value?.dispose();
    this.material.dispose();
    this.scene.remove(this.group);
  }
}
