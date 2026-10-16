// Geometry helpers for building aircraft procedurally: lofted fuselages,
// airfoil-section lifting surfaces split into panels (so control surfaces can
// move), and assorted small parts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function spow(v, e) {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}

function lerpSection(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number' && typeof b[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    else out[k] = a[k];
  }
  return out;
}

// Catmull-Rom smoothing of section parameters along the length (z stays linear).
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function resampleSections(sections, perSpan) {
  const out = [];
  const n = sections.length;
  for (let i = 0; i < n - 1; i++) {
    const s0 = sections[Math.max(0, i - 1)], s1 = sections[i], s2 = sections[i + 1], s3 = sections[Math.min(n - 1, i + 2)];
    for (let k = 0; k < perSpan; k++) {
      const t = k / perSpan;
      const o = {};
      for (const key of Object.keys(s1)) {
        const v1 = s1[key], v2 = s2[key];
        if (typeof v1 !== 'number' || typeof v2 !== 'number') { o[key] = v1; continue; }
        if (key === 'z') o[key] = v1 + (v2 - v1) * t;
        else {
          const v0 = typeof s0[key] === 'number' ? s0[key] : v1;
          const v3 = typeof s3[key] === 'number' ? s3[key] : v2;
          let v = cr(v0, v1, v2, v3, t);
          if (key === 'w' || key === 'top' || key === 'bot') v = Math.max(0, v);
          if (key === 'n' || key === 'nb') v = Math.max(1.2, v);
          o[key] = v;
        }
      }
      out.push(o);
    }
  }
  out.push({ ...sections[n - 1] });
  return out;
}

// Linear sample of section values at a given z
export function sampleSection(sections, z) {
  if (z <= sections[0].z) return { ...sections[0] };
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    if (z <= b.z) return lerpSection(a, b, (z - a.z) / (b.z - a.z));
  }
  return { ...sections[sections.length - 1] };
}

/**
 * Loft a closed tube through cross sections.
 * section: { z, w, top, bot, y, x?, n?, nb? }  (n: superellipse exponent for top half, nb: bottom half)
 * Sections must be ordered with increasing z (nose -> tail).
 */
export function loft(sections, { radial = 28, smooth = 3, capStart = true, capEnd = true, uvScale = 1, uvZ = null } = {}) {
  const secs = resampleSections(sections, smooth);
  const R = radial;
  const positions = [];
  const uvs = [];
  // uvZ lets several lofts share one texture: u is measured between two fixed z values
  const z0 = uvZ ? uvZ[0] : secs[0].z, z1 = uvZ ? uvZ[1] : secs[secs.length - 1].z;
  for (const s of secs) {
    const n = s.n ?? 2, nb = s.nb ?? n;
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * Math.PI * 2;
      const c = Math.cos(th), si = Math.sin(th);
      const e = si >= 0 ? 2 / n : 2 / nb;
      const x = (s.x ?? 0) + s.w * spow(c, e);
      const y = (s.y ?? 0) + (si >= 0 ? s.top : s.bot) * spow(si, e);
      positions.push(x, y, s.z);
      uvs.push(((s.z - z0) / (z1 - z0)) * uvScale, j / R);
    }
  }
  const idx = [];
  const ring = R + 1;
  for (let i = 0; i < secs.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Fix the seam normals (first/last column share position)
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < secs.length; i++) {
    const a = i * ring, b = i * ring + R;
    const nx = nor.getX(a) + nor.getX(b), ny = nor.getY(a) + nor.getY(b), nz = nor.getZ(a) + nor.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(a, nx / l, ny / l, nz / l);
    nor.setXYZ(b, nx / l, ny / l, nz / l);
  }
  const parts = [geo];
  const cap = (s, flip) => {
    if (s.w < 1e-3 && s.top < 1e-3) return;
    const n = s.n ?? 2, nb = s.nb ?? n;
    const p = [(s.x ?? 0), (s.y ?? 0) + (s.top - s.bot) * 0.25, s.z];
    const ps = [], us = [], id = [];
    ps.push(...p);
    us.push(0.5, 0.5);
    for (let j = 0; j <= R; j++) {
      const th = (j / R) * Math.PI * 2;
      const c = Math.cos(th), si = Math.sin(th);
      const e = si >= 0 ? 2 / n : 2 / nb;
      ps.push((s.x ?? 0) + s.w * spow(c, e), (s.y ?? 0) + (si >= 0 ? s.top : s.bot) * spow(si, e), s.z);
      us.push(0.5 + c * 0.5, 0.5 + si * 0.5);
    }
    for (let j = 1; j <= R; j++) {
      if (flip) id.push(0, j, j + 1);
      else id.push(0, j + 1, j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(us, 2));
    g.setIndex(id);
    g.computeVertexNormals();
    parts.push(g);
  };
  if (capStart) cap(secs[0], false);
  if (capEnd) cap(secs[secs.length - 1], true);
  return parts.length > 1 ? mergeGeometries(parts.map((g) => g.toNonIndexed())) : geo;
}

