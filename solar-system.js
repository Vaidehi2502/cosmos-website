/* =========================================================================
   COSMOS — Celestial Observatory
   Cinematic, interactive 3D solar system (Three.js, ES module).

   Design goals:
   - Procedural materials only: nothing here depends on a remote image, so the
     basic scene always renders (satisfies the "no fragile external URLs" rule).
   - Real 3D camera travel between an overview and a per-planet close-up, driven
     by a small, robust transition state machine (no CSS fakery).
   - Mouse, keyboard and touch selection; an accessible DOM overlay carries all
     meaningful text and controls; prefers-reduced-motion is respected.
   - Graceful fallback when WebGL is unavailable or init throws.
   ========================================================================= */

import * as THREE from "three";

/* ---------- Scientific + visual planet data -----------------------------
   Facts use consistent units and reliable NASA figures. Visual radius and
   orbit values are deliberately compressed for a coherent composition — the
   scene is NOT to scale, and a discreet note in the UI says so.            */
const SUN = { radius: 4.0, color: 0xffb347 };

const PLANETS = [
  {
    id: "mercury", name: "Mercury", color: 0x9c8a7a, type: "rocky",
    radius: 0.42, orbit: 9.5, revolve: 0.085, spin: 0.08, tilt: 0.001, initial: 0.4,
    classification: "Terrestrial (rocky) planet",
    diameter: "4,879 km", distance: "57.9 million km (0.39 AU)",
    day: "1,407.6 hours (58.6 Earth days)", year: "88 Earth days", moons: "0",
    blurb: "The swift innermost world — a sun-scorched, cratered rock with almost no atmosphere and the most extreme day-to-night temperature swing of any planet."
  },
  {
    id: "venus", name: "Venus", color: 0xd9b382, type: "rocky",
    radius: 0.95, orbit: 13.5, revolve: 0.062, spin: -0.02, tilt: 3.096, initial: 2.1,
    classification: "Terrestrial (rocky) planet",
    diameter: "12,104 km", distance: "108.2 million km (0.72 AU)",
    day: "5,832 hours (243 Earth days, retrograde)", year: "225 Earth days", moons: "0",
    blurb: "Earth's veiled twin in size, wrapped in a crushing carbon-dioxide atmosphere and sulphuric-acid cloud that traps heat into the hottest surface in the Solar System."
  },
  {
    id: "earth", name: "Earth", color: 0x2f6fb0, type: "earth",
    radius: 1.0, orbit: 17.5, revolve: 0.05, spin: 0.35, tilt: 0.409, initial: 0.0,
    classification: "Terrestrial (rocky) planet",
    diameter: "12,756 km", distance: "149.6 million km (1.00 AU)",
    day: "24 hours", year: "365.25 days", moons: "1",
    blurb: "The only world known to harbour life — a blue ocean planet with drifting white clouds, a protective magnetic field and a single large Moon."
  },
  {
    id: "mars", name: "Mars", color: 0xc1572f, type: "mars",
    radius: 0.53, orbit: 22, revolve: 0.04, spin: 0.34, tilt: 0.44, initial: 3.9,
    classification: "Terrestrial (rocky) planet",
    diameter: "6,792 km", distance: "227.9 million km (1.52 AU)",
    day: "24.7 hours", year: "687 Earth days", moons: "2",
    blurb: "The rust-red desert world of towering Olympus Mons and vast canyons — a cold, thin-aired planet and the prime target for future human exploration."
  },
  {
    id: "jupiter", name: "Jupiter", color: 0xcaa27a, type: "jupiter",
    radius: 2.55, orbit: 30, revolve: 0.022, spin: 0.9, tilt: 0.055, initial: 1.4,
    classification: "Gas giant",
    diameter: "142,984 km", distance: "778.5 million km (5.20 AU)",
    day: "9.9 hours", year: "11.9 Earth years", moons: "95",
    blurb: "The colossal gas giant, more massive than all other planets combined, banded by storm-driven cloud belts and crowned by the centuries-old Great Red Spot."
  },
  {
    id: "saturn", name: "Saturn", color: 0xd8c08a, type: "saturn",
    radius: 2.1, orbit: 39, revolve: 0.016, spin: 0.82, tilt: 0.466, initial: 5.2,
    classification: "Gas giant",
    diameter: "120,536 km", distance: "1,434 million km (9.58 AU)",
    day: "10.7 hours", year: "29.4 Earth years", moons: "146",
    blurb: "The jewel of the Solar System — a pale-gold gas giant encircled by a dazzling, broad ring system of ice and rock only tens of metres thick."
  },
  {
    id: "uranus", name: "Uranus", color: 0x8fd3d8, type: "uranus",
    radius: 1.5, orbit: 46.5, revolve: 0.011, spin: -0.5, tilt: 1.706, initial: 2.6,
    classification: "Ice giant",
    diameter: "51,118 km", distance: "2,871 million km (19.2 AU)",
    day: "17.2 hours", year: "84 Earth years", moons: "28",
    blurb: "The tilted ice giant that rolls on its side as it orbits, a serene pale-cyan world of water, methane and ammonia ices wrapped around a small rocky core."
  },
  {
    id: "neptune", name: "Neptune", color: 0x3b5bdb, type: "neptune",
    radius: 1.45, orbit: 53, revolve: 0.008, spin: 0.55, tilt: 0.494, initial: 4.4,
    classification: "Ice giant",
    diameter: "49,528 km", distance: "4,495 million km (30.1 AU)",
    day: "16.1 hours", year: "164.8 Earth years", moons: "16",
    blurb: "The windiest, most distant major planet — a deep-blue ice giant whipped by supersonic storms, discovered by mathematics before it was ever seen."
  }
];

const BY_ID = {};
PLANETS.forEach((p) => { BY_ID[p.id] = p; });

/* ---------- Small helpers ---------------------------------------------- */
const REDUCE_MOTION =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) {
    return false;
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Soft round sprite used for the sun glow and for stars. */
function radialTexture(inner, outer) {
  const s = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- Procedural realism toolkit ---------------------------------
   Tileable value-noise + fBm, colour ramps, and a per-planet map builder
   that outputs a colour map, a bump map (surface relief catches the light),
   and — for Earth — a roughness map so oceans glint while land stays matte.
   Everything is generated in-canvas, so there is still no remote dependency. */

// Seeded, horizontally-tileable 2D value noise.
function makeValueNoise(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = (seed >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const val = (xi, yi) => p[(p[xi & 255] + (yi & 255)) & 255] / 255;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  // perX = integer period on x so octaves tile seamlessly around the sphere.
  return function (x, y, perX) {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const x0 = ((X % perX) + perX) % perX, x1 = (x0 + 1) % perX;
    const u = fade(xf), v = fade(yf);
    const n00 = val(x0, Y), n10 = val(x1, Y), n01 = val(x0, Y + 1), n11 = val(x1, Y + 1);
    const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
    return a + v * (b - a);
  };
}

// Normalised fBm height field (0..1), tileable in x.
function heightField(w, h, noise, baseFreq, octaves) {
  const data = new Float32Array(w * h);
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < h; y++) {
    const vy = y / h;
    for (let x = 0; x < w; x++) {
      const vx = x / w;
      let amp = 1, freq = baseFreq, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * noise(vx * freq, vy * freq, freq);
        norm += amp; amp *= 0.5; freq *= 2; // freq stays integer → seamless
      }
      const val = sum / norm;
      data[y * w + x] = val;
      if (val < min) min = val; if (val > max) max = val;
    }
  }
  const inv = 1 / (max - min || 1);
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - min) * inv;
  return data;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function rampc(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      return mixc(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1));
    }
  }
  return stops[stops.length - 1][1];
}

