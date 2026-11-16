// The pixel cloud sky — a WebGL port of the "Pixel cloud sky" Figma shader.
// Dithered clouds drift left → right; the palette follows the visitor's clock.
//
// Try a time of day without waiting for it: add ?sky=morning|afternoon|evening|night to the URL.

// Gradient stops sampled from the Figma mockups. Position 0 = top of the sky.
export const PALETTES = {
  morning: {
    stops: [['#d4f1ff', 0], ['#a7e6ff', 0.5], ['#cddbff', 0.68], ['#fecdfb', 0.84], ['#fda3cd', 0.96]],
    light: '#cdd9f1', shade: '#86a6ee', stars: 0,
  },
  afternoon: {
    stops: [['#4b9aff', 0], ['#d5f1ff', 0.6], ['#b2dbf0', 1]],
    light: '#c6d3ee', shade: '#7f9fec', stars: 0,
  },
  evening: {
    stops: [['#6ba0fc', 0], ['#aadbfa', 0.5], ['#cbc68f', 0.78], ['#dfb88d', 1]],
    light: '#c6d3ee', shade: '#7f9fec', stars: 0.13,
  },
  night: {
    stops: [['#c2bbe9', 0], ['#a68ff5', 0.4], ['#675ca5', 0.7], ['#30305f', 1]],
    light: '#bccbf0', shade: '#8a9fe6', stars: 1,
  },
};

// Cloud settings — the Figma defaults. Pixel size is per 1444px of width (the Figma frame).
const SETTINGS = {
  cloudSpeed: 1, coverage: 0.52, pixelSize: 9, ditherStrength: 0.65,
  starDensity: 0.45, starBrightness: 0.85,
  counts: [4, 5, 4], sizes: [95, 85, 75], sizeVariation: 40,
};

