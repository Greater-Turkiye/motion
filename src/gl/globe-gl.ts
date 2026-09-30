import earcut from 'earcut';
import type { Feature, MultiLineString, Polygon, MultiPolygon, Position } from 'geojson';
import { framebuffer, program, rgba, texture } from './util';
import type { Style } from '../styles';

/**
 * The map on the GPU.
 *
 * Countries are triangulated once and drawn once into a country-id texture (equirectangular,
 * 8192×4096, one byte per texel, no anti-aliasing so an id is never blended). Every frame, one
 * fragment shader inverts the projection for each pixel, looks the country up, and paints sea,
 * land, Türkiye, the subject, hatching, graticule, glow and atmosphere in a single pass. Borders
 * and coasts are real line geometry, drawn as instanced quads a constant number of pixels wide,
 * anti-aliased in the shader. Nothing is re-projected on the CPU per frame.
 */

export const W = 1080;
export const H = 1920;
const ID_W = 8192, ID_H = 4096, GLOW_W = 2048, GLOW_H = 1024;
const DEG = Math.PI / 180;

export interface View { center: [number, number]; zoom: number }
export interface Project { (p: [number, number]): [number, number] | null }

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));

/** The same projection the shaders use, on the CPU, for placing labels, rings and emblems. */
export function makeProject(style: Style, v: View): Project {
  const S = style.baseScale * v.zoom, cx = W / 2, cy = style.cy;
  if (style.flat) {
    const y0 = merc(v.center[1]);
    return ([lon, lat]) => [cx + S * (lon - v.center[0]) * DEG, cy - S * (merc(lat) - y0)];
  }
  const l0 = v.center[0] * DEG, p0 = v.center[1] * DEG;
  const cl = Math.cos(l0), sl = Math.sin(l0), cp = Math.cos(p0), sp = Math.sin(p0);
  return ([lon, lat]) => {
    const la = lat * DEG, lo = lon * DEG;
    const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
    const x1 = x * cl - z * sl, z1 = x * sl + z * cl;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    return z2 < 0 ? null : [cx + S * x1, cy - S * y2];
  };
}

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;

// Projection shared by the line vertex shader: lon/lat (degrees) to screen pixels, z < 0 behind.
const PROJECT = `
uniform float uFlat; uniform vec2 uCenter; uniform float uScale; uniform vec2 uScreenC; uniform vec2 uSize;
const float DEG = 0.017453292519943295;
float merc(float lat) { return log(tan(0.7853981633974483 + lat * DEG * 0.5)); }
vec3 project(vec2 ll) {
  if (uFlat > 0.5) {
    return vec3(uScreenC.x + uScale * (ll.x - uCenter.x) * DEG, uScreenC.y - uScale * (merc(ll.y) - merc(uCenter.y)), 1.0);
  }
  float la = ll.y * DEG, lo = ll.x * DEG, l0 = uCenter.x * DEG, p0 = uCenter.y * DEG;
  vec3 w = vec3(cos(la) * sin(lo), sin(la), cos(la) * cos(lo));
  float x1 = w.x * cos(l0) - w.z * sin(l0), z1 = w.x * sin(l0) + w.z * cos(l0);
  float y2 = w.y * cos(p0) - z1 * sin(p0), z2 = w.y * sin(p0) + z1 * cos(p0);
  return vec3(uScreenC.x + uScale * x1, uScreenC.y - uScale * y2, z2);
}
`;

const ID_VS = HEAD + `
in vec2 aLL; uniform float uId;
out float vId;
void main() { vId = uId; gl_Position = vec4(aLL.x / 180.0, aLL.y / 90.0, 0.0, 1.0); }`;
const ID_FS = HEAD + `
in float vId; out vec4 o;
void main() { o = vec4(vId / 255.0, 0.0, 0.0, 1.0); }`;

const FILL_VS = HEAD + `
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const FILL_FS = HEAD + PROJECT + `
uniform sampler2D uId; uniform sampler2D uPal; uniform sampler2D uGlow; uniform sampler2D uRelief;
uniform float uReliefK, uLimb, uHasRelief;
uniform vec3 uHyp0, uHyp1, uHyp2; uniform float uHasHyp;
uniform vec3 uShadowT, uLightT; uniform float uHasTint;
uniform vec4 uRhumbC, uTile; uniform vec2 uRhumbP[3]; uniform int uRhumbN;
uniform float uHalftone, uSpeckle, uContourStep, uGratStep; uniform vec4 uContourC, uInk;
uniform vec4 uBg0, uBg1, uSea, uGrat, uAtmo, uGlowC, uHatch;
uniform float uReveal, uPulse, uHasAtmo, uHasGlow;
out vec4 o;