const RAMPS = {
  mercury: [[0, [52, 47, 43]], [0.45, [120, 110, 99]], [0.75, [160, 150, 138]], [1, [205, 198, 186]]],
  mars:    [[0, [92, 38, 24]], [0.4, [150, 66, 38]], [0.65, [182, 98, 58]], [0.85, [205, 132, 88]], [1, [225, 170, 130]]],
  venus:   [[0, [150, 110, 56]], [0.4, [200, 162, 100]], [0.7, [230, 198, 140]], [1, [245, 226, 184]]],
  jupiter: [[0, [120, 86, 60]], [0.25, [205, 170, 128]], [0.5, [236, 214, 180]], [0.75, [190, 138, 96]], [1, [150, 104, 72]]],
  saturn:  [[0, [170, 146, 104]], [0.5, [224, 204, 160]], [1, [238, 224, 186]]],
  uranus:  [[0, [150, 205, 210]], [0.5, [180, 224, 227]], [1, [206, 238, 240]]],
  neptune: [[0, [28, 54, 128]], [0.5, [46, 86, 178]], [0.8, [66, 116, 206]], [1, [120, 165, 228]]]
};

// Stamp impact craters into colour + bump arrays (rocky worlds).
function addCraters(w, h, col, bump, count, seedRnd) {
  for (let i = 0; i < count; i++) {
    const cx = seedRnd() * w;
    const cy = (0.08 + seedRnd() * 0.84) * h;
    const rad = (seedRnd() * seedRnd() * 0.04 + 0.006) * w;
    const ri = Math.ceil(rad);
    for (let yy = -ri; yy <= ri; yy++) {
      const py = Math.round(cy + yy);
      if (py < 0 || py >= h) continue;
      for (let xx = -ri; xx <= ri; xx++) {
        const d = Math.sqrt(xx * xx + yy * yy);
        if (d > rad) continue;
        let px = Math.round(cx + xx); px = ((px % w) + w) % w;
        const t = d / rad;
        const shade = t < 0.78 ? -0.22 * (1 - t / 0.78) : 0.26 * (1 - (t - 0.78) / 0.22);
        const idx = py * w + px, ci = idx * 4;
        col[ci] = clamp255(col[ci] + shade * 130);
        col[ci + 1] = clamp255(col[ci + 1] + shade * 130);
        col[ci + 2] = clamp255(col[ci + 2] + shade * 130);
        bump[idx] = clamp255(bump[idx] + (t < 0.78 ? -55 * (1 - t / 0.78) : 70 * (1 - (t - 0.78) / 0.22)));
      }
    }
  }
}

// Build colour + bump (+ optional roughness) maps for one planet.
function buildPlanetMaps(planet, w, h, maxAniso) {
  const type = planet.type;
  const seed = planet.id.split("").reduce((a, c) => a + c.charCodeAt(0), 7) * 2654435761 >>> 0;
  const noise = makeValueNoise(seed);
  const noise2 = makeValueNoise(seed ^ 0x9e37);
  let sr = (seed || 1) >>> 0;
  const rnd = () => { sr ^= sr << 13; sr >>>= 0; sr ^= sr >> 17; sr ^= sr << 5; sr >>>= 0; return sr / 4294967296; };

  const col = new Uint8ClampedArray(w * h * 4);
  const bump = new Uint8ClampedArray(w * h);
  const gas = type === "jupiter" || type === "saturn" || type === "uranus" || type === "neptune";

  // Base fBm field: terrain for rocky worlds, turbulence for giants/clouds.
  const hf = heightField(w, h, noise, gas ? (type === "jupiter" ? 3 : 2) : 5, gas ? 5 : 6);
  const fine = heightField(w, h, noise2, gas ? 10 : 14, 4); // high-frequency detail

  let earthRough = null;
  if (type === "earth") earthRough = new Uint8ClampedArray(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const polar = Math.max(0, (Math.abs(v - 0.5) - 0.40) / 0.10); // 0..1 toward the poles
    for (let x = 0; x < w; x++) {
      const i = y * w + x, ci = i * 4;
      const hv = hf[i], fv = fine[i];
      let rgb, bumpV = hv * 255;

      if (gas) {
        // Latitude bands warped by turbulence → flowing cloud belts.
        const ribs = type === "jupiter" ? 16 : type === "saturn" ? 13 : type === "neptune" ? 7 : 5;
        const warp = (hv - 0.5) * (type === "jupiter" ? 0.18 : 0.10);
        const band = Math.sin((v + warp) * Math.PI * 2 * ribs);
        const shade = 0.5 + 0.5 * band;
        const base = rampc(RAMPS[type], v + (band * 0.06));
        const bright = 1 + (shade - 0.5) * (type === "jupiter" ? 0.5 : 0.28) + (fv - 0.5) * 0.14;
        rgb = [base[0] * bright, base[1] * bright, base[2] * bright];
        if (type === "jupiter") {
          const dx = (x / w - 0.70), dy = (v - 0.60);
          const grs = Math.exp(-((dx * dx) / 0.004 + (dy * dy) / 0.0016));
          rgb = mixc(rgb, [178, 74, 48], Math.min(1, grs * 1.1));
        }
        if (type === "neptune") {
          const dx = (x / w - 0.35), dy = (v - 0.62);
          const spot = Math.exp(-((dx * dx) / 0.003 + (dy * dy) / 0.0012));
          rgb = mixc(rgb, [18, 32, 86], Math.min(1, spot));
        }
        bumpV = 110 + (shade - 0.5) * 60; // gentle cloud relief
      } else if (type === "venus") {
        // Smooth, swirling sulphuric cloud deck (domain-warped).
        const sw = noise2((x / w) * 6 + hv * 2, v * 6, 6);
        rgb = rampc(RAMPS.venus, Math.min(1, hv * 0.6 + sw * 0.4 + 0.1));
        bumpV = 120 + (sw - 0.5) * 40;
      } else if (type === "earth") {
        const sea = 0.5;
        if (hv < sea) {
          const d = hv / sea;
          rgb = rampc([[0, [6, 24, 58]], [0.6, [16, 56, 110]], [1, [26, 92, 150]]], d);
          bumpV = 128; earthRough[i] = 48; // smooth, reflective ocean
        } else {
          const lt = (hv - sea) / (1 - sea);
          rgb = rampc([[0, [196, 186, 138]], [0.12, [96, 140, 66]], [0.4, [54, 104, 48]],
            [0.68, [96, 82, 54]], [0.86, [128, 120, 110]], [1, [236, 240, 244]]], lt);
          bumpV = 128 + lt * 110; earthRough[i] = 235;
        }
        // Ice caps near the poles.
        if (polar > 0) {
          const ice = Math.min(1, polar * (0.6 + fv * 0.6));
          rgb = mixc(rgb, [238, 244, 250], ice);
          if (ice > 0.5) earthRough[i] = 180;
        }
      } else {
        // Rocky worlds: Mercury (grey) and Mars (rust) with albedo mottling.
        const key = type === "mars" ? "mars" : "mercury";
        rgb = rampc(RAMPS[key], hv);
        const mott = (fv - 0.5) * (type === "mars" ? 0.5 : 0.35);
        rgb = [rgb[0] * (1 + mott), rgb[1] * (1 + mott), rgb[2] * (1 + mott)];
        if (type === "mars" && polar > 0) rgb = mixc(rgb, [232, 236, 240], Math.min(1, polar * 1.2));
        bumpV = hv * 200 + fv * 55;
      }

      col[ci] = clamp255(rgb[0]); col[ci + 1] = clamp255(rgb[1]);
      col[ci + 2] = clamp255(rgb[2]); col[ci + 3] = 255;
      bump[i] = clamp255(bumpV);
    }
  }

  if (type === "mercury") addCraters(w, h, col, bump, Math.round(w / 16), rnd);
  if (type === "mars") addCraters(w, h, col, bump, Math.round(w / 34), rnd);

  const map = canvasTexture(col, w, h, true, maxAniso);
  const bumpTex = canvasTexture(gray(bump), w, h, false, maxAniso);
  const out = { map, bump: bumpTex, col, w, h };
  if (earthRough) out.rough = canvasTexture(gray(earthRough), w, h, false, maxAniso);
  return out;
}

