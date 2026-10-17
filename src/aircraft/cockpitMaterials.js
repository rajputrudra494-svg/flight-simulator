// Materials for the cockpit interiors. Every interior surface shares one
// lighting model that treats the flight deck as a closed room: sky light and
// sunlight only get in through the window openings (an analytic test of the
// ray towards the sun against the window outlines, the instrument-panel block
// and, for fighters, the canopy sill), panel legends and gauge markings glow
// with the integral panel lighting, and a dim flood light fills the cockpit
// after dark. Variants of the same shader draw the cockpit shell (window
// openings cut out with rounded corners and painted frames), the self-lit
// avionics displays and the window / canopy glass with dirt, glare and
// reflections of the lit panels.
import * as THREE from 'three';
import { getNoiseTexture } from '../world/textures.js';

export const MAX_WINDOWS = 5;
export const MAX_OCCLUDERS = 3;

const vertex = /* glsl */ `
  attribute vec4 aCol;
  uniform mat4 uToLocal;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vLocal = ( uToLocal * world ).xyz;
    vNormal = mat3( uToLocal ) * ( mat3( modelMatrix ) * normal );
    vUv = uv;
    vCol = aCol;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D emissiveMap;
  uniform sampler2D tNoise;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSkyCol;
  uniform vec3 uGndCol;
  uniform vec3 uUp;
  uniform vec3 uCam;
  uniform vec3 uPanelLight;
  uniform vec3 uFlood;
  uniform float uNight;
  uniform float uDispGain;
  uniform float uSpec;
  uniform float uShine;
  uniform float uEmissive;
  uniform vec3 uRef;
  uniform vec4 uWinA[ ${MAX_WINDOWS} ];
  uniform vec4 uWinB[ ${MAX_WINDOWS} ];
  uniform float uWinR[ ${MAX_WINDOWS} ];
  uniform int uWinCount;
  uniform vec4 uRoom;
  uniform vec4 uScreen;
  uniform float uRear;
  uniform vec4 uSill;
  uniform vec3 uOccMin[ ${MAX_OCCLUDERS} ];
  uniform vec3 uOccMax[ ${MAX_OCCLUDERS} ];
  uniform int uOccCount;
  uniform vec3 uFrameCol;
  uniform vec3 uTint;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec4 vCol;

  // NaN guards: one NaN pixel is smeared over the whole screen by the bloom
  // blur, so every pow / normalize / atan below is kept in its defined range.
  vec3 safeNormalize( vec3 v ) {
    return v * inversesqrt( max( dot( v, v ), 1e-12 ) );
  }
  float rim( float c, float k ) {
    return pow( clamp( 1.0 - c, 0.0, 1.0 ), k );
  }

  // signed distance (degrees) from a point to the outward side of an edge
  float edgeD( vec2 p, vec2 a, vec2 b ) {
    vec2 e = b - a;
    return clamp( dot( p - a, vec2( e.y, -e.x ) ) / max( length( e ), 1e-4 ), -200.0, 200.0 );
  }

  // polynomial smooth maximum: rounds the corner where two edges meet
  float smax( float a, float b, float k ) {
    float h = max( k - abs( a - b ), 0.0 ) / k;
    return max( a, b ) + h * h * k * 0.25;
  }

  // Distance in degrees to the nearest window outline as seen from uRef,
  // negative inside a window. Windows are convex quads (mirrored left/right)
  // with rounded corners.
  float windowSDF( vec3 p ) {
    vec3 d = p - uRef;
    float az = degrees( atan( abs( d.x ) + 1e-6, -d.z ) );
    float el = degrees( atan( d.y, length( d.xz ) + 1e-6 ) );
    vec2 q = vec2( az, el );
    float best = 1e4;
    for ( int i = 0; i < ${MAX_WINDOWS}; i++ ) {
      if ( i >= uWinCount ) break;
      vec2 a = uWinA[ i ].xy, b = uWinA[ i ].zw, c = uWinB[ i ].xy, e = uWinB[ i ].zw;
      float k = uWinR[ i ];
      float s = smax( smax( smax( edgeD( q, a, b ), edgeD( q, b, c ), k ), edgeD( q, c, e ), k ), edgeD( q, e, a ), k );
      best = min( best, s );
    }
    return best;
  }

  bool hitsBox( vec3 o, vec3 dir, vec3 bmin, vec3 bmax ) {
    vec3 inv = 1.0 / ( dir + vec3( 1e-6 ) );
    vec3 t0 = ( bmin - o ) * inv, t1 = ( bmax - o ) * inv;
    vec3 tn = min( t0, t1 ), tf = max( t0, t1 );
    float n = max( max( tn.x, tn.y ), tn.z ), f = min( min( tf.x, tf.y ), tf.z );
    return f > max( n, 0.0 );
  }

  // How much of the sun reaches point p (cockpit space) through the windows.
  float sunVisibility( vec3 p, vec3 L ) {
    for ( int i = 0; i < ${MAX_OCCLUDERS}; i++ ) {
      if ( i >= uOccCount ) break;
      if ( hitsBox( p, L, uOccMin[ i ], uOccMax[ i ] ) ) return 0.0;
    }
    #ifdef FIGHTER
      // bubble canopy: open above the sill, the tub and fuselage block the rest
      if ( p.y >= uSill.x ) return 1.0;
      if ( L.y <= 0.0 ) return 0.0;
      vec3 e = p + L * ( ( uSill.x - p.y ) / L.y );
      float open = min( uSill.y - abs( e.x ), min( e.z - uSill.z, uSill.w - e.z ) );
      return smoothstep( -0.03, 0.03, open );
    #else
      // flight deck: elliptic room along z, sloped V windshield, rear bulkhead
      vec2 o = vec2( p.x / uRoom.x, ( p.y - uRoom.y ) / uRoom.z );
      vec2 dd = vec2( L.x / uRoom.x, L.y / uRoom.z );
      float A = dot( dd, dd ), B = 2.0 * dot( o, dd ), C = dot( o, o ) - 1.0;
      float t = A > 1e-5 ? ( -B + sqrt( max( B * B - 4.0 * A * C, 0.0 ) ) ) / ( 2.0 * A ) : 1e3;
      // windshield surface z = s.x + (y - s.y) * s.z + |x| * s.w (inside: f > 0)
      for ( int side = 0; side < 2; side++ ) {
        float sg = side == 0 ? 1.0 : -1.0;
        float f0 = p.z - uScreen.x - ( p.y - uScreen.y ) * uScreen.z - sg * p.x * uScreen.w;
        float df = L.z - L.y * uScreen.z - sg * L.x * uScreen.w;
        if ( df < -1e-5 ) {
          float tw = -f0 / df;
          vec3 h = p + L * tw;
          if ( tw > 0.0 && h.x * sg >= -0.01 ) t = min( t, tw );
        }
      }
      if ( L.z > 1e-5 ) t = min( t, ( uRear - p.z ) / L.z );
      float s = windowSDF( p + L * max( t, 0.0 ) );
      return 1.0 - smoothstep( -0.8, 0.8, s );
    #endif
  }

  void main() {
    vec3 N = safeNormalize( vNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
    vec3 p = vLocal;
    vec3 V = safeNormalize( uCam - p );
    #if defined( GLASS )
      // window / canopy glass: tint, sky reflection, dirt lit up by the sun and
      // faint reflections of the lit instrument panel after dark
      #ifndef FIGHTER
        if ( windowSDF( p ) > 0.0 ) discard;
      #endif
      float fres = rim( abs( dot( V, N ) ), 4.0 );
      vec2 nuv = p.xy * 1.7 + p.z * 0.9;
      float dirt = texture2D( tNoise, nuv ).r * 0.6 + texture2D( tNoise, nuv * 4.3 ).g * 0.4;
      dirt = smoothstep( 0.45, 0.85, dirt );
      float sv = max( dot( -V, uSunDir ), 0.0 );
      sv = min( sv, 1.0 );
      float glare = pow( sv, 14.0 ), halo = pow( sv, 3.0 );
      vec3 light = uSkyCol * fres * 0.3 + uSunCol * ( glare * 0.3 + halo * 0.03 ) * ( 0.2 + dirt );
      vec3 d = p - uRef;
      float low = 1.0 - smoothstep( -0.25, 0.25, d.y / max( length( d.xz ), 0.3 ) );
      light += ( uPanelLight * 0.3 + vec3( 0.04, 0.1, 0.14 ) * uDispGain ) * low * uNight * 0.1;
      // premultiplied tint + added light, written for straight alpha blending
      float a = clamp( uEmissive + fres * 0.25 + dirt * 0.03 + glare * 0.25, 0.02, 0.9 );
      gl_FragColor = vec4( ( uTint * uEmissive + light ) / a, a );
    #elif defined( DISPLAY )
      vec3 tex = texture2D( map, vUv ).rgb;
      float ndl = max( dot( N, uSunDir ), 0.0 );
      float vis = ndl > 0.0 ? sunVisibility( p + N * 0.015, uSunDir ) : 0.0;
      // the cover glass: sun wash-out and a faint sky reflection
      float fres = rim( dot( V, N ), 5.0 );
      vec3 col = tex * uDispGain + uSunCol * ndl * vis * 0.012 + uSkyCol * ( 0.02 + fres * 0.15 );
      gl_FragColor = vec4( col, 1.0 );
    #else
      vec3 albedo = texture2D( map, vUv ).rgb * vCol.rgb;
      #ifdef SHELL
        float w = windowSDF( p );
        if ( w < 0.0 ) discard;
        // painted window frames with a rounded inner reveal
        float frame = 1.0 - smoothstep( 1.0, 1.8, w );
        albedo = mix( albedo, uFrameCol, frame );
        float bevel = smoothstep( 0.0, 0.9, w ) * ( 1.0 - smoothstep( 0.9, 1.8, w ) );
        albedo *= 1.0 - 0.45 * ( 1.0 - smoothstep( 0.0, 0.5, w ) );
        albedo += bevel * 0.035;
      #endif
      float up = dot( N, uUp );
      // sky light through the windows: strongest on surfaces facing up and forward
      float facing = clamp( 0.4 + 0.3 * up - 0.22 * N.z, 0.25, 1.0 );
      // plus light bounced around the cabin (seats, ceiling, crew)
      vec3 amb = mix( uGndCol, uSkyCol, 0.5 + 0.5 * up ) * facing + ( uSkyCol + uGndCol ) * 0.1;
      float ndl = max( dot( N, uSunDir ), 0.0 );
      float vis = ndl > 0.0 ? sunVisibility( p + N * 0.015, uSunDir ) : 0.0;
      vec3 col = albedo * ( ( amb + uSunCol * ndl * vis ) * vCol.a + uFlood );
      // glossy surfaces catch the sun
      if ( uSpec > 0.0 ) {
        vec3 H = safeNormalize( uSunDir + V );
        col += uSunCol * pow( clamp( dot( N, H ), 0.0, 1.0 ), uShine ) * uSpec * vis * ndl;
        col += amb * rim( dot( N, V ), 5.0 ) * uSpec;
      }
      #ifdef EMISSIVE_FROM_MAP
        // analogue instruments: bright markings glow with the panel lighting
        vec3 m = texture2D( map, vUv ).rgb;
        col += m * smoothstep( 0.5, 0.9, dot( m, vec3( 0.333 ) ) ) * uPanelLight * uEmissive;
      #else
        col += texture2D( emissiveMap, vUv ).rgb * uPanelLight * uEmissive;
      #endif
      gl_FragColor = vec4( col, 1.0 );
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

let blackTex = null;
function black() {
  if (!blackTex) {
    blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blackTex.needsUpdate = true;
  }
  return blackTex;
}
let whiteTex = null;
function white() {
  if (!whiteTex) {
    whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.colorSpace = THREE.SRGBColorSpace;
    whiteTex.needsUpdate = true;
  }
  return whiteTex;
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

// Lighting state shared by every material of one cockpit. `layout` carries the
// room description used by the sunlight test (see sunVisibility above).
export class CockpitLighting {
  constructor(layout) {
    const winA = [], winB = [], winR = [];
    for (let i = 0; i < MAX_WINDOWS; i++) {
      const w = layout.windows?.[i];
      winA.push(w ? new THREE.Vector4(w.pts[0][0], w.pts[0][1], w.pts[1][0], w.pts[1][1]) : new THREE.Vector4());
      winB.push(w ? new THREE.Vector4(w.pts[2][0], w.pts[2][1], w.pts[3][0], w.pts[3][1]) : new THREE.Vector4());
      winR.push(w ? w.r * 2.6 : 1);
    }
    const occ = layout.occluders || [];
    this.fighter = !!layout.fighter;
    this.uniforms = {
      uToLocal: { value: new THREE.Matrix4() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() },
      uSkyCol: { value: new THREE.Color() },
      uGndCol: { value: new THREE.Color() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uCam: { value: new THREE.Vector3() },
      uPanelLight: { value: new THREE.Color() },
      uFlood: { value: new THREE.Color() },
      uNight: { value: 0 },
      uDispGain: { value: 1 },
      uRef: { value: layout.ref.clone() },
      uWinA: { value: winA },
      uWinB: { value: winB },
      uWinR: { value: winR },
      uWinCount: { value: Math.min(MAX_WINDOWS, layout.windows?.length || 0) },
      uRoom: { value: new THREE.Vector4(...(layout.room || [1, 0, 1, 0])) },
      uScreen: { value: new THREE.Vector4(...(layout.screen || [-10, 0, 0, 0])) },
      uRear: { value: layout.rear ?? 10 },
      uSill: { value: new THREE.Vector4(...(layout.sill || [0, 1, -10, 10])) },
      uOccMin: { value: Array.from({ length: MAX_OCCLUDERS }, (_, i) => (occ[i] ? occ[i].min.clone() : new THREE.Vector3())) },
      uOccMax: { value: Array.from({ length: MAX_OCCLUDERS }, (_, i) => (occ[i] ? occ[i].max.clone() : new THREE.Vector3())) },
      uOccCount: { value: Math.min(MAX_OCCLUDERS, occ.length) },
      tNoise: { value: getNoiseTexture() },
    };
    this.panelColor = new THREE.Color(layout.panelLight || '#ffd9a8');
    this.ambient = layout.ambient ?? 1;
    this.floodColor = new THREE.Color(layout.flood || '#ffcf9a');
    this.materials = [];
  }

  // Creates an interior material. kind: 'interior' | 'shell' | 'display' | 'glass'
  material(kind = 'interior', o = {}) {
    const defines = {};
    if (this.fighter) defines.FIGHTER = '';
    if (kind === 'shell') defines.SHELL = '';
    if (kind === 'display') defines.DISPLAY = '';
    if (kind === 'glass') defines.GLASS = '';
    if (o.emissiveFromMap) defines.EMISSIVE_FROM_MAP = '';
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        map: { value: o.map || white() },
        emissiveMap: { value: o.emissiveMap || black() },
        uSpec: { value: o.spec ?? 0 },
        uShine: { value: o.shine ?? 40 },
        uEmissive: { value: o.emissive ?? 1 },
        uFrameCol: { value: new THREE.Color(o.frameColor || '#26292c') },
        uTint: { value: new THREE.Color(o.tint || '#000000') },
      },
      defines,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: o.side ?? THREE.DoubleSide,
      transparent: kind === 'glass',
      depthWrite: kind !== 'glass',
    });
    this.materials.push(mat);
    return mat;
  }

  // Per-frame update from the world lighting and the aircraft pose.
  update(root, camera, world, opts = {}) {
    const u = this.uniforms;
    root.updateMatrixWorld();
    u.uToLocal.value.copy(root.matrixWorld).invert();
    _m.extractRotation(u.uToLocal.value);
    if (world) {
      const sun = world.sun;
      u.uSunDir.value.copy(world.lightDir || sun.position).normalize().applyMatrix4(_m).normalize();
      u.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity * 0.55);
      const hemi = world.hemi;
      u.uSkyCol.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.7 * this.ambient);
      u.uGndCol.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity * 0.45 * this.ambient);
      // the sun only lights the deck while it is above the horizon
      if (!world.night) u.uSunCol.value.multiplyScalar(THREE.MathUtils.smoothstep(world.lightDir.y, -0.05, 0.02));
      const night = world.nightFactor ?? 0;
      u.uNight.value = night;
      // integral panel lighting is turned up as the light fades
      u.uPanelLight.value.copy(this.panelColor).multiplyScalar(0.1 + night * 0.9);
      // dim flood lights after dark, sunlight bouncing around the deck by day
      u.uFlood.value.copy(this.floodColor).multiplyScalar(night * 0.045).add(_c.copy(u.uSunCol.value).multiplyScalar(0.025));
    }
    u.uUp.value.set(0, 1, 0).applyMatrix4(_m).normalize();
    u.uCam.value.copy(camera.position).applyMatrix4(u.uToLocal.value);
    // displays dim automatically so they read the same day and night
    const exposure = opts.exposure || 0.6;
    u.uDispGain.value = THREE.MathUtils.clamp(0.95 / exposure, 0.75, 2.4);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}

// Adds the per-vertex albedo / ambient-occlusion attribute the interior shader
// expects (rgb = colour, a = occlusion).
export function tintGeometry(geo, color, ao = 1) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = c.r;
    arr[i * 4 + 1] = c.g;
    arr[i * 4 + 2] = c.b;
    arr[i * 4 + 3] = ao;
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(arr, 4));
  return geo;
}

// CPU version of windowSDF (degrees, negative inside a window).
export function windowSDF(p, ref, windows) {
  const dx = p.x - ref.x, dy = p.y - ref.y, dz = p.z - ref.z;
  const az = (Math.atan2(Math.abs(dx), -dz) * 180) / Math.PI;
  const el = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  const edge = (a, b) => {
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    return ((az - a[0]) * ey - (el - a[1]) * ex) / l;
  };
  const smax = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  };
  let best = 1e4;
  for (const w of windows.slice(0, MAX_WINDOWS)) {
    const [a, b, c, e] = w.pts;
    const k = w.r * 2.6;
    best = Math.min(best, smax(smax(smax(edge(a, b), edge(b, c), k), edge(c, e), k), edge(e, a), k));
  }
  return best;
}
