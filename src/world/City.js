// City rendering: every building is an instance of a box, round or hexagonal
// prism shaded by a procedural facade shader (curtain-wall glass, ribbon
// windows, punched windows, lit offices at night). Landmarks, a suspension
// bridge, harbour cranes, container stacks and blinking aviation lights are
// added on top. Layout data comes from cityLayout.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STYLE, SHAPE } from './cityLayout.js';
import { getGlowTexture } from '../aircraft/jetTextures.js';

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
      // roofs: dark membrane with plant blocks, helipad-grey on big towers
      float r = fHash( floor( vBPos.xz * 0.2 ) + seed * 31.0 );
      gAlbedo = vec3( 0.23, 0.23, 0.24 ) * ( 0.8 + 0.35 * r );
      gRough = 0.92;
      gMetal = 0.05;
      if ( uNight > 0.01 && H > 120.0 ) gEmit = vec3( 1.0, 0.25, 0.15 ) * uNight * 0.15 * step( 0.85, r );
      return;
    }
    if ( n.y < -0.5 ) { gAlbedo = vec3( 0.1 ); gRough = 1.0; gMetal = 0.0; return; }
    float hc;
    float face = 0.0;
    if ( shape < 0.5 ) {
      hc = abs( n.x ) > 0.5 ? vBPos.z : vBPos.x;
      face = n.x > 0.5 ? 1.0 : n.x < -0.5 ? 2.0 : n.z > 0.5 ? 3.0 : 4.0;
    } else {
      hc = atan( vBPos.z, vBPos.x ) * max( 0.5 * vBScale.x, 1.0 );
    }
    bool glass = style < 0.5 || ( style > 3.5 && style < 4.5 );
    float floorH = glass ? 3.9 : style < 2.5 && style > 1.5 ? 3.1 : 3.6;
    float colW = ( style > 1.5 && style < 2.5 ? 3.3 : 2.7 ) + fract( seed * 7.13 ) * 1.6;
    vec2 g = vec2( hc / colW + face * 17.0, y / floorH );
    vec2 f = fract( g );
    vec2 id = floor( g );
    vec2 fw = fwidth( g );
    float detail = 1.0 - smoothstep( 0.3, 0.85, max( fw.x, fw.y ) );
    float win, avg;
    if ( glass ) { win = winMask( f.x, 0.04, 0.96, fw.x ) * winMask( f.y, 0.07, 0.93, fw.y ); avg = 0.82; }
    else if ( style < 1.5 ) { win = winMask( f.y, 0.3, 0.84, fw.y ) * winMask( f.x, 0.02, 0.98, fw.x ); avg = 0.52; }
    else if ( style < 2.5 ) { win = winMask( f.x, 0.27, 0.73, fw.x ) * winMask( f.y, 0.3, 0.78, fw.y ); avg = 0.22; }
    else if ( style < 3.5 ) { win = winMask( f.x, 0.22, 0.78, fw.x ) * winMask( f.y, 0.03, 0.97, fw.y ); avg = 0.55; }
    else { win = winMask( f.y, 0.62, 0.8, fw.y ) * step( 0.5, fract( id.x * 0.25 ) ); avg = 0.08; }
    win = mix( avg, win, detail );
    float lobby = 1.0 - smoothstep( 4.5, 5.5, y );
    float crown = step( 100.0, H ) * smoothstep( H - 8.0, H - 6.0, y );
    float wv = fHash( id + seed * 13.1 );
    vec3 glassCol = style > 3.5 && style < 4.5 ? vec3( 0.42, 0.3, 0.12 ) : glass ? tint * 0.42 : vec3( 0.06, 0.08, 0.1 );
    vec3 wall = glass ? vec3( 0.38, 0.4, 0.42 ) : tint;
    // subtle storey banding on solid facades
    wall *= 0.92 + 0.08 * step( 0.9, f.y );
    vec3 winCol = glassCol * ( 0.7 + 0.6 * wv );
    gAlbedo = mix( wall, winCol, max( win, lobby * 0.8 ) );
    gAlbedo *= mix( 0.55, 1.0, smoothstep( 0.0, 14.0, y ) );
    gAlbedo = mix( gAlbedo, vec3( 0.75 ), crown * 0.5 );
    gRough = mix( glass ? 0.32 : 0.86, 0.07 + wv * 0.1, win );
    gMetal = mix( glass ? 0.6 : 0.04, 0.88, win );
    if ( uNight > 0.01 ) {
      // only a fraction of the offices are still lit at night
      float on = step( 1.0 - lit * 0.5, fHash( id * vec2( 1.7, 3.1 ) + seed * 57.0 + face * 3.3 ) );
      vec3 warm = mix( vec3( 1.0, 0.72, 0.42 ), vec3( 0.78, 0.9, 1.0 ), step( 0.7, fHash( id + 9.1 + seed ) ) );
      float level = 0.55 + 0.9 * fHash( id.yx + seed );
      vec3 e = warm * on * level * win;
      e = mix( vec3( 1.0, 0.8, 0.55 ) * lit * 0.5 * avg * 0.7, e, detail );
      e += vec3( 1.0, 0.85, 0.62 ) * lobby * 0.5 + mix( vec3( 0.9, 0.95, 1.0 ), vec3( 0.4, 0.75, 1.0 ), fract( seed * 3.7 ) ) * crown * 1.1;
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
  mat.customProgramCacheKey = () => 'facade-v1';
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
    this.tiles = [...tiles.values()].map((t) => ({ ...t, mesh: this._instances(t.list, SHAPE.BOX, shadows) }));
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

  setNight(n) {
    this.uniforms.uNight.value = n;
    if (this.podGlow) this.podGlow.emissiveIntensity = n * 1.6;
    if (this.pitchMat) this.pitchMat.emissiveIntensity = n * 2.5;
    if (this.bridgeLightMat) this.bridgeLightMat.opacity = n;
    this.night = n;
  }

  update(dt, camera) {
    this.time += dt;
    if (camera) {
      const cx = camera.position.x, cz = camera.position.z;
      const high = Math.max(0, camera.position.y - 1500);
      const dd = this.drawDist - Math.min(this.drawDist * 0.5, high * 0.6);
      for (const t of this.tiles) t.mesh.visible = Math.hypot(t.cx - cx, t.cz - cz) < dd + 1100;
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