// Expand a grayscale array to RGBA.
function gray(arr) {
  const out = new Uint8ClampedArray(arr.length * 4);
  for (let i = 0; i < arr.length; i++) { const g = arr[i]; out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g; out[i * 4 + 3] = 255; }
  return out;
}

function canvasTexture(rgba, w, h, srgb, maxAniso) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = maxAniso || 1;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Semi-transparent cloud layer for Earth.
function cloudTexture(w, h, maxAniso) {
  const noise = makeValueNoise(987654);
  const field = heightField(w, h, noise, 5, 6);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const edge = 1 - Math.max(0, (Math.abs(y / h - 0.5) - 0.46) / 0.04); // thin out at poles
    for (let x = 0; x < w; x++) {
      const i = y * w + x, c = field[i];
      const a = Math.max(0, c - 0.52) / 0.48; // only the densest fBm becomes cloud
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = clamp255(a * 255 * Math.max(0, edge));
    }
  }
  return canvasTexture(rgba, w, h, true, maxAniso);
}

/* ---------- Static "celestial card" thumbnails (index.html) -------------
   The three featured cards (Sun / Earth / Saturn) were flat CSS gradients.
   Here we render each as a real shaded, textured sphere with a tiny software
   rasteriser that samples the same equirectangular surface the 3D scene uses,
   so the cards match the hero. No extra WebGL context; pure 2D canvas. */

// Glowing solar granulation surface (equirectangular).
function sunColorField(w, h) {
  const a = heightField(w, h, makeValueNoise(7), 8, 5);
  const b = heightField(w, h, makeValueNoise(777), 22, 3);
  const col = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, a[i] * 0.75 + b[i] * 0.35);
    const rgb = rampc([[0, [175, 55, 10]], [0.4, [240, 130, 26]], [0.7, [255, 198, 82]], [1, [255, 246, 205]]], t);
    col[i * 4] = rgb[0]; col[i * 4 + 1] = rgb[1]; col[i * 4 + 2] = rgb[2]; col[i * 4 + 3] = 255;
  }
  return col;
}

// Rasterise an equirectangular colour map onto a lit sphere disc, writing
// RGBA straight into `d` (a reused ImageData buffer, so rotation needs no
// per-frame allocation). `opts.rot` shifts the longitude under the fixed light.
function renderSphere(d, size, col, tw, th, opts) {
  const R = size / 2;
  const L = opts.light || [-0.45, 0.5, 0.78];
  const Ll = Math.hypot(L[0], L[1], L[2]) || 1;
  const lx = L[0] / Ll, ly = L[1] / Ll, lz = L[2] / Ll;
  const ambient = opts.ambient != null ? opts.ambient : 0.14;
  const rot = opts.rot || 0, rim = opts.rim || null, spec = opts.spec || 0;
  const edge = 1.5 / R;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - R + 0.5) / (R - 1), ny = -(y - R + 0.5) / (R - 1);
      const rr = Math.sqrt(nx * nx + ny * ny);
      const o = (y * size + x) * 4;
      if (rr >= 1) { d[o + 3] = 0; continue; }
      const nz = Math.sqrt(1 - rr * rr);
      const u = 0.5 + Math.atan2(nx, nz) / (2 * Math.PI) + rot;
      const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const tx = (((u % 1) + 1) % 1) * tw | 0;
      const ty = Math.min(th - 1, Math.max(0, (v * th) | 0));
      const ti = (ty * tw + tx) * 4;
      let diff = nx * lx + ny * ly + nz * lz; if (diff < 0) diff = 0;
      let lf = ambient + (1 - ambient) * diff;
      if (opts.limbDark) lf *= 0.58 + 0.42 * nz;
      let r = col[ti] * lf, g = col[ti + 1] * lf, b = col[ti + 2] * lf;
      if (spec > 0 && diff > 0) {
        const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz) || 1;
        let s = (nx * hx + ny * hy + nz * hz) / hl; if (s < 0) s = 0;
        s = Math.pow(s, 22) * spec * 255; r += s; g += s; b += s;
      }
      if (rim) {
        const rf = Math.pow(1 - nz, 3) * Math.max(0, diff * 0.8 + 0.25);
        r += rim[0] * rf; g += rim[1] * rf; b += rim[2] * rf;
      }
      d[o] = clamp255(r); d[o + 1] = clamp255(g); d[o + 2] = clamp255(b);
      d[o + 3] = rr > 1 - edge ? clamp255((1 - rr) / edge * 255) : 255;
    }
  }
}