vec2 unproject(vec2 s, out float inside, out float r) {
  if (uFlat > 0.5) {
    inside = 1.0; r = 0.0;
    float lon = uCenter.x + (s.x - uScreenC.x) / uScale / DEG;
    float ym = merc(uCenter.y) + (uScreenC.y - s.y) / uScale;
    float lat = (2.0 * atan(exp(ym)) - 1.5707963267948966) / DEG;
    return vec2(lon, lat);
  }
  vec2 d = (s - uScreenC) / uScale;
  r = length(d);
  inside = r <= 1.0 ? 1.0 : 0.0;
  float z = sqrt(max(0.0, 1.0 - dot(d, d)));
  float x1 = d.x, y2 = -d.y, z2 = z;
  float l0 = uCenter.x * DEG, p0 = uCenter.y * DEG;
  // inverse of the forward rotation in project()
  float y = y2 * cos(p0) + z2 * sin(p0);
  float z1 = -y2 * sin(p0) + z2 * cos(p0);
  float x = x1 * cos(l0) + z1 * sin(l0);
  float zz = -x1 * sin(l0) + z1 * cos(l0);
  return vec2(atan(x, zz) / DEG, asin(clamp(y, -1.0, 1.0)) / DEG);
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  // background: radial, like the page behind a print
  float bgk = clamp(length(s - vec2(uSize.x * 0.5, uScreenC.y * 0.8)) / (uSize.y * 0.9), 0.0, 1.0);
  vec3 col = mix(uBg0.rgb, uBg1.rgb, bgk);
  float inside, r;
  vec2 ll = unproject(s, inside, r);
  if (inside < 0.5) {
    if (uHasAtmo > 0.5) {
      float a = clamp(1.0 - (r - 1.0) / 0.1, 0.0, 1.0);
      col = mix(col, uAtmo.rgb, uAtmo.a * a * a);
    }
    o = vec4(col, 1.0);
    return;
  }
  // anti-aliased limb for the globe
  float edge = uFlat > 0.5 ? 1.0 : clamp((1.0 - r) * uScale, 0.0, 1.0);
  ivec2 t = ivec2(clamp((ll.x + 180.0) / 360.0, 0.0, 0.99999) * ${ID_W}.0, clamp((ll.y + 90.0) / 180.0, 0.0, 0.99999) * ${ID_H}.0);
  int id = int(texelFetch(uId, t, 0).r * 255.0 + 0.5);
  vec3 c = uSea.rgb;
  int kind = 0;
  // height for the contour lines, read outside every branch so its screen derivative is defined
  float hAll = texture(uRelief, vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0)).b;
  float hc = hAll / max(uContourStep, 1e-3);
  float contour = 1.0 - clamp(abs(fract(hc + 0.5) - 0.5) / max(fwidth(hc), 1e-4) - 0.5, 0.0, 1.0);
  {
    // derivatives (fwidth) need uniform control flow, so this runs everywhere and only the sea keeps it
    float onSea = id == 0 ? 1.0 : 0.0;
    // a flat page is Mercator, where rhumb lines are straight: 32 winds from each compass rose
    vec2 q = vec2(ll.x, merc(clamp(ll.y, -85.0, 85.0)) / DEG);
    for (int i = 0; i < 3; i++) {
      if (i >= uRhumbN) break;
      vec2 d = q - uRhumbP[i];
      float a = atan(d.y, d.x) * 16.0 / 3.141592653589793;
      // angular width of one pixel, worked out rather than taken from fwidth: derivatives inside a
      // loop with a break come back as zero on some drivers (ANGLE on D3D), and the lines vanished
      float fa = 16.0 / 3.141592653589793 / (uScale * DEG * max(length(d), 1e-3));
      float line = 1.0 - clamp(abs(fract(a + 0.5) - 0.5) / fa - 0.5, 0.0, 1.0);
      c = mix(c, uRhumbC.rgb, onSea * uRhumbC.a * line * smoothstep(0.3, 1.5, length(d)));
    }
    if (uTile.a > 0.0) {
      // a four-petalled tile motif every 1.5 degrees, drawn as a distance field
      vec2 cell = fract(q / 1.5) - 0.5;
      float th = atan(cell.y, cell.x), r = length(cell);
      float petal = r - (0.18 + 0.12 * abs(cos(2.0 * th)));
      float fp = max(fwidth(petal), 1e-4);
      c = mix(c, uTile.rgb, onSea * uTile.a * (1.0 - clamp(abs(petal) / fp - 0.5, 0.0, 1.0)));
    }
  }
  if (id > 0) {
    vec4 p = texelFetch(uPal, ivec2(id, 0), 0);
    kind = int(p.a * 255.0 + 0.5); // 1 land, 2 home, 3 subject, 4 disputed
    c = p.rgb;
    if (uHasHyp > 0.5 && kind != 4) {
      float h = texture(uRelief, vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0)).b;
      vec3 hyp = mix(mix(uHyp0, uHyp1, smoothstep(0.0, 0.22, h)), uHyp2, smoothstep(0.22, 0.65, h));
      c = kind == 2 ? mix(hyp, p.rgb, 0.55) : kind == 3 ? mix(hyp, p.rgb, 0.3 * uReveal) : hyp;
    }
    if (uHasHyp < 0.5 && kind == 3) c = mix(texelFetch(uPal, ivec2(0, 0), 0).rgb, p.rgb, uReveal);
    if (kind == 4) {
      float stripe = mod(gl_FragCoord.x + gl_FragCoord.y, 12.0);
      c = mix(c, uHatch.rgb, uHatch.a * smoothstep(2.4, 1.2, abs(stripe - 1.5)));
    }
  }
  // relief: the ETOPO1 normal map lit from the north-west, the cartographer's light, so ridges read
  // the same way on every frame; brighter crests, darker valleys, flat plains unchanged
  if (id > 0 && uHasRelief > 0.5 && uReliefK > 0.0) {
    vec3 rn = texture(uRelief, vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0)).rgb;
    vec2 nxy = rn.rg * 2.0 - 1.0;
    vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    // Imhof's light: mostly north-west, a little from the west and north so every ridge shows
    float shade = 0.6 * dot(n, normalize(vec3(-0.6, 0.6, 0.53))) / 0.53
                + 0.25 * dot(n, normalize(vec3(-0.85, 0.0, 0.53))) / 0.53
                + 0.15 * dot(n, normalize(vec3(0.0, 0.85, 0.53))) / 0.53;  // 1.0 on flat ground
    float hi = rn.b;                            // 0 sea level .. 1 at 5 km
    // plains stay quiet, mountains speak; the home and subject fills keep most of their flat colour
    float k = uReliefK * (0.35 + 0.65 * smoothstep(0.02, 0.45, hi)) * ((kind == 2 || kind == 3) ? 0.45 : 1.0);
    if (uHalftone > 0.0) {
      // printed relief: shadow becomes a 45° dot screen whose dots grow with the darkness
      float dark = clamp((1.0 - clamp(shade, 0.35, 1.22)) * k * 2.2, 0.0, 1.0);
      vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / uHalftone;
      float r = length(fract(q) - 0.5);
      float rad = sqrt(dark) * 0.62;
      c = mix(c, uInk.rgb, 0.8 * (1.0 - smoothstep(rad - 0.08, rad + 0.08, r)));
    } else if (uHasTint > 0.5) {
      // shadows go blue-grey and light goes warm, as on a Swiss school map, instead of black and white
      float dsh = clamp(shade, 0.35, 1.22) - 1.0;
      c = dsh < 0.0 ? mix(c, uShadowT, min(1.0, -dsh * k * 1.5)) : mix(c, uLightT, min(1.0, dsh * k * 2.2));
    } else {
      c *= mix(1.0, clamp(shade, 0.35, 1.22), k);
    }
    c += vec3(0.03) * k * smoothstep(0.4, 0.9, hi); // a touch of snow light on high ground
  }
  if (id > 0 && uContourC.a > 0.0 && hAll > 0.004) c = mix(c, uContourC.rgb, uContourC.a * contour);
  // graticule every uGratStep degrees (10 unless the style says otherwise), one pixel, anti-aliased
  vec2 g = abs(fract(ll / uGratStep + 0.5) - 0.5) * uGratStep;
  vec2 fw = max(fwidth(ll), vec2(1e-5));
  float gl1 = 1.0 - min(min(g.x / fw.x, g.y / fw.y), 1.0);
  c = mix(c, uGrat.rgb, uGrat.a * gl1);
  // the subject's glow, blurred once at load, breathing with the pulse
  if (uHasGlow > 0.5) {
    float gv = texture(uGlow, vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0)).r;
    c = mix(c, uGlowC.rgb, clamp(uGlowC.a * gv * uReveal * (0.85 + 0.3 * uPulse), 0.0, 1.0));
  }
  if (uFlat < 0.5 && uLimb > 0.0) c *= mix(1.0 - uLimb, 1.0, sqrt(max(0.0, 1.0 - r * r)));
  if (uSpeckle > 0.0) {
    // photocopy toner: rare dark specks and a faint unevenness, fixed to the page, not to the map
    float hsh = fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
    c = mix(c, uInk.rgb, step(1.0 - 0.006 * uSpeckle, hsh) * 0.7);
    c *= 1.0 - 0.03 * uSpeckle * hsh;
  }
  o = vec4(mix(col, c, edge), 1.0);
}`;

const LINE_VS = HEAD + PROJECT + `
// endpoints arrive pre-projected on the CPU: unit-sphere xyz, and lon with Mercator y for the flat
// page, so a vertex costs one matrix multiply instead of eight sines and cosines
in vec3 aPA; in vec3 aPB; in vec2 aFA; in vec2 aFB; in float aCorner; uniform float uHalf; uniform mat3 uRot; uniform float uMercC;
out float vD;
vec3 project3(vec3 w, vec2 f) {
  if (uFlat > 0.5) return vec3(uScreenC.x + uScale * (f.x - uCenter.x) * DEG, uScreenC.y - uScale * (f.y - uMercC), 1.0);
  vec3 r = uRot * w;
  return vec3(uScreenC.x + uScale * r.x, uScreenC.y - uScale * r.y, r.z);
}
void main() {
  int corner = int(aCorner + 0.5); // 0..3, the corners of the segment's quad
  vec3 A = project3(aPA, aFA), B = project3(aPB, aFB);
  if ((uFlat < 0.5 && (A.z < 0.0 || B.z < 0.0)) || (uFlat > 0.5 && abs(aFA.x - aFB.x) > 180.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vD = 0.0; return; }
  vec2 d = B.xy - A.xy; float len = length(d);
  vec2 n = len > 1e-4 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
  vec2 along = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  float side = (corner == 0 || corner == 2) ? -1.0 : 1.0;
  float end = corner < 2 ? 0.0 : 1.0;
  float w = uHalf + 1.0;
  vec2 p = mix(A.xy, B.xy, end) + n * side * w + along * (end * 2.0 - 1.0) * 0.5;
  vD = side * w;
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}`;
const LINE_FS = HEAD + `
in float vD; uniform float uHalf; uniform vec4 uColor;
out vec4 o;
void main() { float a = clamp(uHalf + 0.5 - abs(vD), 0.0, 1.0); o = vec4(uColor.rgb, uColor.a * a); }`;

/** Line segments bucketed by the 10-degree cell their first point falls in, one VAO per cell, so a
 *  frame only runs the vertex shader for the cells in view. On a GPU that hardly matters; in
 *  software (SwiftShader, a CI runner) drawing every border on Earth was 70 % of a frame. */
interface Cell { vao: WebGLVertexArrayObject; count: number; lon: number; lat: number }
interface LineSet { cells: Cell[] }
const CELL = 10;

function endpoint(p: Position): number[] {
  const la = p[1] * DEG, lo = p[0] * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo), p[0], merc(Math.max(-85, Math.min(85, p[1])))];
}

/** Whether any of a 5x5 grid of points in the cell lands on screen (with a margin for long segments). */
function cellVisible(c: Cell, proj: Project) {
  const m = 200;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const p = proj([c.lon + (CELL * i) / 4, Math.max(-89.9, Math.min(89.9, c.lat + (CELL * j) / 4))]);
    if (p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m) return true;
  }
  return false;
}

export class GlobeGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private fill; private line; private idProg;
  private idTex: WebGLTexture; private palTex: WebGLTexture; private glowTex: WebGLTexture | null = null; private reliefTex: WebGLTexture | null = null;
  private borders: LineSet; private coast: LineSet; private subjLine: LineSet | null = null; private homeLine: LineSet | null = null;
  // texture id i+1 for country i; keyed by position, because a few features (Kosovo, the TRNC,
  // Somaliland) carry no numeric id and would otherwise collide on one palette entry
  private nums: string[] = [];
  private features: Feature[];

  constructor(countries: Feature[], disputed: Feature[], borders: MultiLineString, coast: MultiLineString, relief?: HTMLImageElement | null) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < ID_W) throw new Error('texture size too small for the country-id map');
    this.fill = program(gl, FILL_VS, FILL_FS);
    this.line = program(gl, LINE_VS, LINE_FS);
    this.idProg = program(gl, ID_VS, ID_FS);
    this.features = countries;
    this.idTex = texture(gl, ID_W, ID_H, { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST });
    this.palTex = texture(gl, 256, 1, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST, wrapS: gl.CLAMP_TO_EDGE });
    this.nums = countries.map((f) => (f.id == null ? '' : String(f.id).padStart(3, '0')));
    this.rasterise(this.idTex, ID_W, ID_H, [
      ...countries.map((f, i) => ({ f, id: i + 1 })),
      ...disputed.map((f, i) => ({ f, id: 250 + i })),
    ]);
    this.borders = this.lines(borders.coordinates);
    this.coast = this.lines(coast.coordinates);
    if (relief) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      // PNG row 0 is the south pole and lands at v = 0, as the shader's (lat + 90) / 180 expects: no flip
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, relief);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.reliefTex = t;
    }
  }

  /** Triangulate polygons in lon/lat and draw them into an R8 target; each texel holds one id. */
  private rasterise(tex: WebGLTexture, w: number, h: number, items: { f: Feature; id: number }[]) {
    const gl = this.gl;
    const fb = framebuffer(gl, tex);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.idProg.p);
    const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = gl.getAttribLocation(this.idProg.p, 'aLL');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const { f, id } of items) {
      const g = f.geometry as Polygon | MultiPolygon | null;
      if (!g) continue;
      const polys: Position[][][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const tris: number[] = [];
      for (const rings of polys) {
        const flat: number[] = [], holes: number[] = [];
        rings.forEach((ring, k) => { if (k) holes.push(flat.length / 2); for (const p of ring) flat.push(p[0], p[1]); });
        const idx = earcut(flat, holes, 2);
        for (const j of idx) tris.push(flat[j * 2], flat[j * 2 + 1]);
      }
      if (!tris.length) continue;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STREAM_DRAW);
      gl.uniform1f(this.idProg.u('uId'), id);
      gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteBuffer(buf); gl.deleteVertexArray(vao);
  }

  private lines(strings: Position[][]): LineSet {
    const gl = this.gl;
    const buckets = new Map<string, number[]>();
    for (const s of strings) for (let i = 1; i < s.length; i++) {
      const lon = Math.floor(s[i - 1][0] / CELL) * CELL, lat = Math.floor(s[i - 1][1] / CELL) * CELL;
      const key = `${lon},${lat}`;
      if (!buckets.has(key)) buckets.set(key, []);
      // two triangles per segment, plain (not instanced): SwiftShader runs an instanced draw one
      // instance at a time, which made thin lines the most expensive thing in a software frame
      const seg = [...endpoint(s[i - 1]), ...endpoint(s[i])];
      const out = buckets.get(key)!;
      for (const corner of [0, 1, 2, 2, 1, 3]) out.push(...seg, corner);
    }
    const loc = (n: string) => gl.getAttribLocation(this.line.p, n);
    // per vertex: A xyz, A lon, A mercator y, the same for B, the corner (11 floats, 44 bytes)
    const attrs: [number, number, number][] = [[loc('aPA'), 3, 0], [loc('aFA'), 2, 12], [loc('aPB'), 3, 20], [loc('aFB'), 2, 32], [loc('aCorner'), 1, 40]];
    const cells: Cell[] = [];
    for (const [key, data] of buckets) {
      const [lon, lat] = key.split(',').map(Number);
      const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
      const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      for (const [l, n, off] of attrs) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 44, off); }
      cells.push({ vao, count: data.length / 11, lon, lat });
    }
    gl.bindVertexArray(null);
    return { cells };
  }

  private outline(numId: string): LineSet | null {
    const f = this.features.find((x) => String(x.id).padStart(3, '0') === numId);
    const g = f?.geometry as Polygon | MultiPolygon | undefined;
    if (!g) return null;
    const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
    return this.lines(rings);
  }

  /** Per scene: which countries the story is about (one, or the parties of an agreement or an
   *  exercise), their outline, and their glow (blurred once, on the CPU). */
  setScene(subjectNums: string[], homeNum: string) {
    const gl = this.gl;
    const nums = subjectNums.filter((n) => n && n !== homeNum);
    const rings = nums.flatMap((n) => {
      const g = this.features.find((x) => String(x.id).padStart(3, '0') === n)?.geometry as Polygon | MultiPolygon | undefined;
      return !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
    });
    this.subjLine = rings.length ? this.lines(rings) : null;
    this.homeLine = this.outline(homeNum);
    this.subjectNums = new Set(nums); this.homeNum = homeNum;
    if (this.glowTex) { gl.deleteTexture(this.glowTex); this.glowTex = null; }
    const fs = nums.map((n) => this.features.find((x) => String(x.id).padStart(3, '0') === n)).filter((f): f is Feature => !!f);
    if (!fs.length) return;
    const mask = texture(gl, GLOW_W, GLOW_H, { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST });
    this.rasterise(mask, GLOW_W, GLOW_H, fs.map((f) => ({ f, id: 255 })));
    const fb = framebuffer(gl, mask);
    const px = new Uint8Array(GLOW_W * GLOW_H * 4);
    gl.readPixels(0, 0, GLOW_W, GLOW_H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(mask);
    // outline band: blur the mask, keep what lies outside it and just inside its edge
    const m = new Float32Array(GLOW_W * GLOW_H);
    for (let i = 0; i < m.length; i++) m[i] = px[i * 4] / 255;
    const blurred = boxBlur(boxBlur(boxBlur(m, GLOW_W, GLOW_H, 7), GLOW_W, GLOW_H, 7), GLOW_W, GLOW_H, 7);
    const out = new Uint8Array(GLOW_W * GLOW_H);
    for (let i = 0; i < out.length; i++) {
      const band = 1 - Math.abs(blurred[i] - 0.5) * 2; // peaks on the border
      out[i] = Math.round(255 * Math.min(1, Math.max(0, band) * 1.4));
    }
    this.glowTex = texture(gl, GLOW_W, GLOW_H, { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, data: out });
  }
  private subjectNums = new Set<string>();
  private homeNum = '792';

  private palette(s: Style) {
    const gl = this.gl;
    const px = new Uint8Array(256 * 4);
    const put = (i: number, c: string, kind: number) => { const v = rgba(c); px[i * 4] = v[0] * 255; px[i * 4 + 1] = v[1] * 255; px[i * 4 + 2] = v[2] * 255; px[i * 4 + 3] = kind; };
    put(0, s.land, 0);
    this.nums.forEach((num, i) => put(i + 1, num === this.homeNum ? s.home : num && this.subjectNums.has(num) ? s.subject : s.land, num === this.homeNum ? 2 : num && this.subjectNums.has(num) ? 3 : 1));
    for (let i = 250; i < 256; i++) put(i, s.land, 4);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  draw(s: Style, v: View, o: { subjectReveal: number; pulse: number }) {
    const gl = this.gl;
    this.palette(s);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    const S = s.baseScale * v.zoom;
    const common = (u: (n: string) => WebGLUniformLocation | null) => {
      gl.uniform1f(u('uFlat'), s.flat ? 1 : 0); gl.uniform2f(u('uCenter'), v.center[0], v.center[1]);
      gl.uniform1f(u('uScale'), S); gl.uniform2f(u('uScreenC'), W / 2, s.cy); gl.uniform2f(u('uSize'), W, H);
    };
    gl.useProgram(this.fill.p);
    const u = this.fill.u;
    common(u);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.idTex); gl.uniform1i(u('uId'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palTex); gl.uniform1i(u('uPal'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.glowTex ?? this.palTex); gl.uniform1i(u('uGlow'), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.reliefTex ?? this.palTex); gl.uniform1i(u('uRelief'), 3);
    gl.uniform1f(u('uHasRelief'), this.reliefTex ? 1 : 0); gl.uniform1f(u('uReliefK'), s.relief); gl.uniform1f(u('uLimb'), s.limb);
    const rgb = (x: string) => rgba(x).slice(0, 3);
    gl.uniform1f(u('uHasHyp'), s.hypso && this.reliefTex ? 1 : 0);
    if (s.hypso) { gl.uniform3fv(u('uHyp0'), rgb(s.hypso[0])); gl.uniform3fv(u('uHyp1'), rgb(s.hypso[1])); gl.uniform3fv(u('uHyp2'), rgb(s.hypso[2])); }
    gl.uniform1f(u('uHasTint'), s.shadeTint ? 1 : 0);
    if (s.shadeTint) { gl.uniform3fv(u('uShadowT'), rgb(s.shadeTint[0])); gl.uniform3fv(u('uLightT'), rgb(s.shadeTint[1])); }
    gl.uniform1i(u('uRhumbN'), s.rhumb ? Math.min(3, s.rhumb.centers.length) : 0);
    if (s.rhumb) {
      gl.uniform4fv(u('uRhumbC'), rgba(s.rhumb.color));
      // compass centres in (lon, mercator y in degrees), the space the shader measures angles in
      gl.uniform2fv(u('uRhumbP'), s.rhumb.centers.slice(0, 3).flatMap(([lo, la]) => [lo, merc(la) / DEG]));
    }
    gl.uniform4fv(u('uTile'), rgba(s.tile ?? 'rgba(0,0,0,0)'));
    gl.uniform1f(u('uHalftone'), s.halftone ?? 0); gl.uniform1f(u('uSpeckle'), s.speckle ?? 0);
    gl.uniform4fv(u('uInk'), rgba(s.ink)); gl.uniform1f(u('uGratStep'), s.gratStep ?? 10);
    gl.uniform4fv(u('uContourC'), rgba(s.contour?.color ?? 'rgba(0,0,0,0)')); gl.uniform1f(u('uContourStep'), s.contour?.step ?? 1);
    gl.uniform4fv(u('uBg0'), rgba(s.bg[0])); gl.uniform4fv(u('uBg1'), rgba(s.bg[1]));
    gl.uniform4fv(u('uSea'), rgba(s.sea)); gl.uniform4fv(u('uGrat'), rgba(s.graticule));
    gl.uniform4fv(u('uAtmo'), rgba(s.atmosphere ?? 'rgba(0,0,0,0)')); gl.uniform1f(u('uHasAtmo'), s.atmosphere && !s.flat ? 1 : 0);
    gl.uniform4fv(u('uGlowC'), rgba(s.glow ?? 'rgba(0,0,0,0)')); gl.uniform1f(u('uHasGlow'), s.glow && this.glowTex ? 1 : 0);
    gl.uniform4fv(u('uHatch'), s.flat ? [0.08, 0.08, 0.08, 0.45] : [1, 1, 1, 0.38]);
    gl.uniform1f(u('uReveal'), o.subjectReveal); gl.uniform1f(u('uPulse'), o.pulse);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.line.p);
    common(this.line.u);
    {
      const l0 = v.center[0] * DEG, p0 = v.center[1] * DEG;
      const cl = Math.cos(l0), sl = Math.sin(l0), cp = Math.cos(p0), sp = Math.sin(p0);
      // the rotation of makeProject as a matrix, column by column
      gl.uniformMatrix3fv(this.line.u('uRot'), false, [cl, -sp * sl, cp * sl, 0, cp, sp, -sl, -sp * cl, cp * cl]);
      gl.uniform1f(this.line.u('uMercC'), merc(v.center[1]));
    }
    const proj = makeProject(s, v);
    const seen = new Map<Cell, boolean>();
    const stroke = (ls: LineSet | null, color: string, width: number, alpha = 1) => {
      if (!ls || alpha <= 0) return;
      const c = rgba(color); c[3] *= alpha;
      gl.uniform4fv(this.line.u('uColor'), c); gl.uniform1f(this.line.u('uHalf'), width / 2);
      for (const cell of ls.cells) {
        let vis = seen.get(cell);
        if (vis === undefined) seen.set(cell, (vis = cellVisible(cell, proj)));
        if (!vis) continue;
        gl.bindVertexArray(cell.vao); gl.drawArrays(gl.TRIANGLES, 0, cell.count);
      }
    };
    stroke(this.coast, s.border, s.flat ? 1.3 : 1.0);
    stroke(this.borders, s.border, s.flat ? 1.3 : 1.0);
    stroke(this.subjLine, s.subjectStroke, 2.2, o.subjectReveal);
    stroke(this.homeLine, s.homeStroke, 2.4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + ((x + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}
