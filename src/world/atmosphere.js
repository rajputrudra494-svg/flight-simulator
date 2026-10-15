// Global "aerial perspective" fog. Three's fog shader chunks are replaced with a
// height-based exponential fog whose colour depends on view direction relative
// to the sun, so distant terrain melts into the sky exactly like real haze.
//
// The shared uniform values are typed arrays: three.js copies Vector/Color
// uniforms per material but keeps typed arrays by reference, so updating these
// arrays once per frame updates every material.
import * as THREE from 'three';

export const atmo = {
  sunDir: new Float32Array([0, 1, 0]),
  fogAway: new Float32Array([0.6, 0.7, 0.8]), // horizon colour looking away from sun
  fogToward: new Float32Array([0.9, 0.8, 0.7]), // horizon colour looking at sun
  params: new Float32Array([1 / 1500, 0, 0.25, 3]), // falloff, base height, haze, sun blend power
  invView: new Float32Array(16),
};

const parsVertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  uniform mat4 uAtmoInvView;
#endif
`;

const vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = ( uAtmoInvView * mvPosition ).xyz;
#endif
`;

export const atmoFunctionsGLSL = /* glsl */ `
  uniform vec3 uAtmoSunDir;
  uniform vec3 uAtmoFogAway;
  uniform vec3 uAtmoFogToward;
  uniform vec4 uAtmoParams;

  vec3 atmoFogColor( vec3 dir ) {
    vec2 d2 = dir.xz;
    float l = length( d2 );
    vec2 s2 = uAtmoSunDir.xz;
    float ls = length( s2 );
    float c = ( l > 1e-4 && ls > 1e-4 ) ? dot( d2 / l, s2 / ls ) : 0.0;
    float w = pow( clamp( c * 0.5 + 0.5, 0.0, 1.0 ), uAtmoParams.w );
    vec3 col = mix( uAtmoFogAway, uAtmoFogToward, w );
    float glow = pow( max( dot( dir, uAtmoSunDir ), 0.0 ), 24.0 );
    return col + uAtmoFogToward * glow * 0.35;
  }

  float atmoFogAmount( float dist, vec3 dir, float density ) {
    float b = uAtmoParams.x;
    float camH = max( cameraPosition.y - uAtmoParams.y, 0.0 );
    float t = b * dir.y * dist;
    float integ = abs( t ) > 1e-4 ? ( 1.0 - exp( -t ) ) / t : 1.0 - 0.5 * t;
    float od = density * dist * ( exp( -b * camH ) * integ + uAtmoParams.z );
    return 1.0 - exp( -od );
  }
`;

const parsFragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${atmoFunctionsGLSL}
#endif
`;

const fragment = /* glsl */ `
#ifdef USE_FOG
  vec3 atmoRay = vFogWorldPos - cameraPosition;
  float atmoDist = length( atmoRay );
  vec3 atmoDir = atmoRay / max( atmoDist, 1e-3 );
  #ifdef FOG_EXP2
    float fogFactor = atmoFogAmount( atmoDist, atmoDir, fogDensity );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, atmoFogColor( atmoDir ), fogFactor );
#endif
`;

let installed = false;

export function atmoUniforms() {
  return {
    uAtmoSunDir: { value: atmo.sunDir },
    uAtmoFogAway: { value: atmo.fogAway },
    uAtmoFogToward: { value: atmo.fogToward },
    uAtmoParams: { value: atmo.params },
    uAtmoInvView: { value: atmo.invView },
  };
}

export function installAtmosphere() {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = parsVertex;
  THREE.ShaderChunk.fog_vertex = vertex;
  THREE.ShaderChunk.fog_pars_fragment = parsFragment;
  THREE.ShaderChunk.fog_fragment = fragment;
  const extra = atmoUniforms();
  for (const key of Object.keys(THREE.ShaderLib)) {
    const lib = THREE.ShaderLib[key];
    if (lib && lib.uniforms) Object.assign(lib.uniforms, extra);
  }
  Object.assign(THREE.UniformsLib.fog, extra);
}

export function updateAtmosphereCamera(camera) {
  atmo.invView.set(camera.matrixWorld.elements);
}

// ---------------------------------------------------------------------------
// CPU port of the Preetham sky model (matches the sky shader) so we can derive
// fog and light colours that agree with what the sky renders.
// ---------------------------------------------------------------------------
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

function sunIntensity(zenithAngleCos) {
  const cutoffAngle = 1.6110731556870734;
  const steepness = 1.5;
  const c = Math.max(-1, Math.min(1, zenithAngleCos));
  return 1000 * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(c)) / steepness)));
}

export function skyColorJS(dir, sunDir, p, out = [0, 0, 0]) {
  const sunE = sunIntensity(sunDir.y);
  const rayleighCoef = p.rayleigh;
  const c = 0.2 * p.turbidity * 10e-18;
  const betaR = totalRayleigh.map((v) => v * rayleighCoef);
  const betaM = MieConst.map((v) => 0.434 * c * v * p.mie);
  const zenithAngle = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosTheta = dir.x * sunDir.x + dir.y * sunDir.y + dir.z * sunDir.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  const g = p.mieG, g2 = g * g;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
  const horizonMix = Math.min(1, Math.max(0, Math.pow(1 - sunDir.y, 5)));
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM));
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * horizonMix;
    const L0 = 0.1 * Fex;
    const tex = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
    out[i] = Math.pow(tex, 1 / 2.4);
  }
  return out;
}

// Transmittance towards the sun (for direct light colour)
export function sunTransmittance(sunDir, p) {
  const c = 0.2 * p.turbidity * 10e-18;
  const zen = Math.acos(Math.max(0.0, sunDir.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  return [0, 1, 2].map((i) => Math.exp(-(totalRayleigh[i] * p.rayleigh * sR + 0.434 * c * MieConst[i] * p.mie * sM)));
}

export function configureAtmosphere(sunDir, lighting, fog) {
  atmo.sunDir[0] = sunDir.x; atmo.sunDir[1] = sunDir.y; atmo.sunDir[2] = sunDir.z;
  const hz = Math.hypot(sunDir.x, sunDir.z) || 1;
  const sx = sunDir.x / hz, sz = sunDir.z / hz;
  const sample = (ax, az) => skyColorJS({ x: ax * 0.999, y: 0.045, z: az * 0.999 }, sunDir, lighting);
  const toward = sample(sx, sz);
  const away = sample(-sx, -sz);
  const side = sample(-sz, sx);
  // Fit the blend exponent so the 90-degree sample matches
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const ratio = (lum(side) - lum(away)) / Math.max(1e-4, lum(toward) - lum(away));
  let k = ratio > 0.001 && ratio < 0.999 ? Math.log(ratio) / Math.log(0.5) : 3;
  k = Math.max(1, Math.min(10, k));
  // Slightly desaturate the fog towards a neutral haze for realism
  const haze = (c) => {
    const l = lum(c);
    return c.map((v) => v * 0.85 + l * 0.15);
  };
  atmo.fogAway.set(haze(away));
  atmo.fogToward.set(haze(toward));
  atmo.params[0] = fog.falloff;
  atmo.params[1] = 0;
  atmo.params[2] = fog.haze;
  atmo.params[3] = k;
  return { away, toward, zenith: skyColorJS({ x: 0, y: 1, z: 0 }, sunDir, lighting) };
}
