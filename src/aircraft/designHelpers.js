// Small helpers shared by the aircraft catalogues. Dimensions are metres, z
// measured from the nose tip towards the tail, x to the right, y up.

// Fuselage cross section: half-width, height above / depth below the centre
// line, centre-line height and superellipse exponents for the top / bottom.
export const S = (z, w, top, bot, y = 0, n = 2, nb) => ({ z, w, top, bot, y, n, nb: nb ?? n });

// Lifting-surface station: leading-edge point, chord and thickness ratio.
export const W = (x, y, z, chord, t = 0.045) => ({ x, y, z, chord, t });

// Tangent-ogive radome from the nose tip to a station (len, w, top, bot)
export const NOSE = (len, w, top, bot, y = 0, tipY = y, n = 2, nb = n, steps = 6) => {
  const out = [];
  const f = len / w; // fineness ratio in units of the radius
  const rho = (1 + f * f) / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * f;
    const r = Math.sqrt(Math.max(0, rho * rho - (f - x) * (f - x))) - (rho - 1);
    const k = i === 0 ? 0 : Math.min(1, Math.max(0, r));
    out.push(S(t * len, w * k, top * k, bot * k, tipY + (y - tipY) * t, n, nb));
  }
  return out;
};

// Blunt airliner nose: an elliptical profile that reaches the full cabin
// section at `len`, with the tip dropped below the centre line.
export const BLUNT_NOSE = (len, w, top, bot, tipY = -0.4, steps = 8, n = 2, nb = n) => {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = i === 0 ? 0 : Math.pow(Math.sin((t * Math.PI) / 2), 0.62);
    out.push(S(t * len, w * k, top * k, bot * k, tipY * (1 - t) * (1 - t), n, nb));
  }
  return out;
};
