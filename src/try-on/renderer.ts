import { createMesh, deformMesh, type Fit, type Landmark, type Mesh } from './geometry'
import type { Texture } from './texture'

const vertexShader = `attribute vec2 a_position; attribute vec2 a_uv; uniform vec2 u_shift;
varying vec2 v_uv; varying vec2 v_screen;
void main(){ vec2 p=a_position+u_shift; gl_Position=vec4(p,0.,1.); v_uv=a_uv; v_screen=vec2((p.x+1.)*.5,(1.-p.y)*.5); }`
// Modes: 0 video, 1 garment, 2 mesh wire, 3 soft contact shadow under the garment.
const fragmentShader = `precision mediump float;
uniform sampler2D u_texture; uniform float u_mode; uniform float u_aspect; uniform float u_radius;
uniform vec4 u_arm0; uniform vec4 u_arm1; varying vec2 v_uv; varying vec2 v_screen;
float segmentDistance(vec2 p,vec4 arm){
  vec2 a=arm.xy*vec2(u_aspect,1.),b=arm.zw*vec2(u_aspect,1.); p*=vec2(u_aspect,1.);
  vec2 d=b-a; float t=clamp(dot(p-a,d)/max(dot(d,d),.000001),0.,1.); return length(p-a-t*d);
}
void main(){
  if(u_mode>2.5){gl_FragColor=vec4(0.,0.,0.,texture2D(u_texture,v_uv).a*.22);return;}
  if(u_mode>1.5){gl_FragColor=vec4(.18,.85,.64,.5);return;}
  vec4 color=texture2D(u_texture,v_uv);
  if(u_mode>.5 && u_radius>0.){
    float distance=min(segmentDistance(v_screen,u_arm0),segmentDistance(v_screen,u_arm1));
    color.a*=smoothstep(u_radius*.7,u_radius,distance);
  }
  gl_FragColor=color;
}`
// Full-frame video quad as a triangle strip: top-left, bottom-left, top-right, bottom-right.
const QUAD = new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1])
const QUAD_UV = new Float32Array([0, 0, 0, 1, 1, 0, 1, 1])

export class TryOnRenderer {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private positions: WebGLBuffer
  private uvs: WebGLBuffer
  private indices: WebGLBuffer
  private wireIndices: WebGLBuffer
  private videoTexture: WebGLTexture
  private garmentTexture: WebGLTexture
  private texture: Texture | null = null
  private mesh: Mesh | null = null
  private wireCount = 0
  private targets = new Float32Array()
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private attributes = { position: -1, uv: -1 }
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
    this.positions = gl.createBuffer()!; this.uvs = gl.createBuffer()!; this.indices = gl.createBuffer()!; this.wireIndices = gl.createBuffer()!
    const texture = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t }
    this.videoTexture = texture(); this.garmentTexture = texture()
    for (const name of ['u_texture', 'u_mode', 'u_aspect', 'u_radius', 'u_arm0', 'u_arm1', 'u_shift']) this.uniforms.set(name, gl.getUniformLocation(this.program, name))
    this.attributes = { position: gl.getAttribLocation(this.program, 'a_position'), uv: gl.getAttribLocation(this.program, 'a_uv') }
  }
  setTexture(texture: Texture | null) {
    this.texture = texture; this.mesh = null
    if (!texture) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.garmentTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas)
    // The grid, its UVs and draw order depend only on the garment, so they are uploaded once per texture.
    const mesh = this.mesh = createMesh(texture.geometry)
    this.targets = new Float32Array(mesh.uv.length)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvs); gl.bufferData(gl.ARRAY_BUFFER, mesh.uv, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
    const wire: number[] = []
    for (let i = 0; i < mesh.indices.length; i += 3) { const [a, b, c] = mesh.indices.subarray(i, i + 3); wire.push(a!, b!, b!, c!, c!, a!) }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireIndices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(wire), gl.STATIC_DRAW)
    this.wireCount = wire.length
  }
  private attribute(location: number, buffer: WebGLBuffer, data?: Float32Array) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  }
  draw(video: HTMLVideoElement, pose: Landmark[], fit: Fit, options: { rigid: boolean; occlusion: boolean; wire: boolean }) {
    const gl = this.gl
    const width = Math.min(960, video.videoWidth), height = Math.round(width * video.videoHeight / video.videoWidth)
    if (!width || !height || gl.isContextLost()) return
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
    gl.viewport(0, 0, width, height); gl.useProgram(this.program); gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.uniforms.get('u_texture')!, 0); gl.uniform1f(this.uniforms.get('u_aspect')!, width / height)
    gl.uniform2f(this.uniforms.get('u_shift')!, 0, 0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    gl.disable(gl.BLEND); gl.uniform1f(this.uniforms.get('u_mode')!, 0)
    this.attribute(this.attributes.position, this.positions, QUAD); this.attribute(this.attributes.uv, this.quadUv())
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (!this.texture || !this.mesh || !pose.length) return
    deformMesh(this.mesh, this.texture.geometry, pose, fit, width / height, options.rigid, this.targets)
    this.attribute(this.attributes.position, this.positions, this.targets); this.attribute(this.attributes.uv, this.uvs)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices)
    const shoulderWidth = Math.hypot((pose[11]!.x - pose[12]!.x) * width / height, pose[11]!.y - pose[12]!.y)
    gl.bindTexture(gl.TEXTURE_2D, this.garmentTexture); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    // A faint offset shadow seats the garment on the body instead of floating above the video.
    gl.uniform1f(this.uniforms.get('u_mode')!, 3); gl.uniform2f(this.uniforms.get('u_shift')!, 0, -shoulderWidth * .05)
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0)
    gl.uniform2f(this.uniforms.get('u_shift')!, 0, 0)
    // Forearms in front of the torso cut through the garment; the capsule extends past the wrist to cover the hand.
    gl.uniform1f(this.uniforms.get('u_radius')!, options.occlusion ? shoulderWidth * .09 : 0)
    for (const [side, elbow, wrist] of [[0, 13, 15], [1, 14, 16]] as const) {
      const a = pose[elbow]!, b = pose[wrist]!
      const visible = a.visibility > .5 && b.visibility > .5 && b.z < (pose[11]!.z + pose[12]!.z) / 2 + .08
      const hand = { x: b.x + (b.x - a.x) * .3, y: b.y + (b.y - a.y) * .3 }
      gl.uniform4f(this.uniforms.get(`u_arm${side}`)!, visible ? a.x : -10, visible ? a.y : -10, visible ? hand.x : -10, visible ? hand.y : -10)
    }
    gl.uniform1f(this.uniforms.get('u_mode')!, 1)
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0)
    if (options.wire) {
      gl.uniform1f(this.uniforms.get('u_mode')!, 2)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.wireIndices); gl.drawElements(gl.LINES, this.wireCount, gl.UNSIGNED_SHORT, 0)
    }
  }
  private quadUvBuffer: WebGLBuffer | null = null
  private quadUv() {
    if (!this.quadUvBuffer) {
      const gl = this.gl
      this.quadUvBuffer = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadUvBuffer); gl.bufferData(gl.ARRAY_BUFFER, QUAD_UV, gl.STATIC_DRAW)
    }
    return this.quadUvBuffer
  }
  close() {
    const gl = this.gl
    gl.deleteTexture(this.videoTexture); gl.deleteTexture(this.garmentTexture)
    for (const buffer of [this.positions, this.uvs, this.indices, this.wireIndices, this.quadUvBuffer]) if (buffer) gl.deleteBuffer(buffer)
    gl.deleteProgram(this.program); this.texture = null; this.mesh = null
  }
}
