/** Small WebGL2 helpers: compile, link, textures, framebuffers. */

export function shader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
  return s;
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => { if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name)); return uniforms.get(name)!; };
  return { p, u };
}

export function texture(gl: WebGL2RenderingContext, w: number, h: number, opts: { internal: number; format: number; type: number; filter: number; data?: ArrayBufferView | null; wrapS?: number }) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, opts.internal, w, h, 0, opts.format, opts.type, opts.data ?? null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrapS ?? gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function framebuffer(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
  return fb;
}

/** '#rrggbb' or 'rgba(r,g,b,a)' to [r,g,b,a] in 0..1. */
export function rgba(c: string): [number, number, number, number] {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error('colour: ' + c);
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => x.trim());
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)];
}
