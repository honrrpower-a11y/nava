/* NAVA on-device depth estimation and 2.5D parallax renderer.
   Source photos stay in the browser; only the public model weights are downloaded. */
let depthPipelinePromise=null;
let renderer=null;
const textureCache=new WeakMap();

async function loadDepthPipeline(onProgress){
  if(depthPipelinePromise)return depthPipelinePromise;
  depthPipelinePromise=(async()=>{
    // Avoid the heavy CPU/WASM fallback on phones; a gentle 2D move is better than freezing the editor.
    if(!navigator.gpu)throw new Error("شتاب‌دهنده WebGPU در این دستگاه فعال نیست؛ حرکت عمقی برای حفظ روانی گوشی کنار گذاشته شد.");
    const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
    env.allowLocalModels=false;
    const model="onnx-community/depth-anything-v2-small";
    const progress_callback=info=>{if(typeof onProgress==="function")onProgress(info);};
    return await pipeline("depth-estimation",model,{device:"webgpu",dtype:"fp16",progress_callback});
  })().catch(error=>{depthPipelinePromise=null;throw error;});
  return depthPipelinePromise;
}

export async function estimateDepth(image,onProgress){
  if(!image||!image.naturalWidth)throw new Error("تصویر برای تحلیل عمق آماده نیست.");
  const estimator=await loadDepthPipeline(onProgress);
  // Downscale before inference; 448px is sufficient for broad foreground/background depth.
  const scale=Math.min(1,448/Math.max(image.naturalWidth,image.naturalHeight));
  const input=document.createElement("canvas");input.width=Math.max(2,Math.round(image.naturalWidth*scale));input.height=Math.max(2,Math.round(image.naturalHeight*scale));
  input.getContext("2d",{alpha:false}).drawImage(image,0,0,input.width,input.height);
  const output=await estimator(input);
  const raw=output?.depth;
  if(!raw?.data||!raw.width||!raw.height)throw new Error("مدل نقشه عمق معتبری تولید نکرد.");
  const width=raw.width,height=raw.height,source=raw.data,channels=raw.channels||1;
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++){
    const value=source[i*channels]??0,at=i*4;
    rgba[at]=value;rgba[at+1]=value;rgba[at+2]=value;rgba[at+3]=255;
  }
  return {width,height,data:rgba};
}

function shader(gl,type,source){
  const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
  if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(item)||"shader compile failed";gl.deleteShader(item);throw new Error(message);}
  return item;
}
function createRenderer(){
  if(renderer)return renderer;
  const canvas=document.createElement("canvas");
  const gl=canvas.getContext("webgl",{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:"low-power"});
  if(!gl)return null;
  const vertex=shader(gl,gl.VERTEX_SHADER,`
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}
  `);
  const fragment=shader(gl,gl.FRAGMENT_SHADER,`
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_image;
    uniform sampler2D u_depth;
    uniform float u_progress;
    uniform float u_strength;
    void main(){
      float depth=texture2D(u_depth,v_uv).r;
      // Depth-dependent, one-way parallax: foreground and background drift at different rates.
      // No oscillating X/Y camera roll or orbit.
      float travel=smoothstep(0.0,1.0,u_progress)-0.5;
      float displacement=(depth-0.5)*u_strength*travel;
      vec2 uv=clamp(v_uv+vec2(displacement,displacement*0.06),vec2(0.002),vec2(0.998));
      gl_FragColor=texture2D(u_image,uv);
    }
  `);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"shader link failed");
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,"a_position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  renderer={canvas,gl,program,buffer,imageLocation:gl.getUniformLocation(program,"u_image"),depthLocation:gl.getUniformLocation(program,"u_depth"),progressLocation:gl.getUniformLocation(program,"u_progress"),strengthLocation:gl.getUniformLocation(program,"u_strength")};
  return renderer;
}
function makeTexture(gl,source){
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  return texture;
}
function prepareTextures(image,depthMap){
  const state=createRenderer();if(!state)return null;
  let cached=textureCache.get(image);
  if(cached&&cached.depthMap===depthMap)return cached;
  const max=900,scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
  const width=Math.max(2,Math.round(image.naturalWidth*scale)),height=Math.max(2,Math.round(image.naturalHeight*scale));
  const imageCanvas=document.createElement("canvas");imageCanvas.width=width;imageCanvas.height=height;
  imageCanvas.getContext("2d").drawImage(image,0,0,width,height);
  const depthCanvas=document.createElement("canvas");depthCanvas.width=depthMap.width;depthCanvas.height=depthMap.height;
  const depthCtx=depthCanvas.getContext("2d");depthCtx.putImageData(new ImageData(depthMap.data,depthMap.width,depthMap.height),0,0);
  const gl=state.gl;
  if(cached){gl.deleteTexture(cached.imageTexture);gl.deleteTexture(cached.depthTexture);}
  cached={depthMap,width,height,imageTexture:makeTexture(gl,imageCanvas),depthTexture:makeTexture(gl,depthCanvas)};
  textureCache.set(image,cached);
  return cached;
}

export function canRenderDepthParallax(){try{return !!createRenderer();}catch(error){console.warn("NAVA depth renderer:",error);return false;}}

export function renderDepthParallax(image,depthMap,progress=0){
  if(!image||!depthMap)return null;
  try{
    const state=createRenderer(),cached=prepareTextures(image,depthMap);if(!state||!cached)return null;
    const gl=state.gl;state.canvas.width=cached.width;state.canvas.height=cached.height;gl.viewport(0,0,cached.width,cached.height);gl.useProgram(state.program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,cached.imageTexture);gl.uniform1i(state.imageLocation,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,cached.depthTexture);gl.uniform1i(state.depthLocation,1);
    gl.uniform1f(state.progressLocation,Math.max(0,Math.min(1,Number(progress)||0)));gl.uniform1f(state.strengthLocation,.026);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    return state.canvas;
  }catch(error){console.warn("NAVA depth parallax frame:",error);return null;}
}