function initCelestialCards() {
  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const W = 256, H = 128;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cap = isMobile ? 130 : 190; // render resolution (upscaled by CSS)

  const defs = [
    { sel: ".orb-sun", kind: "sun", speed: 0.016, opts: { ambient: 1, limbDark: true } },
    { sel: ".orb-earth", kind: "earth", speed: 0.03, opts: { ambient: 0.16, rim: [70, 150, 255], spec: 0.5 } },
    { sel: ".orb-saturn", kind: "saturn", speed: 0.02, opts: { ambient: 0.18 } }
  ];

  const cards = [];
  defs.forEach((def) => {
    const orb = document.querySelector(def.sel);
    if (!orb) return;
    const size = Math.min(cap, Math.round((orb.clientWidth || 120) * dpr) || 240);

    // Surface colour map (generated once).
    let col, tw = W, th = H;
    if (def.kind === "sun") {
      col = sunColorField(W, H);
    } else {
      col = buildPlanetMaps(BY_ID[def.kind], W, H, 1).col;
      if (def.kind === "earth") {
        col = col.slice(); // composite drifting clouds, matching the hero
        const cn = heightField(W, H, makeValueNoise(987654), 5, 6);
        for (let yy = 0; yy < H; yy++) {
          const ef = 1 - Math.max(0, (Math.abs(yy / H - 0.5) - 0.46) / 0.04);
          for (let xx = 0; xx < W; xx++) {
            const i = yy * W + xx;
            const a = Math.max(0, cn[i] - 0.52) / 0.48 * Math.max(0, ef) * 0.9;
            const c = i * 4;
            col[c] = clamp255(col[c] + (255 - col[c]) * a);
            col[c + 1] = clamp255(col[c + 1] + (255 - col[c + 1]) * a);
            col[c + 2] = clamp255(col[c + 2] + (255 - col[c + 2]) * a);
          }
        }
      }
    }

    // Swap the CSS gradient for a live canvas that fills the circular orb.
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    cv.className = "orb-canvas";
    cv.setAttribute("aria-hidden", "true");
    orb.style.background = "transparent";
    orb.appendChild(cv);

    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(size, size);
    const opts = Object.assign({ rot: def.kind === "saturn" ? -0.08 : 0.17 }, def.opts);
    const card = { ctx, img, col, tw, th, size, opts, speed: def.speed };
    renderSphere(img.data, size, col, tw, th, opts); // initial frame
    ctx.putImageData(img, 0, 0);
    cards.push(card);
  });

  if (!cards.length || reduce) return; // static frame only under reduced motion

  // Shared, throttled loop; paused while the cards are off-screen.
  let raf = 0, last = 0, visible = true;
  function tick(t) {
    if (!last) last = t;
    if (t - last >= 40) { // ~25 fps is plenty for a slow spin
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      for (const c of cards) {
        c.opts.rot += c.speed * dt;
        renderSphere(c.img.data, c.size, c.col, c.tw, c.th, c.opts);
        c.ctx.putImageData(c.img, 0, 0);
      }
    }
    raf = visible ? requestAnimationFrame(tick) : 0;
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function stop() { visible = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  const grid = document.querySelector(".celestial-grid");
  if (grid && "IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting && !document.hidden;
      if (visible) start(); else stop();
    }, { threshold: 0.01 }).observe(grid);
  } else {
    visible = true; start();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else { visible = true; start(); }
  });
}

/* ---------- Milky Way galaxy backdrop ----------------------------------
   A vanilla port of a GPGPU spiral-galaxy effect: two THREE.Points layers
   (sharp stars + soft nebula "smoke") with a procedural spiral distribution
   and a core→gold→orange colour gradient. Differential orbital rotation is
   done statelessly in the vertex shader (angle = omega * time), so there is
   no ping-pong render target — cheaper and widely compatible. Sits far behind
   the solar system as a tilted backdrop. */

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const GALAXY_STAR_VERT = /* glsl */ `
precision highp float;
uniform float uTime, uSpeed, uPixelRatio, uParticleSize;
attribute float aRadiusFrac, aSeed, aColor, aOrb, aPhase;
varying float vRadiusFrac, vPhase, vSeed, vColor;
void main(){
  vec3 p = position;
  float r = length(p.xy) + 0.0001;
  float omega = aOrb / (r + 0.28);
  float ang = omega * uTime * uSpeed;
  float c = cos(ang), s = sin(ang);
  vec3 rp = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
  vRadiusFrac = aRadiusFrac; vSeed = aSeed; vColor = aColor;
  vPhase = fract(aPhase + uTime * 0.03);
  vec4 mvPos = modelViewMatrix * vec4(rp, 1.0);
  float depth = -mvPos.z;
  float isSpecial = step(0.990, aColor);
  float sizeFactor = pow(1.0 - aRadiusFrac, 1.3);
  float normalSz = mix(0.5, 8.0, sizeFactor) * (0.7 + aSeed * 0.5);
  float specialSz = mix(7.2, 12.0, aSeed);
  float sz = mix(normalSz, specialSz, isSpecial) * uParticleSize;
  sz *= (420.0 / max(depth, 0.1)) * uPixelRatio;
  float maxSize = mix(8.0 * (2.0 + aSeed), 12.0 * (2.0 + aSeed), isSpecial) * uParticleSize;
  gl_PointSize = clamp(sz, 0.4, maxSize);
  gl_Position = projectionMatrix * mvPos;
}
`;

const GALAXY_STAR_FRAG = /* glsl */ `
precision highp float;
varying float vRadiusFrac, vPhase, vSeed, vColor;
uniform vec3 uCoreColor, uAccentColor, uOuterColor;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv) * 2.0;
  if(r > 1.0) discard;
  float cp = exp(-r * r * 14.0);
  float halo = exp(-r * r * 3.0) * 0.30;
  float disc = clamp(cp + halo, 0.0, 1.0);
  float dispersion = pow(1.0 - vRadiusFrac, 1.05);
  float coreBulge = smoothstep(0.22, 0.0, vRadiusFrac) * 0.55;
  float intensity = clamp(dispersion + coreBulge, 0.0, 1.0);
  float tRate = 2.5 + vSeed * 4.5;
  float twinkle = 0.78 + 0.22 * sin(vPhase * 6.28318 * tRate + vSeed * 17.3);
  intensity *= twinkle;
  float isSpecial = step(0.990, vColor);
  vec3 nCore = uCoreColor * 1.15;
  vec3 nMid = mix(uCoreColor, uAccentColor, 0.7);
  vec3 nOuter = uOuterColor * 0.9;
  vec3 normalCol = mix(nCore, nMid, smoothstep(0.0, 0.42, vRadiusFrac));
  normalCol = mix(normalCol, nOuter, smoothstep(0.42, 1.0, vRadiusFrac));
  float ss = fract((vColor - 0.990) / 0.010 * 5.0) * 5.0;
  vec3 s0 = uAccentColor * 1.1;
  vec3 s1 = mix(uAccentColor, uCoreColor, 0.35) * 1.1;
  vec3 s2 = mix(uOuterColor, uCoreColor, 0.2) * 1.1;
  vec3 s3 = uOuterColor * 1.1;
  vec3 s4 = mix(uAccentColor, uOuterColor, 0.5) * 1.1;
  vec3 specialCol;
  if(ss < 1.0) specialCol = mix(s0, s1, ss);
  else if(ss < 2.0) specialCol = mix(s1, s2, ss - 1.0);
  else if(ss < 3.0) specialCol = mix(s2, s3, ss - 2.0);
  else if(ss < 4.0) specialCol = mix(s3, s4, ss - 3.0);
  else specialCol = mix(s4, s0, ss - 4.0);
  intensity = mix(intensity, clamp(intensity * 2.5, 0.0, 1.0), isSpecial);
  vec3 col = mix(normalCol, specialCol, isSpecial);
  float alpha = disc * intensity * 0.90;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const GALAXY_SMOKE_VERT = /* glsl */ `
