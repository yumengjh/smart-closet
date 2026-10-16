import { buildMesh, type Fit, type Landmark } from './geometry'
import type { Texture } from './texture'

const vertexShader = `attribute vec2 a_position; attribute vec2 a_uv;
varying vec2 v_uv; varying vec2 v_screen;
void main(){ gl_Position=vec4(a_position,0.,1.); v_uv=a_uv; v_screen=vec2((a_position.x+1.)*.5,(1.-a_position.y)*.5); }`
const fragmentShader = `precision mediump float;
uniform sampler2D u_texture; uniform float u_mode; uniform float u_aspect; uniform float u_radius;
uniform vec4 u_arm0; uniform vec4 u_arm1; varying vec2 v_uv; varying vec2 v_screen;
float segmentDistance(vec2 p,vec4 arm){
  vec2 a=arm.xy*vec2(u_aspect,1.),b=arm.zw*vec2(u_aspect,1.); p*=vec2(u_aspect,1.);
  vec2 d=b-a; float t=clamp(dot(p-a,d)/max(dot(d,d),.000001),0.,1.); return length(p-a-t*d);
}
void main(){
  if(u_mode>1.5){gl_FragColor=vec4(.18,.85,.64,.5);return;}
  vec4 color=texture2D(u_texture,v_uv);
  if(u_mode>.5 && u_radius>0.){
    float distance=min(segmentDistance(v_screen,u_arm0),segmentDistance(v_screen,u_arm1));
    color.a*=smoothstep(u_radius*.75,u_radius,distance);
  }
  gl_FragColor=color;
}`

export class TryOnRenderer {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private buffer: WebGLBuffer
  private videoTexture: WebGLTexture
  private garmentTexture: WebGLTexture
  private texture: Texture | null = null
  private lastMeshKey = ''
  private mesh = new Float32Array()
  private wire = new Float32Array()
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('当前浏览器不支持 WebGL，请换一个浏览器测试。')
    this.gl = gl
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error || '渲染器初始化失败。') }
      return shader
    }
    this.program = gl.createProgram()!
    const vs = compile(gl.VERTEX_SHADER, vertexShader), fs = compile(gl.FRAGMENT_SHADER, fragmentShader)
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('衣物渲染程序未能启动。')
    this.buffer = gl.createBuffer()!
    const texture = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t }
    this.videoTexture = texture(); this.garmentTexture = texture()
    for (const name of ['u_texture', 'u_mode', 'u_aspect', 'u_radius', 'u_arm0', 'u_arm1']) this.uniforms.set(name, gl.getUniformLocation(this.program, name))
  }
  setTexture(texture: Texture | null) {
    this.texture = texture; this.lastMeshKey = ''
    if (!texture) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.garmentTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas)
  }
  private vertices(data: Float32Array, mode: number, primitive: number) {
    const gl = this.gl
    gl.uniform1f(this.uniforms.get('u_mode')!, mode)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    const position = gl.getAttribLocation(this.program, 'a_position'), uv = gl.getAttribLocation(this.program, 'a_uv')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.drawArrays(primitive, 0, data.length / 4)
  }
  draw(video: HTMLVideoElement, pose: Landmark[], timestamp: number, fit: Fit, options: { rigid: boolean; occlusion: boolean; wire: boolean }) {
    const gl = this.gl
    const width = Math.min(960, video.videoWidth), height = Math.round(width * video.videoHeight / video.videoWidth)
    if (!width || !height || gl.isContextLost()) return
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
    gl.viewport(0, 0, width, height); gl.useProgram(this.program); gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.uniforms.get('u_texture')!, 0); gl.uniform1f(this.uniforms.get('u_aspect')!, width / height)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    gl.disable(gl.BLEND)
    this.vertices(new Float32Array([-1,1,0,0, 1,1,1,0, 1,-1,1,1, -1,1,0,0, 1,-1,1,1, -1,-1,0,1]), 0, gl.TRIANGLES)
    if (!this.texture || !pose.length) return
    const key = `${timestamp}:${fit.width}:${fit.length}:${fit.offset}:${options.rigid}:${width}/${height}`
    if (key !== this.lastMeshKey) {
      const mesh = buildMesh(this.texture.geometry, pose, fit, width / height, options.rigid)
      this.mesh = new Float32Array(mesh.flatMap(p => [p.target.x * 2 - 1, 1 - p.target.y * 2, p.source.x, p.source.y]))
      this.wire = new Float32Array(mesh.flatMap((p, i) => {
        const next = mesh[i % 3 === 2 ? i - 2 : i + 1]!
        return [p.target.x * 2 - 1, 1 - p.target.y * 2, p.source.x, p.source.y,
          next.target.x * 2 - 1, 1 - next.target.y * 2, next.source.x, next.source.y]
      }))
      this.lastMeshKey = key
    }
    const shoulderWidth = Math.hypot((pose[11]!.x - pose[12]!.x) * width / height, pose[11]!.y - pose[12]!.y)
    gl.uniform1f(this.uniforms.get('u_radius')!, options.occlusion ? shoulderWidth * .055 : 0)
    for (const [side, elbow, wrist] of [[0, 13, 15], [1, 14, 16]]) {
      const a = pose[elbow!]!, b = pose[wrist!]!
      const visible = a.visibility > .5 && b.visibility > .5 && b.z < (pose[11]!.z + pose[12]!.z) / 2 + .08
      gl.uniform4f(this.uniforms.get(`u_arm${side}`)!, visible ? a.x : -10, visible ? a.y : -10, visible ? b.x : -10, visible ? b.y : -10)
    }
    gl.bindTexture(gl.TEXTURE_2D, this.garmentTexture); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    this.vertices(this.mesh, 1, gl.TRIANGLES)
    if (options.wire) this.vertices(this.wire, 2, gl.LINES)
  }
  close() { const gl = this.gl; gl.deleteTexture(this.videoTexture); gl.deleteTexture(this.garmentTexture); gl.deleteBuffer(this.buffer); gl.deleteProgram(this.program); this.texture = null }
}
