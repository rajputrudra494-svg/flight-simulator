// Physically based (Preetham) sky dome with sun disc, cirrus layer and a
// horizon that blends into the same aerial-perspective colour the fog uses.
import * as THREE from 'three';
import { atmoFunctionsGLSL, atmoUniforms } from './atmosphere.js';
import { getNoiseTexture } from './textures.js';

const vertexShader = /* glsl */ `
  uniform vec3 sunPosition;
  uniform float rayleigh;
  uniform float turbidity;
  uniform float mieCoefficient;

  varying vec3 vWorldDir;
  varying vec3 vSunDirection;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  const float e = 2.71828182845904523536028747135266249775724709369995957;
  const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
  const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;
  const float EE = 1000.0;

  float sunIntensity( float zenithAngleCos ) {
    zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
    return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
  }

  vec3 totalMie( float T ) {
    float c = ( 0.2 * T ) * 10E-18;
    return 0.434 * c * MieConst;
  }

  void main() {
    vWorldDir = position;
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w * 0.99999;
    vSunDirection = normalize( sunPosition );
    vSunE = sunIntensity( vSunDirection.y );
    vBetaR = totalRayleigh * rayleigh;
    vBetaM = totalMie( turbidity ) * mieCoefficient;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldDir;
  varying vec3 vSunDirection;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  uniform float mieDirectionalG;
  uniform float uSunDiscIntensity;
  uniform float uCirrus;
  uniform float uTime;
  uniform float uEnvMode;
  uniform vec3 uGroundColor;
  uniform sampler2D uNoise;
  uniform float uNight;
  uniform vec3 uMoonDir;
  uniform vec3 uCityGlow;

  ${atmoFunctionsGLSL}

  const float pi = 3.141592653589793238462643383279502884197169;
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
  const float ONE_OVER_FOURPI = 0.07957747154594767;

  float rayleighPhase( float cosTheta ) {
    return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
  }

  float hgPhase( float cosTheta, float g ) {
    float g2 = pow( g, 2.0 );
    float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
    return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
  }

  vec3 skyRadiance( vec3 direction, out vec3 Fex, out float cosTheta ) {
    float zenithAngle = acos( max( 0.0, direction.y ) );
    float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;
    Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
    cosTheta = dot( direction, vSunDirection );
    float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
    vec3 betaRTheta = vBetaR * rPhase;
    float mPhase = hgPhase( cosTheta, mieDirectionalG );
    vec3 betaMTheta = vBetaM * mPhase;
    vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
    Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );
    vec3 L0 = vec3( 0.1 ) * Fex;
    return ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  }

  void main() {
    vec3 direction = normalize( vWorldDir );
    vec3 Fex; float cosTheta;
    vec3 tex = skyRadiance( direction, Fex, cosTheta );
    vec3 col = pow( max( tex, vec3( 0.0 ) ), vec3( 1.0 / 2.4 ) );

    // high cirrus layer
    if ( uCirrus > 0.0 && direction.y > 0.0 ) {
      vec2 p = direction.xz / ( direction.y + 0.12 ) * 0.35 + vec2( uTime * 0.0015, 0.0 );
      float c = texture2D( uNoise, p * 0.6 ).g * 0.65 + texture2D( uNoise, p * 2.3 + 0.3 ).b * 0.35;
      c = smoothstep( 0.52, 0.85, c ) * uCirrus * smoothstep( 0.0, 0.25, direction.y );
      vec3 cirrusCol = mix( uAtmoFogAway * 1.15, uAtmoFogToward * 1.4, pow( max( cosTheta, 0.0 ), 3.0 ) );
      col = mix( col, cirrusCol, c * 0.55 );
    }

    // sun disc (HDR so bloom catches it)
    float disc = smoothstep( 0.99985, 0.99993, cosTheta );
    float halo = pow( max( cosTheta, 0.0 ), 800.0 ) * 0.45 + pow( max( cosTheta, 0.0 ), 60.0 ) * 0.06;
    col += ( disc * uSunDiscIntensity + halo ) * Fex * vec3( 1.0, 0.95, 0.85 );

    if ( uNight > 0.0 ) {
      float up = max( direction.y, 0.0 );
      vec3 night = mix( vec3( 0.02, 0.03, 0.055 ), vec3( 0.003, 0.005, 0.014 ), pow( up, 0.45 ) );
      vec3 sd = direction * 260.0;
      vec3 cell = floor( sd );
      float h = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
      vec3 fp = fract( sd ) - 0.5;
      float star = step( 0.982, h ) * smoothstep( 0.14, 0.0, length( fp ) ) * smoothstep( 0.0, 0.2, direction.y );
      night += vec3( 0.85, 0.92, 1.0 ) * star * ( 0.3 + 2.5 * fract( h * 91.3 ) ) * ( 1.0 - uEnvMode );
      float cm = dot( direction, uMoonDir );
      night += vec3( 1.0, 0.97, 0.9 ) * smoothstep( 0.99955, 0.99968, cm ) * 2.5;
      night += vec3( 0.35, 0.45, 0.65 ) * ( pow( max( cm, 0.0 ), 80.0 ) * 0.2 + pow( max( cm, 0.0 ), 8.0 ) * 0.02 );
      night += uCityGlow * pow( 1.0 - up, 7.0 );
      col = mix( col, night, uNight );
    }

    // Blend into the fog colour at and below the horizon
    vec3 fogCol = atmoFogColor( direction );
    float h = smoothstep( -0.02, 0.09, direction.y );
    col = mix( fogCol, col, h );

    if ( uEnvMode > 0.5 ) {
      // environment capture: give the lower hemisphere a ground colour
      float g = smoothstep( 0.0, -0.15, direction.y );
      col = mix( col, uGroundColor, g );
    }

    gl_FragColor = vec4( col, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyDome extends THREE.Mesh {
  constructor() {
    const material = new THREE.ShaderMaterial({
      name: 'SkyDome',
      uniforms: {
        sunPosition: { value: new THREE.Vector3(0, 1, 0) },
        rayleigh: { value: 1 },
        turbidity: { value: 2 },
        mieCoefficient: { value: 0.005 },
        mieDirectionalG: { value: 0.8 },
        uSunDiscIntensity: { value: 28 },
        uCirrus: { value: 0.6 },
        uTime: { value: 0 },
        uEnvMode: { value: 0 },
        uGroundColor: { value: new THREE.Color(0.2, 0.2, 0.18) },
        uNoise: { value: getNoiseTexture() },
        uNight: { value: 0 },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uCityGlow: { value: new THREE.Color(0, 0, 0) },
        ...atmoUniforms(),
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    super(new THREE.SphereGeometry(1000, 48, 24), material);
    this.frustumCulled = false;
    this.renderOrder = -1000;
    this.name = 'sky';
  }

  configure(sunDir, lighting, cirrus, groundColor) {
    const u = this.material.uniforms;
    u.sunPosition.value.copy(sunDir);
    u.rayleigh.value = lighting.rayleigh;
    u.turbidity.value = lighting.turbidity;
    u.mieCoefficient.value = lighting.mie;
    u.mieDirectionalG.value = lighting.mieG;
    u.uCirrus.value = cirrus;
    if (groundColor) u.uGroundColor.value.copy(groundColor);
  }

  follow(camera, time) {
    this.position.copy(camera.position);
    this.material.uniforms.uTime.value = time;
  }
}
