// City rendering: every building is an instance of a box, round or hexagonal
// prism shaded by a procedural facade shader (curtain-wall glass, ribbon
// windows, punched windows, lit offices at night). Landmarks, a suspension
// bridge, harbour cranes, container stacks and blinking aviation lights are
// added on top. Layout data comes from cityLayout.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STYLE, SHAPE } from './cityLayout.js';
import { getGlowTexture } from '../aircraft/jetTextures.js';
import { mulberry32 } from './noise.js';

const facadeCommon = /* glsl */ `
  uniform float uNight;
  varying vec3 vBPos;
  varying vec3 vBNrm;
  varying vec4 vInfo;
  varying vec3 vBScale;
  vec3 gAlbedo;
  float gRough;
  float gMetal;
  vec3 gEmit;
  float fHash( vec2 p ) {
    p = fract( p * vec2( 123.34, 456.21 ) );
    p += dot( p, p + 45.32 );
    return fract( p.x * p.y );
  }
  float winMask( float x, float a, float b, float w ) {
    return smoothstep( a - w, a + w, x ) * ( 1.0 - smoothstep( b - w, b + w, x ) );
  }
  void facade( vec3 tint ) {
    float style = vInfo.x, seed = vInfo.y, lit = vInfo.z, shape = vInfo.w;
    vec3 n = normalize( vBNrm );
    float H = vBScale.y;
    float y = vBPos.y;
    gEmit = vec3( 0.0 );
    if ( n.y > 0.5 ) {
      // roofs: membrane or gravel with plant blocks, skylights and gravel
      // patches; light-grey helipad decks on the big towers
      vec2 rp = vBPos.xz;
      float r = fHash( floor( rp * 0.2 ) + seed * 31.0 );
      float r2 = fHash( floor( rp * 0.06 ) + seed * 7.0 );
      vec3 membrane = mix( vec3( 0.2, 0.2, 0.21 ), vec3( 0.42, 0.41, 0.39 ), step( 0.5, fract( seed * 5.3 ) ) );
      gAlbedo = membrane * ( 0.82 + 0.3 * r ) * ( 0.9 + 0.2 * r2 );
      // parapet edge
      vec2 e = 0.5 * vBScale.xz - abs( rp );
      float edge = 1.0 - smoothstep( 0.4, 0.9, min( e.x, e.y ) );
      gAlbedo = mix( gAlbedo, tint * 0.7, edge * step( shape, 0.5 ) );
      if ( H > 140.0 ) {
        float pad = 1.0 - smoothstep( 6.0, 6.6, length( rp ) );
        float ring = smoothstep( 5.3, 5.6, length( rp ) ) * pad;
        gAlbedo = mix( gAlbedo, vec3( 0.5, 0.52, 0.5 ), pad * 0.8 );
        gAlbedo = mix( gAlbedo, vec3( 0.85, 0.75, 0.2 ), ring );
      }
      gRough = 0.9;
      gMetal = 0.05;
      if ( uNight > 0.01 && H > 120.0 ) gEmit = vec3( 1.0, 0.25, 0.15 ) * uNight * 0.15 * step( 0.85, r );
      return;
    }
    if ( n.y < -0.5 ) { gAlbedo = vec3( 0.1 ); gRough = 1.0; gMetal = 0.0; return; }
    float hc;
    float face = 0.0;
    float halfW = 1.0;
    if ( shape < 0.5 ) {
      hc = abs( n.x ) > 0.5 ? vBPos.z : vBPos.x;
      halfW = 0.5 * ( abs( n.x ) > 0.5 ? vBScale.z : vBScale.x );
      face = n.x > 0.5 ? 1.0 : n.x < -0.5 ? 2.0 : n.z > 0.5 ? 3.0 : 4.0;
    } else {
      hc = atan( vBPos.z, vBPos.x ) * max( 0.5 * vBScale.x, 1.0 );
      halfW = 1e4;
    }
    bool euro = style > 5.5;
    bool glass = style < 0.5 || ( style > 3.5 && style < 4.5 );
    float floorH = glass ? 3.9 : euro ? 3.5 : style < 2.5 && style > 1.5 ? 3.1 : 3.6;
    float colW = ( euro ? 3.2 : style > 1.5 && style < 2.5 ? 3.3 : 2.7 ) + fract( seed * 7.13 ) * ( euro ? 0.6 : 1.6 );
    vec2 g = vec2( hc / colW + face * 17.0, y / floorH );
    vec2 f = fract( g );
    vec2 id = floor( g );
    vec2 fw = fwidth( g );
    float detail = 1.0 - smoothstep( 0.3, 0.85, max( fw.x, fw.y ) );
    float win, avg;
    float frame = 0.0;
    if ( glass ) {
      win = winMask( f.x, 0.04, 0.96, fw.x ) * winMask( f.y, 0.07, 0.93, fw.y );
      // mullion splitting each bay and a transom near the floor line
      frame = winMask( abs( f.x - 0.5 ), -1.0, 0.012, fw.x ) + winMask( f.y, 0.18, 0.2, fw.y );
      avg = 0.82;
    }
    else if ( style < 1.5 ) { win = winMask( f.y, 0.3, 0.84, fw.y ) * winMask( f.x, 0.02, 0.98, fw.x ); frame = winMask( abs( fract( g.x * 2.0 ) - 0.5 ), -1.0, 0.03, fw.x * 2.0 ) * win; avg = 0.52; }
    else if ( style < 2.5 ) { win = winMask( f.x, 0.27, 0.73, fw.x ) * winMask( f.y, 0.3, 0.78, fw.y ); frame = winMask( abs( f.x - 0.5 ), -1.0, 0.015, fw.x ) * win; avg = 0.22; }
    else if ( style < 3.5 ) { win = winMask( f.x, 0.22, 0.78, fw.x ) * winMask( f.y, 0.03, 0.97, fw.y ); avg = 0.55; }
    else if ( euro ) {
      // tall punched windows with frames and a cornice line at every floor
      win = winMask( f.x, 0.31, 0.69, fw.x ) * winMask( f.y, 0.2, 0.84, fw.y );
      frame = ( winMask( abs( f.x - 0.5 ), -1.0, 0.012, fw.x ) + winMask( f.y, 0.55, 0.57, fw.y ) ) * win;
      avg = 0.18;
    }
    else { win = winMask( f.y, 0.62, 0.8, fw.y ) * step( 0.5, fract( id.x * 0.25 ) ); avg = 0.08; }
    frame = clamp( frame, 0.0, 1.0 ) * detail;
    win = mix( avg, win, detail );
    float shop = ( euro || style > 0.5 && style < 2.5 ) ? 1.0 - smoothstep( 4.3, 4.6, y ) : 0.0;
    float lobby = ( 1.0 - smoothstep( 4.5, 5.5, y ) ) * ( 1.0 - shop );
    float crown = step( 100.0, H ) * smoothstep( H - 8.0, H - 6.0, y );
    float parapet = smoothstep( H - 1.1, H - 0.9, y ) * ( 1.0 - step( 100.0, H ) );
    float wv = fHash( id + seed * 13.1 );
    vec3 glassCol = style > 3.5 && style < 4.5 ? vec3( 0.42, 0.3, 0.12 ) : glass ? tint * 0.42 : vec3( 0.06, 0.08, 0.1 );
    vec3 wall = glass ? vec3( 0.38, 0.4, 0.42 ) : tint;
    // storey banding / cornices on solid facades
    wall *= 0.92 + 0.08 * step( 0.9, f.y );
    if ( euro ) wall *= 1.0 + 0.12 * winMask( f.y, 0.9, 0.98, fw.y ) * detail - 0.1 * winMask( f.y, 0.85, 0.9, fw.y ) * detail;
    // rain streaks under the windows and grime washing down the facade
    float streak = fHash( vec2( floor( g.x * 3.0 ), seed ) ) * smoothstep( 0.2, 0.0, f.y ) * ( 1.0 - win );
    float grime = 0.5 + 0.5 * sin( hc * 0.7 + seed * 40.0 ) * sin( hc * 0.23 + y * 0.05 );
    wall *= 1.0 - 0.07 * streak * detail - ( glass ? 0.0 : 0.06 * grime );
    // curtains and blinds: some panes lighter, some darker
    float blind = step( 0.72, fHash( id * vec2( 2.3, 1.1 ) + seed * 3.0 ) );
    vec3 winCol = glassCol * ( 0.7 + 0.6 * wv ) + vec3( 0.18, 0.17, 0.15 ) * blind * ( glass ? 0.4 : 1.0 );
    gAlbedo = mix( wall, winCol, max( win, lobby * 0.8 ) );
    gAlbedo = mix( gAlbedo, vec3( 0.16, 0.17, 0.18 ), frame * 0.9 );
    // ground-floor shop fronts with awnings in the street colours
    if ( shop > 0.0 ) {
      float bay = fract( hc / 6.0 + seed );
      float sw = winMask( bay, 0.08, 0.92, fw.x * 0.4 ) * winMask( y, 0.5, 3.4, 0.05 );
      vec3 awn = mix( vec3( 0.55, 0.12, 0.1 ), vec3( 0.1, 0.32, 0.22 ), step( 0.5, fHash( vec2( floor( hc / 6.0 ), seed ) ) ) );
      vec3 sf = mix( wall * 0.8, vec3( 0.05, 0.06, 0.07 ), sw );
      sf = mix( sf, awn, winMask( y, 3.5, 4.1, 0.05 ) * step( 0.35, fHash( vec2( floor( hc / 6.0 ) + 3.0, seed ) ) ) );
      gAlbedo = mix( gAlbedo, sf, shop );
      win = max( win * ( 1.0 - shop ), sw * shop );
    }
    // contact shadow at street level and ambient occlusion in the corners
    gAlbedo *= mix( 0.55, 1.0, smoothstep( 0.0, 14.0, y ) );
    gAlbedo *= mix( 0.72, 1.0, smoothstep( 0.0, 1.6, halfW - abs( hc ) ) );
    gAlbedo = mix( gAlbedo, vec3( 0.75 ), crown * 0.5 );
    gAlbedo = mix( gAlbedo, wall * 1.08, parapet );
    gRough = mix( glass ? 0.32 : 0.86, 0.07 + wv * 0.1, win );
    gMetal = mix( glass ? 0.6 : 0.04, 0.88, win );
    if ( uNight > 0.01 ) {
      // only a fraction of the offices are still lit at night
      float on = step( 1.0 - lit * 0.5, fHash( id * vec2( 1.7, 3.1 ) + seed * 57.0 + face * 3.3 ) );
      vec3 warm = mix( vec3( 1.0, 0.72, 0.42 ), vec3( 0.78, 0.9, 1.0 ), step( 0.7, fHash( id + 9.1 + seed ) ) );
      float level = 0.55 + 0.9 * fHash( id.yx + seed );
      vec3 e = warm * on * level * win * ( 1.0 - frame );
      e = mix( vec3( 1.0, 0.8, 0.55 ) * lit * 0.5 * avg * 0.7, e, detail );
      e += vec3( 1.0, 0.85, 0.62 ) * ( lobby * 0.5 + shop * win * 0.9 ) + mix( vec3( 0.9, 0.95, 1.0 ), vec3( 0.4, 0.75, 1.0 ), fract( seed * 3.7 ) ) * crown * 1.1;
      // lights fade in with darkness so dusk is not washed out
      gEmit = e * uNight * uNight * 0.9;
    }
  }
`;

function createFacadeMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aInfo;
        varying vec3 vBPos;
        varying vec3 vBNrm;
        varying vec4 vInfo;
        varying vec3 vBScale;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 bScale = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
        vBPos = position * bScale;
        vBNrm = normal;
        vInfo = aInfo;
        vBScale = bScale;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + facadeCommon)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfacade( vColor );\ndiffuseColor.rgb = gAlbedo;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit;');
  };
  mat.customProgramCacheKey = () => 'facade-v2';
  return mat;
}

function prism(kind) {
  let g;
  if (kind === SHAPE.ROUND) g = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1);
  else if (kind === SHAPE.HEX) g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  else g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

export class CityRenderer {
  constructor(layout, quality, scene) {
    this.layout = layout;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'city';
    this.uniforms = { uNight: { value: 0 } };
    this.facade = createFacadeMaterial(this.uniforms);
    this.materials = [this.facade];
    this.time = 0;
    const shadows = quality.shadows;
    const low = quality.trees === 0;

    // gather building instances (low quality drops some small buildings)
    const list = [];
    for (const b of layout.buildings) {
      if (low && b.h < 22 && (b.seed * 10) % 1 < 0.55) continue;
      list.push(b);
    }
    // landmark tiers reuse the same instanced prisms so they get windows too
    const extraSpires = [];
    for (const lm of layout.landmarks) {
      if (lm.type === 'supertall') {
        const tiers = [[68, 0.32], [56, 0.55], [42, 0.76], [26, 0.9], [14, 0.97]];
        for (const [w, f] of tiers) list.push({ x: lm.x, z: lm.z, y0: lm.y0, w, d: w, h: lm.h * f, style: STYLE.GULF, shape: SHAPE.HEX, seed: 0.37, lit: 0.7, tint: [0.82, 0.86, 0.9] });
        extraSpires.push({ x: lm.x, z: lm.z, y: lm.y0 + lm.h * 0.97, h: lm.h * 0.06, r: 2.4 });
      } else if (lm.type === 'twin') {
        for (const s of [-1, 1]) {
          const x = lm.x + s * 40;
          for (const [w, f] of [[44, 0.62], [36, 0.82], [26, 0.94]]) list.push({ x, z: lm.z, y0: lm.y0, w, d: w, h: lm.h * f, style: STYLE.GLASS, shape: SHAPE.ROUND, seed: 0.61, lit: 0.75, tint: [0.62, 0.68, 0.74] });
          extraSpires.push({ x, z: lm.z, y: lm.y0 + lm.h * 0.94, h: lm.h * 0.12, r: 2.0 });
        }
        list.push({ x: lm.x, z: lm.z, y0: lm.y0 + lm.h * 0.4, w: 40, d: 9, h: lm.h * 0.03, style: STYLE.GLASS, shape: SHAPE.BOX, seed: 0.2, lit: 0.9, tint: [0.6, 0.66, 0.7] });
      }
    }
    this.count = list.length;
    // Tall buildings (the skyline) are always drawn; low-rise blocks are split
    // into tiles that are only drawn near the camera, where they matter.
    const tall = [[], [], []];
    const tiles = new Map();
    const T = 1600;
    for (const b of list) {
      const shape = b.shape || 0;
      if (b.h >= 45 || shape !== SHAPE.BOX) tall[shape].push(b);
      else {
        const key = Math.floor(b.x / T) + ',' + Math.floor(b.z / T);
        let t = tiles.get(key);
        if (!t) tiles.set(key, (t = { cx: (Math.floor(b.x / T) + 0.5) * T, cz: (Math.floor(b.z / T) + 0.5) * T, list: [] }));
        t.list.push(b);
      }
    }
    this.meshes = [];
    tall.forEach((arr, shape) => {
      if (arr.length) this.meshes.push(this._instances(arr, shape, false));
    });
    this._roofMaterials();
    this.tiles = [...tiles.values()].map((t) => {
      const extra = [this._roofs(t.list, shadows), this._roofUnits(t.list)].filter(Boolean);
      return { ...t, mesh: this._instances(t.list, SHAPE.BOX, shadows), extra };
    });
    // rooftop plant on the always-drawn skyline
    const tallUnits = this._roofUnits(tall[SHAPE.BOX]);
    void tallUnits;
    this.drawDist = quality.viewDistance >= 50000 ? 9000 : quality.viewDistance >= 40000 ? 6500 : quality.viewDistance >= 32000 ? 5000 : 3600;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();

    // spires and antennas
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, roughness: 0.3, metalness: 0.9 });
    this.materials.push(spireMat);
    const spires = [...layout.spires.map((s) => ({ ...s, r: 1.4 })), ...extraSpires];
    if (spires.length) {
      const cone = new THREE.ConeGeometry(1, 1, 8);
      cone.translate(0, 0.5, 0);
      const sm = new THREE.InstancedMesh(cone, spireMat, spires.length);
      spires.forEach((s, i) => {
        m4.compose(pos.set(s.x, s.y, s.z), q, scl.set(s.r, s.h, s.r));
        sm.setMatrixAt(i, m4);
      });
      sm.computeBoundingSphere();
      this.group.add(sm);
    }

    // aviation obstruction lights on everything tall (one draw call of points)
    const lights = [];
    for (const b of list) if (b.h > 110) lights.push(b.x, b.y0 + b.h + 1.5, b.z);
    for (const s of spires) lights.push(s.x, s.y + s.h, s.z);
    for (const lm of layout.landmarks) if (lm.type === 'needle') lights.push(lm.x, lm.y0 + lm.h, lm.z);
    if (layout.bridge) for (const tx of layout.bridge.towers) lights.push(tx, layout.bridge.deckY + layout.bridge.towerH + 1, layout.bridge.z);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    this.aviationMat = new THREE.PointsMaterial({ color: new THREE.Color(4, 0.35, 0.2), size: 9, map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.materials.push(this.aviationMat);
    this.aviation = new THREE.Points(lg, this.aviationMat);
    this.aviation.frustumCulled = false;
    this.group.add(this.aviation);

    this._containers(layout, shadows);
    this._cranes(layout);
    this._landmarks(layout, shadows);
    if (layout.bridge) this._bridge(layout.bridge, shadows);
    for (const b of layout.arches || []) this._archBridge(b, shadows);
    this._traffic(layout, quality);
    scene.add(this.group);
  }

  _instances(arr, shape, receive) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const col = new THREE.Color();
    const geo = prism(shape);
    const info = new Float32Array(arr.length * 4);
    const mesh = new THREE.InstancedMesh(geo, this.facade, arr.length);
    arr.forEach((b, i) => {
      pos.set(b.x, b.y0, b.z);
      scl.set(b.w, b.h, b.d);
      m4.compose(pos, q, scl);
      mesh.setMatrixAt(i, m4);
      col.setRGB(b.tint[0], b.tint[1], b.tint[2]);
      mesh.setColorAt(i, col);
      info.set([b.style, b.seed, b.lit, shape], i * 4);
    });
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    // a city's worth of shadow casters would swamp the small sun shadow map
    mesh.castShadow = false;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  _containers(layout, shadows) {
    if (!layout.containers.length) return;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 0; x < 64; x += 4) ctx.fillRect(x, 0, 2, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 });
    this.materials.push(mat);
    this.containerTex = tex;
    const geo = new THREE.BoxGeometry(12.2, 2.55, 2.44);
    geo.translate(0, 1.28, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, layout.containers.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    layout.containers.forEach((k, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, k.rot ? Math.PI / 2 : 0);
      m4.compose(p.set(k.x, k.y, k.z), q, s);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setRGB(k.color[0], k.color[1], k.color[2]));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = shadows;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    this.containerMesh = mesh;
    let sx = 0, sz = 0;
    for (const k of layout.containers) { sx += k.x; sz += k.z; }
    this.portX = sx / layout.containers.length;
    this.portZ = sz / layout.containers.length;
  }

  _cranes(layout) {
    if (!layout.cranes.length) return;
    const parts = [];
    const box = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      return g.toNonIndexed();
    };
    for (const k of layout.cranes) {
      const g = [];
      for (const sx of [-8, 8]) for (const sz of [-6, 6]) g.push(box(1.4, k.h, 1.4, sx, k.h / 2, sz));
      g.push(box(18, 2.5, 14, 0, k.h, 0));
      g.push(box(2.2, 2.2, 75, 0, k.h + 6, 12));
      g.push(box(5, 5, 7, 0, k.h + 3, -8));
      for (const gg of g) {
        gg.rotateY(k.rot);
        gg.translate(k.x, k.y, k.z);
        parts.push(gg);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8502a, roughness: 0.6, metalness: 0.4 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.geometry.computeVertexNormals();
    this.group.add(mesh);
  }

  _landmarks(layout, shadows) {
    const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.75, metalness: 0.05 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.25, metalness: 0.9 });
    this.podGlow = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.8, emissive: new THREE.Color(1.0, 0.75, 0.45), emissiveIntensity: 0 });
    this.materials.push(concrete, metal, this.podGlow);
    for (const lm of layout.landmarks) {
      if (lm.type === 'needle') {
        const g = new THREE.Group();
        g.position.set(lm.x, lm.y0, lm.z);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 10, lm.h * 0.92, 12), concrete);
        shaft.position.y = lm.h * 0.46;
        const podY = lm.h * 0.8;
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(26, 20, lm.h * 0.05, 32), this.podGlow);
        pod.position.y = podY;
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 2.5, 32), concrete);
        deck.position.y = podY + lm.h * 0.03;
        const sky = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 10), this.podGlow);
        sky.position.y = lm.h * 0.9;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, lm.h * 0.12, 8), metal);
        mast.position.y = lm.h * 0.94;
        for (const m of [shaft, pod, deck, sky, mast]) {
          m.castShadow = shadows;
          g.add(m);
        }
        this.group.add(g);
      } else if (lm.type === 'dome') {
        // cathedral: stone drum and nave, a copper-green dome with its lantern and two west towers
        const g = new THREE.Group();
        g.position.set(lm.x, lm.y0, lm.z);
        const stone = new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.85 });
        const copper = new THREE.MeshStandardMaterial({ color: 0x5e8f7c, roughness: 0.55, metalness: 0.35 });
        const gold = new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.3, metalness: 0.9 });
        this.materials.push(stone, copper, gold);
        const r = lm.r;
        const nave = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, lm.h * 0.32, r * 3.4), stone);
        nave.position.set(0, lm.h * 0.16, r * 0.9);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, r * 3.4, 3, 1), copper);
        roof.rotation.x = Math.PI / 2;
        roof.rotation.y = Math.PI;
        roof.scale.set(1, 1, 0.45);
        roof.position.set(0, lm.h * 0.32 + r * 0.14, r * 0.9);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.66, lm.h * 0.24, 32), stone);
        drum.position.y = lm.h * 0.43;
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.64, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), copper);
        dome.scale.y = 1.25;
        dome.position.y = lm.h * 0.55;
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.12, lm.h * 0.1, 12), stone);
        lantern.position.y = lm.h * 0.55 + r * 0.8 + lm.h * 0.05;
        const cross = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, lm.h * 0.08, 8), gold);
        cross.position.y = lantern.position.y + lm.h * 0.09;
        g.add(nave, roof, drum, dome, lantern, cross);
        for (const s of [-1, 1]) {
          const tw = new THREE.Mesh(new THREE.BoxGeometry(r * 0.32, lm.h * 0.62, r * 0.32), stone);
          tw.position.set(s * r * 0.5, lm.h * 0.31, r * 2.55);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, lm.h * 0.16, 4), copper);
          sp.position.set(s * r * 0.5, lm.h * 0.7, r * 2.55);
          sp.rotation.y = Math.PI / 4;
          g.add(tw, sp);
        }
        g.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
        this.group.add(g);
      } else if (lm.type === 'stadium') {
        const g = new THREE.Group();
        g.position.set(lm.x, lm.y0, lm.z);
        const prof = [new THREE.Vector2(lm.r * 0.55, 0), new THREE.Vector2(lm.r * 0.62, 2), new THREE.Vector2(lm.r * 0.98, lm.h * 0.85), new THREE.Vector2(lm.r, lm.h), new THREE.Vector2(lm.r * 1.02, 0)];
        const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), concrete);
        bowl.scale.z = 0.8;
        bowl.material.side = THREE.DoubleSide;
        const roof = new THREE.Mesh(new THREE.TorusGeometry(lm.r * 0.9, lm.r * 0.12, 6, 48), metal);
        roof.rotation.x = Math.PI / 2;
        roof.scale.y = 0.8;
        roof.position.y = lm.h;
        const pitchMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9, emissive: new THREE.Color(0.2, 0.3, 0.2), emissiveIntensity: 0 });
        this.materials.push(pitchMat);
        this.pitchMat = pitchMat;
        const pitch = new THREE.Mesh(new THREE.PlaneGeometry(lm.r * 0.9, lm.r * 0.6), pitchMat);
        pitch.rotation.x = -Math.PI / 2;
        pitch.position.y = 0.5;
        for (const m of [bowl, roof, pitch]) {
          m.castShadow = shadows;
          m.receiveShadow = shadows;
          g.add(m);
        }
        this.group.add(g);
      }
    }
  }

  _bridge(b, shadows) {
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xb4432b, roughness: 0.6, metalness: 0.3 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x5b5d60, roughness: 0.85, metalness: 0.2 });
    this.materials.push(towerMat, deckMat);
    const g = new THREE.Group();
    const len = b.x1 - b.x0;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 3.5, 28), deckMat);
    deck.position.set((b.x0 + b.x1) / 2, b.deckY - 1.75, b.z);
    g.add(deck);
    const tops = [];
    for (const tx of b.towers) {
      for (const sz of [-13, 13]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(7, b.deckY + b.towerH, 6), towerMat);
        leg.position.set(tx, (b.deckY + b.towerH) / 2 - 2, b.z + sz);
        g.add(leg);
      }
      for (const f of [0.55, 0.85, 1.0]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 26), towerMat);
        beam.position.set(tx, b.deckY + b.towerH * f - 3, b.z);
        g.add(beam);
      }
      tops.push(tx);
    }
    // main cables: catenaries between the towers and down to the anchorages
    const cablePts = [];
    const topY = b.deckY + b.towerH - 2;
    const sag = (t) => 4 * t * (1 - t);
    for (const sz of [-13, 13]) {
      const pts = [];
      pts.push(new THREE.Vector3(b.x0, b.deckY + 2, b.z + sz));
      pts.push(new THREE.Vector3(tops[0], topY, b.z + sz));
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(tops[0] + (tops[1] - tops[0]) * t, topY - sag(t) * (b.towerH - 8), b.z + sz));
      }
      pts.push(new THREE.Vector3(tops[1], topY, b.z + sz));
      pts.push(new THREE.Vector3(b.x1, b.deckY + 2, b.z + sz));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.9, 6, false), towerMat);
      g.add(tube);
      // vertical suspenders
      for (let x = tops[0] + 15; x < tops[1] - 5; x += 15) {
        const t = (x - tops[0]) / (tops[1] - tops[0]);
        cablePts.push(x, b.deckY, b.z + sz, x, topY - sag(t) * (b.towerH - 8), b.z + sz);
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7a3022 });
    this.materials.push(lineMat);
    g.add(new THREE.LineSegments(lineGeo, lineMat));
    // deck lights for the night
    const lp = [];
    for (let x = b.x0; x <= b.x1; x += 24) for (const sz of [-14, 14]) lp.push(x, b.deckY + 3, b.z + sz);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.bridgeLightMat = new THREE.PointsMaterial({ color: new THREE.Color(2.5, 1.9, 1.1), size: 5, map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.materials.push(this.bridgeLightMat);
    const pts = new THREE.Points(lg, this.bridgeLightMat);
    pts.frustumCulled = false;
    g.add(pts);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    this.group.add(g);
  }

  // ---------------------------------------------------------------- roofs
  _roofMaterials() {
    // clay tiles / slate: rows of tiles with staggered joints, tinted per house
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 16; row++) {
      const y = row * 8;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, y + 6, 128, 2);
      for (let x = (row % 2) * 8; x < 128; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(x, y, 1, 8);
        ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${(Math.random() * 0.08).toFixed(3)})`;
        ctx.fillRect(x + 1, y, 15, 6);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    this.roofTex = tex;
    this.roofMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.02 });
    this.unitMat = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.55, metalness: 0.45 });
    this.materials.push(this.roofMat, this.unitMat);
    // gable prism: base 1 x 1 at y = 0, ridge along z at y = 1
    const P = [
      [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5],
      [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 1, 0.5],
      [-0.5, 0, 0.5], [-0.5, 0, -0.5], [0, 1, -0.5], [-0.5, 0, 0.5], [0, 1, -0.5], [0, 1, 0.5],
      [0.5, 0, -0.5], [0.5, 0, 0.5], [0, 1, 0.5], [0.5, 0, -0.5], [0, 1, 0.5], [0, 1, -0.5],
    ];
    const U = [
      [0, 0], [1, 0], [0.5, 0.6], [0, 0], [1, 0], [0.5, 0.6],
      [0, 0], [3, 0], [3, 2], [0, 0], [3, 2], [0, 2],
      [0, 0], [3, 0], [3, 2], [0, 0], [3, 2], [0, 2],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U.flat(), 2));
    g.computeVertexNormals();
    this.gableGeo = g;
  }

  // pitched tile or slate roofs on the low-rise houses that want one
  _roofs(list, shadows) {
    const roofs = list.filter((b) => b.roof);
    if (!roofs.length) return null;
    const mesh = new THREE.InstancedMesh(this.gableGeo, this.roofMat, roofs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    roofs.forEach((b, i) => {
      const alongX = b.w > b.d;
      q.setFromAxisAngle(up, alongX ? Math.PI / 2 : 0);
      const span = alongX ? b.d : b.w, len = alongX ? b.w : b.d;
      const rh = THREE.MathUtils.clamp(span * 0.38, 2.2, 7.5);
      m4.compose(p.set(b.x, b.y0 + b.h, b.z), q, s.set(span + 0.6, rh, len + 0.4));
      mesh.setMatrixAt(i, m4);
      const k = (b.seed * 97.3) % 1;
      // terracotta, weathered clay, slate grey, dark zinc
      if (k < 0.45) col.setRGB(0.55 + k * 0.2, 0.25 + k * 0.1, 0.15);
      else if (k < 0.65) col.setRGB(0.48, 0.32, 0.24);
      else if (k < 0.88) col.setRGB(0.27, 0.29, 0.32);
      else col.setRGB(0.4, 0.43, 0.45);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = shadows;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  // air-handling units, lift rooms and water tanks on flat roofs
  _roofUnits(list) {
    const flat = list.filter((b) => !b.roof && b.h > 12 && b.w > 14 && b.d > 14 && (b.shape || 0) === SHAPE.BOX && b.style !== STYLE.WAREHOUSE);
    if (!flat.length) return null;
    const boxes = [];
    for (const b of flat) {
      const n = 1 + Math.floor(((b.seed * 31.7) % 1) * 3);
      for (let i = 0; i < n; i++) {
        const k = (b.seed * (13.1 + i * 7.7)) % 1, k2 = (b.seed * (5.3 + i * 3.1)) % 1;
        const w = 2 + k * 4, d = 2 + k2 * 3, h = 1.4 + k * 2.2;
        boxes.push({ x: b.x + (k - 0.5) * (b.w - w - 3), z: b.z + (k2 - 0.5) * (b.d - d - 3), y: b.y0 + b.h, w, d, h });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, this.unitMat, boxes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    boxes.forEach((u, i) => mesh.setMatrixAt(i, m4.compose(p.set(u.x, u.y, u.z), q, s.set(u.w, u.h, u.d))));
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- traffic
  // Cars on every street, animated entirely on the GPU: each instance runs
  // up and down its stretch of road in its lane; head and tail lights at night.
  _traffic(layout, quality) {
    const budget = quality.trees === 0 ? 1200 : quality.trees < 1 ? 3000 : quality.trees < 1.5 ? 6000 : 9000;
    const N = layout.N, cell = layout.cell, types = layout.types;
    const road = (i, j) => i >= 0 && j >= 0 && i < N && j < N && types[j * N + i] > 0;
    const runs = [];
    // street centre lines lie on the cell boundaries
    for (const axis of [0, 1]) {
      for (let a = 1; a < N; a++) {
        let start = -1;
        for (let b = 0; b <= N; b++) {
          const on = b < N && (axis === 0 ? road(a - 1, b) || road(a, b) : road(b, a - 1) || road(b, a));
          if (on && start < 0) start = b;
          if ((!on || b - start >= 8) && start >= 0) {
            if (b - start >= 2) runs.push({ axis, a, b0: start, b1: b });
            start = on ? b : -1;
          }
        }
      }
    }
    if (!runs.length) return;
    const rand = mulberry32(layout.def.seed * 3 + 11);
    const cars = [];
    const map = layout.map;
    for (const r of runs) {
      const len = (r.b1 - r.b0) * cell;
      const line = (r.axis === 0 ? layout.x0 : layout.z0) + r.a * cell;
      const s0 = (r.axis === 0 ? layout.z0 : layout.x0) + r.b0 * cell;
      const mid = s0 + len / 2;
      const dens = 0.55 + Math.min(1.2, layout._density(r.axis === 0 ? line : mid, r.axis === 0 ? mid : line) / 200);
      for (const dir of [1, -1]) {
        const n = Math.max(1, Math.round((len / 60) * dens * (0.6 + rand() * 0.8)));
        for (let k = 0; k < n; k++) {
          const x0 = r.axis === 0 ? line : dir > 0 ? s0 : s0 + len;
          const z0 = r.axis === 0 ? (dir > 0 ? s0 : s0 + len) : line;
          const dx = r.axis === 0 ? 0 : dir, dz = r.axis === 0 ? dir : 0;
          const y0 = map.base(x0, z0), y1 = map.base(x0 + dx * len, z0 + dz * len);
          cars.push([x0, z0, dx, dz, len, rand(), (7 + rand() * 7), 3.6 + rand() * 1.2, Math.max(y0, map.waterLevel), Math.max(y1, map.waterLevel), rand()]);
        }
      }
    }
    // thin out evenly to the budget
    const keep = cars.length > budget ? cars.filter((_, i) => (i * budget) % cars.length < budget) : cars;
    const n = keep.length;
    const seg = new Float32Array(n * 4), run = new Float32Array(n * 4), ys = new Float32Array(n * 2);
    const colors = new Float32Array(n * 3);
    const palette = [[0.85, 0.85, 0.86], [0.08, 0.08, 0.09], [0.55, 0.56, 0.58], [0.6, 0.08, 0.06], [0.12, 0.2, 0.45], [0.9, 0.9, 0.88], [0.3, 0.32, 0.34], [0.95, 0.75, 0.1], [0.2, 0.3, 0.22]];
    keep.forEach((c, i) => {
      seg.set([c[0], c[1], c[2], c[3]], i * 4);
      run.set([c[4], c[5], c[6], c[7]], i * 4);
      ys.set([c[8], c[9]], i * 2);
      const p = palette[Math.floor(c[10] * palette.length)];
      colors.set(p, i * 3);
    });
    // car body: chassis, cabin and wheels, nose towards -Z
    const parts = [];
    const bx = (w, h, d, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, z); parts.push(g); };
    bx(1.8, 0.7, 4.4, 0.6, 0);
    bx(1.6, 0.6, 2.3, 1.22, 0.25);
    const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    for (const g of parts) g.dispose();
    geo.setAttribute('aSeg', new THREE.InstancedBufferAttribute(seg, 4));
    geo.setAttribute('aRun', new THREE.InstancedBufferAttribute(run, 4));
    geo.setAttribute('aY', new THREE.InstancedBufferAttribute(ys, 2));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(colors, 3));
    const uniforms = { uTime: { value: 0 }, uNight: { value: this.night || 0 } };
    this.trafficUniforms = uniforms;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.55 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          attribute vec4 aSeg;
          attribute vec4 aRun;
          attribute vec2 aY;
          attribute vec3 aCol;
          varying vec3 vCarLocal;
          varying vec3 vCarCol;`)
        .replace('#include <beginnormal_vertex>', `
          vec3 cF = vec3( aSeg.z, 0.0, aSeg.w );
          vec3 cR = vec3( -aSeg.w, 0.0, aSeg.z );
          vec3 objectNormal = cR * normal.x + vec3( 0.0, normal.y, 0.0 ) - cF * normal.z;`)
        .replace('#include <begin_vertex>', `
          float cs = fract( aRun.y + uTime * aRun.z / aRun.x );
          vec3 cBase = vec3( aSeg.x, mix( aY.x, aY.y, cs ) + 0.05, aSeg.y ) + cF * ( cs * aRun.x ) + cR * aRun.w;
          vec3 transformed = cBase + cR * position.x + vec3( 0.0, position.y, 0.0 ) - cF * position.z;
          vCarLocal = position;
          vCarCol = aCol;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uNight;
          varying vec3 vCarLocal;
          varying vec3 vCarCol;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float glassBand = step( 0.95, vCarLocal.y );
          diffuseColor.rgb = mix( vCarCol, vec3( 0.04, 0.05, 0.06 ), glassBand * 0.85 );`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float lampRow = step( 0.45, vCarLocal.y ) * step( vCarLocal.y, 0.8 ) * step( 0.45, abs( vCarLocal.x ) );
          float head = lampRow * step( vCarLocal.z, -2.15 );
          float tail = lampRow * step( 2.15, vCarLocal.z );
          totalEmissiveRadiance += ( vec3( 3.0, 2.8, 2.4 ) * head + vec3( 2.6, 0.12, 0.08 ) * tail ) * ( 0.15 + 0.85 * uNight );`);
    };
    mat.customProgramCacheKey = () => 'city-traffic-v1';
    this.materials.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.trafficMesh = mesh;
  }

  // ---------------------------------------------------------------- bridges
  _archBridge(b, shadows) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8ad98, roughness: 0.9 });
    const road = new THREE.MeshStandardMaterial({ color: 0x45474a, roughness: 0.85 });
    this.materials.push(stone, road);
    const g = new THREE.Group();
    const len = b.x1 - b.x0, w = b.w || 22, y = b.deckY;
    const cx = (b.x0 + b.x1) / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, w), stone);
    deck.position.set(cx, y - 1.2, b.z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, w - 4), road);
    top.position.set(cx, y + 0.05, b.z);
    g.add(deck, top);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1, 0.6), stone);
      rail.position.set(cx, y + 0.55, b.z + s * (w / 2 - 0.3));
      g.add(rail);
    }
    const spans = Math.max(2, Math.round(len / 55));
    const sp = len / spans;
    const floorY = y - 22;
    for (let i = 0; i <= spans; i++) {
      const px = b.x0 + i * sp;
      if (i > 0 && i < spans) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(6, y - floorY, w + 2), stone);
        pier.position.set(px, (y + floorY) / 2 - 1.5, b.z);
        g.add(pier);
      }
      if (i < spans) {
        // the arch under each span
        const arch = new THREE.Mesh(new THREE.TorusGeometry(sp / 2 - 2, 2.2, 6, 24, Math.PI), stone);
        arch.scale.set(1, 0.6, w / 4.4);
        arch.position.set(px + sp / 2, y - 3.2 - (sp / 2 - 2) * 0.6, b.z);
        g.add(arch);
      }
    }
    // street lamps along the parapets
    const lp = [];
    for (let x = b.x0 + 10; x < b.x1; x += 22) for (const s of [-1, 1]) lp.push(x, y + 4.5, b.z + s * (w / 2 - 0.6));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    if (!this.bridgeLampMat) {
      this.bridgeLampMat = new THREE.PointsMaterial({ color: new THREE.Color(2.8, 2.0, 1.1), size: 4, map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: this.night || 0 });
      this.materials.push(this.bridgeLampMat);
    }
    const pts = new THREE.Points(lg, this.bridgeLampMat);
    pts.frustumCulled = false;
    g.add(pts);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = shadows;
        o.receiveShadow = shadows;
      }
    });
    this.group.add(g);
  }

  setNight(n) {
    if (this.trafficUniforms) this.trafficUniforms.uNight.value = n;
    if (this.bridgeLampMat) this.bridgeLampMat.opacity = n;
    this.uniforms.uNight.value = n;
    if (this.podGlow) this.podGlow.emissiveIntensity = n * 1.6;
    if (this.pitchMat) this.pitchMat.emissiveIntensity = n * 2.5;
    if (this.bridgeLightMat) this.bridgeLightMat.opacity = n;
    this.night = n;
  }

  update(dt, camera) {
    this.time += dt;
    if (this.trafficUniforms) this.trafficUniforms.uTime.value = this.time;
    if (camera) {
      const cx = camera.position.x, cz = camera.position.z;
      const high = Math.max(0, camera.position.y - 1500);
      const dd = this.drawDist - Math.min(this.drawDist * 0.5, high * 0.6);
      for (const t of this.tiles) {
        const vis = Math.hypot(t.cx - cx, t.cz - cz) < dd + 1100;
        t.mesh.visible = vis;
        for (const m of t.extra) m.visible = vis && Math.hypot(t.cx - cx, t.cz - cz) < dd * 0.8 + 900;
      }
      if (this.containerMesh) this.containerMesh.visible = Math.hypot(this.portX - cx, this.portZ - cz) < dd + 3000;
    }
    // obstruction lights flash; brighter at night
    const on = this.time % 1.5 < 0.75;
    this.aviationMat.opacity = on ? 0.35 + 0.65 * (this.night || 0) : 0.08 * (this.night || 0);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    this.containerTex?.dispose();
  }
}