precision highp float;
uniform float uTime, uSpeed, uPixelRatio, uParticleSize;
attribute float aRadiusFrac, aSeed, aOrb, aPhase;
varying float vRadiusFrac, vPhase, vSeed;
void main(){
  vec3 p = position;
  float r = length(p.xy) + 0.0001;
  float omega = aOrb / (r + 0.35);
  float ang = omega * uTime * uSpeed;
  float c = cos(ang), s = sin(ang);
  vec3 rp = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
  vRadiusFrac = aRadiusFrac; vSeed = aSeed;
  vPhase = fract(aPhase + uTime * 0.02);
  vec4 mvPos = modelViewMatrix * vec4(rp, 1.0);
  float depth = -mvPos.z;
  float sizeFactor = mix(0.6, 1.0, 1.0 - aRadiusFrac);
  float sz = 92.0 * uParticleSize * sizeFactor * (0.7 + aSeed * 0.6);
  sz *= (420.0 / max(depth, 0.1)) * uPixelRatio;
  gl_PointSize = clamp(sz, 2.0, 92.0 * uParticleSize * 3.0);
  gl_Position = projectionMatrix * mvPos;
}
`;

const GALAXY_SMOKE_FRAG = /* glsl */ `
precision highp float;
varying float vRadiusFrac, vPhase, vSeed;
uniform vec3 uCoreColor, uAccentColor, uOuterColor;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  uv.x *= 2.1; uv.y *= 0.72;
  float r = length(uv) * 2.0;
  if(r > 1.0) discard;
  float core = exp(-dot(uv, uv) * 3.4);
  float halo = exp(-dot(uv, uv) * 0.75) * 0.9;
  float shape = clamp(core + halo, 0.0, 1.0);
  float streak = 0.72 + 0.28 * smoothstep(0.42, 0.0, abs(uv.y));
  float radialFade = pow(1.0 - vRadiusFrac, 0.72);
  float coreBright = smoothstep(0.32, 0.0, vRadiusFrac) * 0.22;
  float intensity = clamp(radialFade + coreBright, 0.0, 1.0);
  float flow = 0.88 + 0.12 * sin(vPhase * 6.28318 + vSeed * 8.0);
  intensity *= flow * streak;
  vec3 cCore = uCoreColor * 1.25;
  vec3 cCyan = uAccentColor * 1.05;
  vec3 cMagenta = mix(uAccentColor, uOuterColor, 0.35) * 1.1;
  vec3 cViolet = mix(uCoreColor, uAccentColor, 0.45) * 0.95;
  vec3 cOuter = uOuterColor * 0.75;
  float cn = fract(vSeed * 13.371 + vRadiusFrac * 2.71);
  vec3 col = mix(cCore, cCyan, smoothstep(0.0, 0.28, vRadiusFrac));
  col = mix(col, cMagenta, smoothstep(0.18, 0.52, vRadiusFrac + (cn - 0.5) * 0.18));
  col = mix(col, cViolet, smoothstep(0.42, 0.78, vRadiusFrac + (cn - 0.5) * 0.22));
  col = mix(col, cOuter, smoothstep(0.72, 1.0, vRadiusFrac));
  float alpha = shape * intensity * 0.05;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