export function timeOfDay(date = new Date()) {
  const forced = new URLSearchParams(location.search).get('sky');
  if (PALETTES[forced]) return forced;
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

// "IT'S 3 O'CLOCK-ISH" — rounded to the nearest hour, because -ish.
export function oclockIsh(date = new Date()) {
  let h = date.getHours() + (date.getMinutes() >= 30 ? 1 : 0);
  h = h % 12 || 12;
  return `IT’S ${h} O’CLOCK-ISH`;
}

// A stepped (banded) CSS gradient, for pixel-art backgrounds without the shader.
export function bandedGradient(name, bands = 16) {
  const { stops } = PALETTES[name];
  const parts = [];
  for (let i = 0; i < bands; i++) {
    const c = sampleStops(stops, (i + 0.5) / bands);
    parts.push(`${c} ${((i / bands) * 100).toFixed(2)}%`, `${c} ${(((i + 1) / bands) * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to bottom, ${parts.join(', ')})`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function sampleStops(stops, t) {
  let c = hexToRgb(stops[0][0]);
  for (let i = 1; i < stops.length; i++) {
    const [l, r] = [stops[i - 1][1], stops[i][1]];
    const b = t >= r ? 1 : Math.min(1, Math.max(0, (t - l) / Math.max(r - l, 1e-6)));
    const n = hexToRgb(stops[i][0]);
    c = c.map((v, k) => v + (n[k] - v) * b);
  }
  return `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;
}

// ---------------------------------------------------------------------------

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uPixel, uSpeed, uCoverage, uDither, uStarDensity, uStarBright, uStars;
uniform vec4 uGrad[6];   // rgb + position
uniform int uGradCount;
uniform vec3 uLight, uShade;
uniform float uCounts[3];
uniform vec4 uClouds[36]; // x, y, size, depth
out vec4 outColor;

vec3 skyRamp(float t) {
  vec3 c = uGrad[0].rgb;
  for (int i = 1; i < 6; i++) {
    if (i >= uGradCount) break;
    float l = uGrad[i - 1].a, r = uGrad[i].a;
    float b = t >= r ? 1.0 : clamp((t - l) / max(r - l, 1e-6), 0.0, 1.0);
    c = mix(c, uGrad[i].rgb, b);
  }
  return c;
}
float hashSky(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float orderedSky(vec2 cell) {
  uvec2 q = uvec2(ivec2(floor(cell)) & ivec2(3));
  uint a = ((q.x & 1u) ^ (q.y & 1u)) * 2u + (q.y & 1u);
  uint b = (((q.x >> 1u) & 1u) ^ ((q.y >> 1u) & 1u)) * 2u + ((q.y >> 1u) & 1u);
  return (float(a * 4u + b) + 0.5) / 16.0;
}
float ellipseSky(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
float cloudSky(vec2 p, float layer, float travel, float aspect) {
  float dist = 10.0;
  for (int region = 0; region < 3; region++) {
    int count = int(uCounts[region]);
    for (int index = 0; index < 12; index++) {
      if (index >= count) break;
      vec4 cloud = uClouds[region * 12 + index];
      if (cloud.w != layer || cloud.z <= 0.0) continue;
      float horizontal = (fract((p.x - travel) / aspect - cloud.x + 0.5) - 0.5) * aspect;
      vec2 z = vec2(horizontal, p.y - cloud.y);
      float size = cloud.z;
      if (abs(z.x) > 0.34 * size + 0.06 || abs(z.y + 0.06 * size) > 0.17 * size + 0.06) continue;
      float shape = ellipseSky(z, vec2(0.27, 0.067) * size);
      shape = min(shape, ellipseSky(z - vec2(-0.13, -0.035) * size, vec2(0.11, 0.086) * size));
      shape = min(shape, ellipseSky(z - vec2(-0.035, -0.09) * size, vec2(0.105, 0.12) * size));
      shape = min(shape, ellipseSky(z - vec2(0.083, -0.05) * size, vec2(0.12, 0.092) * size));
      shape = min(shape, ellipseSky(z - vec2(0.19, -0.012) * size, vec2(0.102, 0.063) * size));
      dist = min(dist, shape);
    }
  }
  return dist;
}
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y); // y = 0 at the top, like Figma
  vec2 uv = frag / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 cell = floor(uv * uRes / uPixel);
  vec2 pixelUv = (cell + 0.5) * uPixel / uRes;
  vec2 p = vec2(pixelUv.x * aspect, pixelUv.y);
  float dith = orderedSky(cell);
  float grad = clamp(pixelUv.y + (dith - 0.5) * uDither / 24.0, 0.0, 1.0);
  vec3 result = skyRamp(pow(grad, 1.1));

  vec2 starCell = floor(cell / 7.0);
  float starRand = hashSky(starCell + vec2(87.3, 15.2));
  vec2 starPos = floor(vec2(hashSky(starCell + 10.0), hashSky(starCell + 31.0)) * 5.0) + 1.0;
  vec2 localStar = cell - starCell * 7.0 - starPos;
  float starPixel = all(lessThan(abs(localStar), vec2(0.5))) ? 1.0 : 0.0;
  float starOn = starRand < uStarDensity * 0.28 ? 1.0 : 0.0;
  float starFade = 1.0 - smoothstep(0.55, 0.97, pixelUv.y);
  result = mix(result, vec3(0.97, 0.98, 1.0), starPixel * starOn * uStarBright * uStars * starFade);

  for (int li = 0; li < 2; li++) {
    float layer = float(li);
    float travel = uTime * uSpeed * mix(0.015, 0.025, layer);
    float d = cloudSky(p, layer, travel, aspect);
    float edge = 1.0 - smoothstep(-0.014, 0.014, d);
    float mask = edge > mix(0.5, dith, uDither) ? 1.0 : 0.0;
    float litD = cloudSky(p - vec2(0.026, 0.045), layer, travel, aspect);
    float lighting = clamp(0.30 + (litD - d) * 18.0 - d * 2.2, 0.0, 1.0);
    float q = floor(lighting * 4.0 + mix(0.5, dith, uDither)) / 4.0;
    vec3 cloudColor = mix(uShade, uLight, clamp(q, 0.0, 1.0));
    cloudColor = mix(skyRamp(clamp(pixelUv.y, 0.0, 1.0)), cloudColor, mix(0.62, 1.0, layer));
    result = mix(result, cloudColor, mask * smoothstep(0.0, 0.06, uCoverage));
  }
  outColor = vec4(result, 1.0);
}`;

function cloudData(isNight) {
  const data = new Float32Array(144);
  const counts = [0, 0, 0];
  const variation = SETTINGS.sizeVariation / 100;
  const coverageScale = Math.sqrt(SETTINGS.coverage / 0.52);
  const h = (seed) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let region = 0; region < 3; region++) {
    counts[region] = isNight ? Math.ceil(SETTINGS.counts[region] * 0.34) : SETTINGS.counts[region];
    const base = SETTINGS.sizes[region] / 100;
    for (let i = 0; i < 12; i++) {
      const seed = region * 31 + i + 1;
      const depth = i % 2;
      let size = base * (1 + (h(seed + 17.2) * 2 - 1) * variation);
      size *= coverageScale * (depth === 0 ? 0.82 : 1) * (isNight ? 0.85 : 1);
      const o = (region * 12 + i) * 4;
      data[o] = (0.13 + region * 0.317 + i * 0.61803398875) % 1;
      data[o + 1] = (region + 0.12 + h(seed + 81.3) * 0.76) / 3;
      data[o + 2] = size;
      data[o + 3] = depth;
    }
  }
  return { data, counts };
}

/**
 * Paint the animated sky into a <canvas>. Falls back to a banded CSS gradient
 * on the canvas's parent if WebGL2 isn't available.
 */
export function startSky(canvas) {
  let name = timeOfDay();
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (!gl) {
    canvas.parentElement.style.background = bandedGradient(name);
    canvas.remove();
    return { name };
  }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const setPalette = () => {
    const pal = PALETTES[name];
    const grad = new Float32Array(24);
    pal.stops.forEach(([hex, pos], i) => grad.set([...hexToRgb(hex), pos], i * 4));
    gl.uniform4fv(U('uGrad'), grad);
    gl.uniform1i(U('uGradCount'), pal.stops.length);
    gl.uniform3fv(U('uLight'), hexToRgb(pal.light));
    gl.uniform3fv(U('uShade'), hexToRgb(pal.shade));
    gl.uniform1f(U('uStars'), pal.stars);
    const { data, counts } = cloudData(name === 'night');
    gl.uniform4fv(U('uClouds'), data);
    gl.uniform1fv(U('uCounts'), counts);
  };
  gl.uniform1f(U('uSpeed'), SETTINGS.cloudSpeed);
  gl.uniform1f(U('uCoverage'), SETTINGS.coverage);
  gl.uniform1f(U('uDither'), SETTINGS.ditherStrength);
  gl.uniform1f(U('uStarDensity'), SETTINGS.starDensity);
  gl.uniform1f(U('uStarBright'), SETTINGS.starBrightness);
  setPalette();

  // Render at CSS-pixel resolution (not retina): it's pixel art, and it keeps the GPU calm.
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth));
    const h = Math.max(1, Math.round(canvas.clientHeight));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(U('uRes'), w, h);
    gl.uniform1f(U('uPixel'), Math.max(5, Math.round((SETTINGS.pixelSize * w) / 1444)));
  };

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now() - 40000; // start mid-drift so the sky isn't empty-looking
  let last = 0;
  const frame = (now) => {
    if (!still) requestAnimationFrame(frame);
    if (now - last < 1000 / 30) return; // 30fps is plenty for drifting clouds
    last = now;
    resize();
    gl.uniform1f(U('uTime'), (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  requestAnimationFrame(frame);
  if (still) new ResizeObserver(() => requestAnimationFrame(frame)).observe(canvas);

  // Roll over to the next time of day if someone keeps the page open.
  setInterval(() => {
    const next = timeOfDay();
    if (next !== name) { name = next; setPalette(); if (still) requestAnimationFrame(frame); }
  }, 60000);

  return { get name() { return name; } };
}
