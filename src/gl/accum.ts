import { program } from './util';

/**
 * Sub-frame accumulation: motion blur and dithering for exported frames (docs/research/03, §2 #1
 * and #6). A frame drawn N times at slightly different moments and averaged in 16-bit float is
 * what a film camera's open shutter records; the average is then written out with a pixel-fixed
 * dither of ±½ level, so dark gradients do not break into bands after H.264. With N = 1 it is
 * only the dither. Needs rendering to half-float targets (EXT_color_buffer_float); without it the
 * caller keeps the plain frame.
 */
const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() { vec2 p = P[gl_VertexID]; vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const ADD = `#version 300 es
precision highp float;
uniform sampler2D uSrc; in vec2 vUv; out vec4 o;
void main() { o = vec4(texture(uSrc, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }`;

const RESOLVE = `#version 300 es
precision highp float;
uniform sampler2D uAcc; uniform float uInv; in vec2 vUv; out vec4 o;
void main() {
  vec3 c = texture(uAcc, vUv).rgb * uInv;
  // interleaved gradient noise: a fixed, even pattern, so the dither itself never flickers
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  o = vec4(c + (n - 0.5) / 255.0, 1.0);
}`;

export class Accumulator {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private add; private resolve;
  private src: WebGLTexture; private acc: WebGLTexture; private fb: WebGLFramebuffer;
  private n = 0;

  static make(w: number, h: number): Accumulator | null {
    try { return new Accumulator(w, h); } catch (e) { console.warn('no sub-frame accumulation:', (e as Error).message); return null; }
  }

  private constructor(private w: number, private h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no half-float render targets');
    this.gl = gl;
    this.add = program(gl, VS, ADD);
    this.resolve = program(gl, VS, RESOLVE);
    const tex = (internal: number, format: number, type: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.src = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.acc = tex(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.acc, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('half-float framebuffer incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.n = 0;
  }

  /** Adds one finished sub-frame (the 2D output canvas) to the sum. */
  push(frame: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.add.p);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.add.u('uSrc'), 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    this.n++;
  }

  /** The average, dithered, in this.canvas. */
  finish() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.resolve.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.acc); gl.uniform1i(this.resolve.u('uAcc'), 0);
    gl.uniform1f(this.resolve.u('uInv'), 1 / Math.max(1, this.n));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