function buildGalaxyStarGeo(S, seed) {
  const total = S * S;
  const pos = new Float32Array(total * 3);
  const rfrac = new Float32Array(total), seeds = new Float32Array(total);
  const colors = new Float32Array(total), orb = new Float32Array(total), phase = new Float32Array(total);
  const rand = mulberry32(seed);
  const maxRadius = 3.5, holeRadius = 1.2, holeEdgeBand = 1.5, arms = 1,
    spiralTightness = 10.75, armWidth = 0.38, diskHeight = 0.5, coreRadius = 0.22, coreHeight = 0.28;
  for (let i = 0; i < total; i++) {
    let r, inBulge = false;
    if (rand() < 0.18) { r = Math.abs(rand() + rand() + rand() - 1.5) * coreRadius * 1.1; inBulge = true; }
    else { r = -Math.log(1 - rand() * 0.9999) * (maxRadius * 0.35); r = Math.min(r, maxRadius); }
    let inHoleEdge = false;
    if (r < holeRadius) { r = holeRadius + rand() * holeEdgeBand; inBulge = false; inHoleEdge = true; }
    const radiusFrac = Math.min(r / maxRadius, 1);
    const armIdx = Math.floor(rand() * arms);
    const armBase = (armIdx / arms) * Math.PI * 2;
    let g = (rand() + rand() + rand()) / 3 - 0.5; g *= 2;
    const scatter = armWidth * r * (inBulge ? 3 : 1);
    const theta = inHoleEdge ? (rand() * Math.PI * 2 + g * (armWidth * holeRadius * 3))
      : (armBase + r * spiralTightness + g * scatter);
    let gz = (rand() + rand() + rand()) / 3 - 0.5; gz *= 2;
    const z = gz * (inBulge ? coreHeight : diskHeight * (0.5 + radiusFrac * 0.5));
    pos[i * 3] = r * Math.cos(theta); pos[i * 3 + 1] = r * Math.sin(theta); pos[i * 3 + 2] = z;
    rfrac[i] = radiusFrac; seeds[i] = rand(); colors[i] = rand();
    orb[i] = inBulge ? 0.55 + rand() * 0.15 : 0.30 + radiusFrac * 0.22 + rand() * 0.08;
    phase[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRadiusFrac", new THREE.BufferAttribute(rfrac, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 1));
  geo.setAttribute("aOrb", new THREE.BufferAttribute(orb, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  return geo;
}

function buildGalaxySmokeGeo(S, seed) {
  const total = S * S;
  const pos = new Float32Array(total * 3);
  const rfrac = new Float32Array(total), seeds = new Float32Array(total);
  const orb = new Float32Array(total), phase = new Float32Array(total);
  const rand = mulberry32(seed);
  const maxRadius = 3.5, holeRadius = 1.2, holeEdgeBand = 1.5, arms = 2,
    spiralTightness = 10.75, armWidth = 0.9, diskHeight = 0.18, orbSpeedBase = 0.2;
  for (let i = 0; i < total; i++) {
    let r = -Math.log(1 - rand() * 0.9999) * (maxRadius * 0.34); r = Math.min(r, maxRadius);
    let inHoleEdge = false;
    if (r < holeRadius) { r = holeRadius + rand() * holeEdgeBand; inHoleEdge = true; }
    const radiusFrac = Math.min(r / maxRadius, 1);
    const armIdx = Math.floor(rand() * arms);
    const armBase = (armIdx / arms) * Math.PI * 2;
    let g = (rand() + rand() + rand()) / 3 - 0.5; g *= 2;
    const scatter = armWidth * r;
    const theta = inHoleEdge ? (rand() * Math.PI * 2 + g * (armWidth * holeRadius * 2))
      : (armBase + r * spiralTightness + g * scatter);
    let gz = (rand() + rand() + rand()) / 3 - 0.5; gz *= 2;
    const z = gz * diskHeight * (0.6 + radiusFrac * 0.4);
    pos[i * 3] = r * Math.cos(theta); pos[i * 3 + 1] = r * Math.sin(theta); pos[i * 3 + 2] = z;
    rfrac[i] = radiusFrac; seeds[i] = rand();
    orb[i] = orbSpeedBase + radiusFrac * 0.08 + rand() * 0.04; phase[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRadiusFrac", new THREE.BufferAttribute(rfrac, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aOrb", new THREE.BufferAttribute(orb, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  return geo;
}

function createGalaxy(isMobile) {
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  const core = new THREE.Color("#f5f5ff");
  const accent = new THREE.Color("#ffe6ad");
  const outer = new THREE.Color("#e05c12");
  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSpeed: { value: 0.25 }, uPixelRatio: { value: pr },
      uParticleSize: { value: isMobile ? 1.5 : 1.9 },
      uCoreColor: { value: core }, uAccentColor: { value: accent }, uOuterColor: { value: outer }
    },
    vertexShader: GALAXY_STAR_VERT, fragmentShader: GALAXY_STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSpeed: { value: 0.25 }, uPixelRatio: { value: pr },
      uParticleSize: { value: isMobile ? 0.7 : 0.95 },
      uCoreColor: { value: core }, uAccentColor: { value: accent }, uOuterColor: { value: outer }
    },
    vertexShader: GALAXY_SMOKE_VERT, fragmentShader: GALAXY_SMOKE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const starGeo = buildGalaxyStarGeo(isMobile ? 170 : 300, 91);
  const smokeGeo = buildGalaxySmokeGeo(isMobile ? 36 : 48, 7777);

  const inner = new THREE.Group();
  const d = THREE.MathUtils.degToRad;
  inner.rotation.set(d(28), 0, d(-5)); // the galaxy's own disc tilt
  inner.add(new THREE.Points(smokeGeo, smokeMat));
  inner.add(new THREE.Points(starGeo, starMat));

  const group = new THREE.Group();
  group.add(inner);
  group.position.set(-150, 95, -200);          // far behind, upper-left
  group.scale.setScalar(isMobile ? 62 : 95);
  group.rotation.set(d(52), d(-20), d(12));
  group.renderOrder = -1;

  return {
    group,
    update(elapsed) { starMat.uniforms.uTime.value = elapsed; smokeMat.uniforms.uTime.value = elapsed; },
    dispose() { starGeo.dispose(); smokeGeo.dispose(); starMat.dispose(); smokeMat.dispose(); }
  };
}

/* Ring texture: concentric translucent bands fading at the edges. */
function ringTexture(strong) {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  for (let r = 0; r < s / 2; r++) {
    const t = r / (s / 2);
    const band = 0.5 + 0.5 * Math.sin(t * (strong ? 60 : 30) + Math.random() * 0.5);
    const edge = Math.sin(t * Math.PI); // fade both edges
    const a = (strong ? 0.55 : 0.28) * band * edge;
    ctx.strokeStyle = "rgba(226,214,184," + a.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* =========================================================================
   Main entry point
   ========================================================================= */
export function initObservatory() {
  const canvas = document.getElementById("solar-canvas");
  const stage = document.getElementById("observatory-stage");
  if (!canvas || !stage) return; // not the landing page

  const intro = document.getElementById("observatory-intro");
  const panel = document.getElementById("planet-panel");
  const loading = document.getElementById("observatory-loading");
  const fallback = document.getElementById("observatory-fallback");
  const statusEl = document.getElementById("observatory-status");
  const labelLayer = document.getElementById("observatory-labels");
  const pickerButtons = Array.prototype.slice.call(
    document.querySelectorAll("[data-planet]")
  );

  function announce(msg) { if (statusEl) statusEl.textContent = msg; }

  function showFallback(reason) {
    if (canvas) canvas.hidden = true;
    if (loading) loading.hidden = true;
    if (labelLayer) labelLayer.hidden = true;
    if (fallback) fallback.hidden = false;
    // The picker chips and the "select a planet" hint need the 3D scene to do
    // anything, so hide them here and let the static fallback links take over.
    var picker = document.querySelector(".observatory-picker");
    var hint = document.querySelector(".observatory-hint");
    if (picker) picker.style.display = "none";
    if (hint) hint.style.display = "none";
    if (reason) console.warn("[Observatory] 3D disabled:", reason);
  }

  if (!hasWebGL()) { showFallback("WebGL is not available."); return; }

  try {
    runScene({
      canvas, stage, intro, panel, loading, fallback,
      labelLayer, pickerButtons, announce
    });
  } catch (err) {
    showFallback(err);
  }
}

/* ------------------------------------------------------------------------ */
function runScene(ui) {
  const { canvas, stage, intro, panel, loading, labelLayer, pickerButtons, announce } = ui;

  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 700;

  /* ---- Renderer ---- */
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, alpha: false, powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Cinematic filmic response + a touch of exposure for richer planet lighting.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const TEX_W = isMobile ? 512 : 1024;
  const TEX_H = TEX_W / 2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.FogExp2(0x05070b, 0.0016);

  const camera = new THREE.PerspectiveCamera(
    52, stage.clientWidth / stage.clientHeight, 0.1, 4000
  );

  /* Overview camera pose. */
  const OVERVIEW_POS = new THREE.Vector3(0, 40, 94);
  const OVERVIEW_TARGET = new THREE.Vector3(0, 1.5, 0);
  camera.position.copy(OVERVIEW_POS);
  const camTarget = OVERVIEW_TARGET.clone();
  camera.lookAt(camTarget);

  /* ---- Lighting ---- */
  // Strong sun with a crisp terminator; only a faint cool fill so night sides
  // stay dark and the shading reads as a real lit sphere, not a flat disc.
  const sunLight = new THREE.PointLight(0xfff4e0, 4.0, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x2a3a58, 0.22));

  /* ---- Sun ---- */
  const sunGroup = new THREE.Group();
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0, toneMapped: false });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius, 48, 48), sunMat);
  sunGroup.add(sunMesh);
  const glowTex = radialTexture("rgba(255,224,170,0.95)", "rgba(255,150,40,0.35)");
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc56b, transparent: true, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glow.scale.set(SUN.radius * 7, SUN.radius * 7, 1);
  sunGroup.add(glow);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff8a3c, transparent: true, opacity: 0.6, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  corona.scale.set(SUN.radius * 13, SUN.radius * 13, 1);
  sunGroup.add(corona);
  scene.add(sunGroup);

  /* ---- Planets ---- */
  const selectable = [];       // meshes for raycasting
  const built = [];            // runtime planet records
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);
  const sharedRingTex = ringTexture(true);
  const faintRingTex = ringTexture(false);

  // Per-type surface material tuning.
  const MAT = {
    mercury: { roughness: 1.0, bump: 0.05 },
    venus:   { roughness: 0.95, bump: 0.012 },
    earth:   { roughness: 0.85, bump: 0.035 },
    mars:    { roughness: 1.0, bump: 0.045 },
    jupiter: { roughness: 0.9, bump: 0.01 },
    saturn:  { roughness: 0.9, bump: 0.01 },
    uranus:  { roughness: 0.85, bump: 0.008 },
    neptune: { roughness: 0.85, bump: 0.01 }
  };

  PLANETS.forEach((p) => {
    const seg = isMobile ? 48 : 96;
    const pivot = new THREE.Group();                 // revolves around the Sun
    pivot.rotation.y = p.initial;
    const holder = new THREE.Group();                // sits at orbit radius
    holder.position.x = p.orbit;
    const tiltG = new THREE.Group();                 // axial tilt
    tiltG.rotation.z = p.tilt;

    const maps = buildPlanetMaps(p, TEX_W, TEX_H, maxAniso);
    const cfg = MAT[p.type] || { roughness: 0.9, bump: 0.02 };
    const matParams = {
      map: maps.map, bumpMap: maps.bump, bumpScale: cfg.bump,
      roughness: cfg.roughness, metalness: 0.0
    };
    if (maps.rough) { matParams.roughnessMap = maps.rough; matParams.metalness = 0.05; }
    const mat = new THREE.MeshStandardMaterial(matParams);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, seg, seg), mat);
    mesh.userData.planetId = p.id;
    tiltG.add(mesh);
    selectable.push(mesh);

    let cloudMesh = null;
    if (p.type === "earth") {
      // Rotating cloud layer.
      cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius * 1.012, seg, seg),
        new THREE.MeshStandardMaterial({
          map: cloudTexture(TEX_W, TEX_H, maxAniso), transparent: true,
          roughness: 1.0, metalness: 0.0, depthWrite: false
        })
      );
      tiltG.add(cloudMesh);
      // Blue atmospheric rim (fresnel-like additive backside shell).
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius * 1.045, seg, seg),
        new THREE.MeshBasicMaterial({
          color: 0x6ab8ff, transparent: true, opacity: 0.28,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      tiltG.add(atmo);
    }

    // Saturn's broad rings / Uranus's subtle rings.
    if (p.type === "saturn" || p.type === "uranus") {
      const strong = p.type === "saturn";
      const inner = p.radius * (strong ? 1.3 : 1.5);
      const outer = p.radius * (strong ? 2.3 : 1.9);
      const ringGeo = new THREE.RingGeometry(inner, outer, 96);
      // Map the radial texture across the ring.
      const pos = ringGeo.attributes.position;
      const v3 = new THREE.Vector3();
      const uv = ringGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const d = (v3.length() - inner) / (outer - inner);
        uv.setXY(i, d, d);
      }
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        map: strong ? sharedRingTex : faintRingTex, side: THREE.DoubleSide,
        transparent: true, opacity: strong ? 0.9 : 0.5, depthWrite: false
      }));
      ring.rotation.x = Math.PI / 2;
      tiltG.add(ring);
    }

    holder.add(tiltG);
    pivot.add(holder);
    orbitGroup.add(pivot);

    // Orbit guide line.
    const curve = new THREE.EllipseCurve(0, 0, p.orbit, p.orbit, 0, Math.PI * 2);
    const pts = curve.getPoints(128).map((pt) => new THREE.Vector3(pt.x, 0, pt.y));
    const orbitLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x3a4a6b, transparent: true, opacity: 0.5 })
    );
    scene.add(orbitLine);

    built.push({ data: p, pivot, holder, tiltG, mesh, cloudMesh, orbitLine, radius: p.radius });
  });

  /* ---- Starfield ---- */
  const starCount = isMobile ? 1400 : 2800;
  const starGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(starCount * 3);
  const sCol = new Float32Array(starCount * 3);
  const tmpC = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    const r = 500 + Math.random() * 900;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    sPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    sPos[i * 3 + 1] = r * Math.cos(ph);
    sPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const warm = Math.random();
    tmpC.setHSL(warm > 0.8 ? 0.08 : 0.6, 0.25, 0.6 + Math.random() * 0.4);
    sCol[i * 3] = tmpC.r; sCol[i * 3 + 1] = tmpC.g; sCol[i * 3 + 2] = tmpC.b;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 2.4, map: radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0.4)"),
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    sizeAttenuation: true, blending: THREE.AdditiveBlending
  }));
  scene.add(stars);

  /* ---- Milky Way galaxy backdrop ---- */
  const galaxy = createGalaxy(isMobile);
  scene.add(galaxy.group);

  /* ---- Labels (projected DOM) ---- */
  const labels = {};
  if (labelLayer) {
    labelLayer.innerHTML = "";
    built.forEach((b) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "planet-label";
      el.dataset.planet = b.data.id;
      el.textContent = b.data.name;
      el.setAttribute("aria-label", "Focus on " + b.data.name);
      el.tabIndex = 0; // keyboard-selectable; tabIndex is managed per-frame below
      el.addEventListener("click", () => selectPlanet(b.data.id, el));
      labelLayer.appendChild(el);
      labels[b.data.id] = el;
    });
  }

  /* =======================================================================
     Camera transition state machine
     ===================================================================== */
  const DUR = REDUCE_MOTION ? 0.45 : 1.7;
  const cam = {
    mode: "overview",     // overview | transition | focus
    nextMode: "overview", // what we become when a transition ends
    focusId: null,
    t: 0, dur: DUR,
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3()
  };
  const orbitsFrozen = () => cam.focusId !== null;

  const _p = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _side = new THREE.Vector3();

  function focusPose(b) {
    b.holder.getWorldPosition(_p);
    _dir.copy(_p); _dir.y = 0;                 // outward (anti-sun) in the ecliptic
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, 1);
    _dir.normalize();
    _side.set(-_dir.z, 0, _dir.x);             // perpendicular in the ecliptic
    const dist = b.radius * 3.0 + 2.6;
    // Lean toward the sunlit side (-_dir) and around to one side so the camera
    // frames a lit 3/4 face with the terminator visible — not the night side.
    const offset = new THREE.Vector3()
      .addScaledVector(_dir, -0.5)
      .addScaledVector(_side, 0.85)
      .addScaledVector(new THREE.Vector3(0, 1, 0), 0.42)
      .normalize();
    const pos = _p.clone().addScaledVector(offset, dist);
    return { pos, target: _p.clone() };
  }

  function beginTransition(toPos, toTarget, nextMode, focusId) {
    cam.fromPos.copy(camera.position);
    cam.fromTarget.copy(camTarget);
    cam.toPos.copy(toPos);
    cam.toTarget.copy(toTarget);
    cam.t = 0;
    cam.dur = DUR;
    cam.mode = "transition";
    cam.nextMode = nextMode;
    cam.focusId = focusId; // set immediately so orbits freeze at the chosen pose
    kick();
  }

  function selectPlanet(id, trigger) {
    const b = built.find((x) => x.data.id === id);
    if (!b) return;
    const pose = focusPose(b);
    beginTransition(pose.pos, pose.target, "focus", id);
    setPickerPressed(id);
    if (intro) intro.classList.add("is-dimmed");
    if (panel) panel.hidden = true; // hide until the camera arrives
    if (labelLayer) labelLayer.classList.add("is-focusing");
    announce("Travelling to " + b.data.name + "…");
    // restore focus to the trigger-less panel after arrival; keep trigger ref
    cam._trigger = trigger || null;
  }

  function returnToOverview() {
    beginTransition(OVERVIEW_POS, OVERVIEW_TARGET, "overview", null);
    if (panel) panel.hidden = true;
    if (intro) intro.classList.remove("is-dimmed");
    if (labelLayer) labelLayer.classList.remove("is-focusing");
    setPickerPressed(null);
    announce("Returning to the solar system overview.");
  }

  function onArrive() {
    cam.mode = cam.nextMode;
    if (cam.mode === "focus" && cam.focusId) {
      showPanel(BY_ID[cam.focusId]);
      announce("Now viewing " + BY_ID[cam.focusId].name + ". Information panel shown.");
    } else {
      announce("Solar system overview restored. Select a planet to begin.");
      // Return keyboard focus to the planet that was being viewed, if any.
    }
  }

  /* =======================================================================
     Info panel
     ===================================================================== */
  function showPanel(data) {
    if (!panel) return;
    panel.hidden = false;
    panel.querySelector("[data-field=name]").textContent = data.name;
    panel.querySelector("[data-field=class]").textContent = data.classification;
    panel.querySelector("[data-field=blurb]").textContent = data.blurb;
    panel.querySelector("[data-field=diameter]").textContent = data.diameter;
    panel.querySelector("[data-field=distance]").textContent = data.distance;
    panel.querySelector("[data-field=day]").textContent = data.day;
    panel.querySelector("[data-field=year]").textContent = data.year;
    panel.querySelector("[data-field=moons]").textContent = data.moons;
    const lessons = panel.querySelector("[data-field=lessons]");
    if (lessons) lessons.setAttribute("href", "library.html?cat=solar&q=" + encodeURIComponent(data.name));
    // Move keyboard focus into the panel for screen-reader + keyboard users.
    // preventScroll keeps the cinematic hero pinned (no page jump).
    const h = panel.querySelector("#panel-name");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  function setPickerPressed(id) {
    pickerButtons.forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.planet === id ? "true" : "false");
    });
  }

  /* =======================================================================
     Interaction wiring
     ===================================================================== */
  // Picker buttons (keyboard / touch / non-pointer): select a planet.
  pickerButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectPlanet(btn.dataset.planet, btn));
  });

  // Return + lessons buttons in the panel.
  const returnBtn = panel && panel.querySelector("[data-action=return]");
  if (returnBtn) returnBtn.addEventListener("click", returnToOverview);

  // Pointer raycasting for direct planet clicks + hover.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoverId = null;
  let pointerMoved = false;

  function pointerToNDC(e) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick() {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(selectable, false)[0];
    return hit ? hit.object.userData.planetId : null;
  }

  canvas.addEventListener("pointermove", (e) => {
    pointerToNDC(e);
    pointerMoved = true;
    if (cam.mode === "overview") kick(); // ensure a frame runs to update hover
  }, { passive: true });

  canvas.addEventListener("pointerleave", () => {
    hoverId = null;
    updateHoverClasses();
    canvas.style.cursor = "";
  });

  canvas.addEventListener("click", (e) => {
    pointerToNDC(e);
    const id = pick();
    if (id) selectPlanet(id);
  });

  function updateHoverClasses() {
    Object.keys(labels).forEach((id) => {
      labels[id].classList.toggle("is-hover", id === hoverId);
    });
  }

  // Escape returns to overview when focused.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (cam.mode === "focus" || cam.focusId)) {
      e.preventDefault();
      returnToOverview();
    }
  });

  /* =======================================================================
     Label projection
     ===================================================================== */
  const _proj = new THREE.Vector3();
  function updateLabels() {
    if (!labelLayer) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    const showLabels = cam.mode === "overview";
    built.forEach((b) => {
      const el = labels[b.data.id];
      if (!el) return;
      // Only visible labels are focusable/clickable, so keyboard focus never
      // lands on a hidden one (e.g. while a planet is in close-up).
      if (!showLabels) { el.style.opacity = "0"; el.style.pointerEvents = "none"; el.tabIndex = -1; return; }
      b.holder.getWorldPosition(_proj);
      _proj.project(camera);
      const behind = _proj.z > 1;
      if (behind) { el.style.opacity = "0"; el.style.pointerEvents = "none"; el.tabIndex = -1; return; }
      const x = (_proj.x * 0.5 + 0.5) * w;
      const y = (-_proj.y * 0.5 + 0.5) * h;
      el.style.transform = "translate(-50%, -140%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
      el.style.opacity = "1";
      el.style.pointerEvents = "auto";
      el.tabIndex = 0;
    });
  }

  /* =======================================================================
     Render loop (with on-demand rendering for reduced motion / pause)
     ===================================================================== */
  const clock = new THREE.Clock();
  let running = false;
  let raf = 0;
  let visible = true;
  let firstFrame = true;

  function keepAnimating() {
    if (!visible) return false;
    if (REDUCE_MOTION) return cam.mode === "transition";
    return true;
  }

  function update(dt) {
    // Camera transition.
    if (cam.mode === "transition") {
      cam.t += dt / cam.dur;
      if (cam.t >= 1) {
        cam.t = 1;
        camera.position.copy(cam.toPos);
        camTarget.copy(cam.toTarget);
        onArrive();
      } else {
        const k = easeInOutCubic(cam.t);
        camera.position.lerpVectors(cam.fromPos, cam.toPos, k);
        camTarget.lerpVectors(cam.fromTarget, cam.toTarget, k);
      }
      camera.lookAt(camTarget);
    }

    // Fade orbit lines + stars when focused.
    const wantOrbit = cam.focusId ? 0.08 : 0.5;
    built.forEach((b) => {
      const m = b.orbitLine.material;
      m.opacity += (wantOrbit - m.opacity) * Math.min(1, dt * 4);
    });

    if (!REDUCE_MOTION) {
      // Revolution (frozen while a planet is focused) + self-spin + sun life.
      if (!orbitsFrozen()) {
        built.forEach((b) => { b.pivot.rotation.y += b.data.revolve * dt; });
      }
      built.forEach((b) => {
        b.mesh.rotation.y += b.data.spin * dt;
        if (b.cloudMesh) b.cloudMesh.rotation.y += b.data.spin * 1.25 * dt; // clouds drift faster
      });
      sunMesh.rotation.y += 0.05 * dt;
      const pulse = 1 + Math.sin(clock.elapsedTime * 1.3) * 0.04;
      glow.scale.set(SUN.radius * 7 * pulse, SUN.radius * 7 * pulse, 1);
      stars.rotation.y += 0.004 * dt;
      galaxy.update(clock.elapsedTime);
    }

    // Hover pick (overview only).
    if (cam.mode === "overview" && pointerMoved) {
      pointerMoved = false;
      const id = pick();
      if (id !== hoverId) {
        hoverId = id;
        updateHoverClasses();
        canvas.style.cursor = id ? "pointer" : "";
      }
    }

    updateLabels();
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      if (loading) {
        loading.classList.add("is-hidden");
        setTimeout(() => { loading.hidden = true; }, 600);
      }
      if (intro) intro.classList.add("is-ready");
    }
    if (keepAnimating()) { raf = requestAnimationFrame(frame); }
    else { running = false; }
  }

  function kick() {
    if (running) return;
    running = true;
    clock.getDelta(); // reset delta so we don't jump after a pause
    raf = requestAnimationFrame(frame);
  }

  /* =======================================================================
     Resize, pause, cleanup
     ===================================================================== */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    kick(); // render at least one frame at the new size
  }
  window.addEventListener("resize", resize, { passive: true });

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) kick();
  });

  // Pause the loop when the hero scrolls out of view (saves battery).
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting && !document.hidden;
      if (visible) kick();
    }, { threshold: 0.01 });
    io.observe(stage);
  }

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(raf);
    running = false;
    galaxy.dispose();
    renderer.dispose();
  }, { once: true });

  // Go.
  kick();
}

/* Auto-init when loaded as a module on the landing page. */
function boot() {
  initObservatory();
  // Textured card thumbnails render independently of the 3D hero / WebGL;
  // on any failure the original CSS orbs remain.
  try { initCelestialCards(); } catch (e) { console.warn("[Cards] disabled:", e); }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