// Symmetric airfoil half-thickness (NACA 4-digit, closed trailing edge)
function naca(x, t) {
  const xx = Math.max(0, Math.min(1, x));
  return 5 * t * (0.2969 * Math.sqrt(xx) - 0.126 * xx - 0.3516 * xx * xx + 0.2843 * xx * xx * xx - 0.1036 * xx * xx * xx * xx);
}

/**
 * Lifting surface defined by spanwise stations, each { x, y, z (leading edge), chord, t }.
 * Stations are along the span (root first). The chord runs along +Z (leading edge
 * at smaller z). Returns a function to build panels.
 */
export class Surface {
  constructor(stations, { vertical = false } = {}) {
    this.st = stations;
    this.vertical = vertical;
    // cumulative span length for parameterisation
    this.len = [0];
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i - 1], b = stations[i];
      this.len.push(this.len[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    this.total = this.len[this.len.length - 1];
  }

  station(s) {
    const d = s * this.total;
    let i = 0;
    while (i < this.st.length - 2 && this.len[i + 1] < d) i++;
    const a = this.st[i], b = this.st[i + 1];
    const t = (d - this.len[i]) / Math.max(1e-6, this.len[i + 1] - this.len[i]);
    return lerpSection(a, b, Math.max(0, Math.min(1, t)));
  }

  // point on the camber plane at span fraction s, chord fraction c; offset along thickness normal
  point(s, c, side, out) {
    const st = this.station(s);
    const half = naca(c, st.t) * st.chord;
    out.x = st.x;
    out.y = st.y;
    out.z = st.z + c * st.chord;
    if (this.vertical) out.x += side * half;
    else out.y += side * half;
    return out;
  }

  // Closed solid panel over span [s0,s1] and chord [c0,c1]
  panel(s0, s1, c0, c1, ns = 6, nc = 12) {
    const parts = [];
    const p = { x: 0, y: 0, z: 0 };
    const sideGeo = (side) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= ns; i++) {
        const s = s0 + ((s1 - s0) * i) / ns;
        for (let j = 0; j <= nc; j++) {
          // cosine spacing concentrates samples at the leading edge
          const u = j / nc;
          const cc = c0 + (c1 - c0) * (c0 === 0 ? 0.5 - 0.5 * Math.cos(u * Math.PI) : u);
          this.point(s, cc, side, p);
          pos.push(p.x, p.y, p.z);
          uv.push((this.vertical ? p.y : p.x) * 0.05 + 0.5, p.z * 0.05 + 0.5);
        }
      }
      for (let i = 0; i < ns; i++) {
        for (let j = 0; j < nc; j++) {
          const a = i * (nc + 1) + j, b = a + 1, c = a + nc + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    };
    const thick = this.vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    parts.push(orientDir(sideGeo(1), thick));
    parts.push(orientDir(sideGeo(-1), thick.clone().negate()));
    // caps: spanwise ends
    const spanCap = (s) => {
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= nc; j++) {
        const u = j / nc;
        const cc = c0 + (c1 - c0) * (c0 === 0 ? 0.5 - 0.5 * Math.cos(u * Math.PI) : u);
        this.point(s, cc, 1, p);
        pos.push(p.x, p.y, p.z);
        uv.push(p.x * 0.05 + 0.5, p.z * 0.05 + 0.5);
        this.point(s, cc, -1, p);
        pos.push(p.x, p.y, p.z);
        uv.push(p.x * 0.05 + 0.5, p.z * 0.05 + 0.5);
      }
      for (let j = 0; j < nc; j++) {
        const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    };
    const pa = { x: 0, y: 0, z: 0 }, pb = { x: 0, y: 0, z: 0 };
    this.point(s0, (c0 + c1) / 2, 0, pa);
    this.point(s1, (c0 + c1) / 2, 0, pb);
    const spanDir = new THREE.Vector3(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z).normalize();
    parts.push(orientDir(spanCap(s0), spanDir.clone().negate()));
    parts.push(orientDir(spanCap(s1), spanDir));
    // chordwise caps (hinge lines)
    const chordCap = (c) => {
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= ns; i++) {
        const s = s0 + ((s1 - s0) * i) / ns;
        this.point(s, c, 1, p);
        pos.push(p.x, p.y, p.z);
        uv.push(p.x * 0.05 + 0.5, p.z * 0.05 + 0.5);
        this.point(s, c, -1, p);
        pos.push(p.x, p.y, p.z);
        uv.push(p.x * 0.05 + 0.5, p.z * 0.05 + 0.5);
      }
      for (let i = 0; i < ns; i++) {
        const a = i * 2, b = a + 1, cc = a + 2, d = a + 3;
        idx.push(a, b, cc, b, d, cc);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    };
    if (c0 > 0.001) parts.push(orientDir(chordCap(c0), new THREE.Vector3(0, 0, -1)));
    if (c1 < 0.999) parts.push(orientDir(chordCap(c1), new THREE.Vector3(0, 0, 1)));
    const merged = mergeGeometries(parts);
    merged.computeVertexNormals();
    return merged;
  }

  centroid(s0, s1, c0, c1) {
    const p = { x: 0, y: 0, z: 0 };
    this.point((s0 + s1) / 2, (c0 + c1) / 2, 0, p);
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  // hinge axis endpoints at chord fraction c across [s0,s1]
  hinge(s0, s1, c) {
    const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
    this.point(s0, c, 0, a);
    this.point(s1, c, 0, b);
    return [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
  }
}

// Convert to non-indexed and flip any triangle whose normal opposes `dir`.
export function orientDir(geo, dir) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (n.dot(dir) < 0) {
      pos.setXYZ(i + 1, c.x, c.y, c.z);
      pos.setXYZ(i + 2, b.x, b.y, b.z);
      if (uv) {
        const u1 = uv.getX(i + 1), v1 = uv.getY(i + 1);
        uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
        uv.setXY(i + 2, u1, v1);
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

// Ensure triangle winding faces away from the given interior point (non-indexed geometry).
export function orientOutward(geo, center) {
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), m = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center);
    if (n.dot(m) < 0) {
      // swap b and c
      pos.setXYZ(i + 1, c.x, c.y, c.z);
      pos.setXYZ(i + 2, b.x, b.y, b.z);
      const uv = geo.getAttribute('uv');
      if (uv) {
        const u1 = uv.getX(i + 1), v1 = uv.getY(i + 1);
        uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2));
        uv.setXY(i + 2, u1, v1);
      }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Mirror a geometry across the YZ plane (x -> -x) keeping outward winding.
export function mirrorX(geo) {
  const g = geo.clone();
  g.scale(-1, 1, 1);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const nor = g.getAttribute('normal');
  if (g.index) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of [pos, uv, nor]) {
        if (!attr) continue;
        const s = attr.itemSize;
        for (let k = 0; k < s; k++) {
          const t = attr.array[(i + 1) * s + k];
          attr.array[(i + 1) * s + k] = attr.array[(i + 2) * s + k];
          attr.array[(i + 2) * s + k] = t;
        }
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

export function lathe(profile, segments = 24) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, segments);
  // Lathe revolves around Y; rotate so the axis runs along Z
  g.rotateX(Math.PI / 2);
  return g;
}

export { mergeGeometries };
