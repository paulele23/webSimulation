import { createSphere } from "./utils/createSphere.js";
import { mat4, vec3} from 'https://cdn.skypack.dev/gl-matrix';
import { Controls } from "./utils/control.js";
import { loadSimData } from "./utils/loadData.js"
import { loadShader } from "./utils/loadShader.js";


const canvas = document.getElementById('canvas');
// Switch to WebGL2 context
const gl = canvas.getContext('webgl2', { xrCompatible: true });

if (!gl) {
    alert('WebGL2 not supported!');
}

const vertexShaderSource = await loadShader("./shader/webgl.vert");
const fragmentShaderSource = await loadShader("./shader/webgl.frag");

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Set up matrices
const projectionMatrix = mat4.create();
const modelViewMatrix = mat4.create();
const normalMatrix = mat4.create();
const program = gl.createProgram();
var indexBuffer;
var indices;
var numberOfObjects;
let ping = true;
let simTextures; // Ping-pong state
let simTexLoc;

async function setup() {
    // Compile shaders
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    // Create program

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Assume your data arrays are already defined
    const { positions, normals, ...x } = createSphere();
    indices = x.indices;

    // Create and bind vertex buffer
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create and bind normal buffer
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // Create and bind index buffer
    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // Setup attributes
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aPosition, 0);

    const aNormal = gl.getAttribLocation(program, 'aNormal');
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aNormal, 0);
    
    const csv = await (await fetch("./data/input.csv")).text();
    const simData = await loadSimData(csv);
    numberOfObjects = simData[1];
    // Create two textures for ping-ponging
    const simdTextureA = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, simdTextureA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        3, // width
        numberOfObjects, // height
        0,
        gl.RGBA,
        gl.FLOAT,
        simData[0]
    );

    const simdTextureB = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, simdTextureB);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Assume 3 rows, 4 columns, 1 RGBA float per texel (12 floats per row)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        3, // width
        numberOfObjects, // height
        0,
        gl.RGBA,
        gl.FLOAT,
        simData[0]
    );

    simTextures = [simdTextureA, simdTextureB]; // Store textures for ping-ponging

    // Bind texture to vertex and fragment shader
    simTexLoc = gl.getUniformLocation(program, 'uSimdTex');
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTextures[ping ? 0 : 1]);
    gl.uniform1i(simTexLoc, 0);


    mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
    mat4.lookAt(modelViewMatrix, [0, 0, 0], [0, 0, 0], [0, 1, 0]);
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);

    // Pass matrices to shader
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, projectionMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModelViewMatrix'), false, modelViewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uNormalMatrix'), false, normalMatrix);

    // Light uniforms
    gl.uniform3fv(gl.getUniformLocation(program, 'uLightPosition'), [5.0, 5.0, 5.0]);
    gl.uniform3fv(gl.getUniformLocation(program, 'uLightColor'), [1.0, 1.0, 1.0]);
    gl.uniform3fv(gl.getUniformLocation(program, 'uAmbientColor'), [0.6, 0.6, 0.6]);

    // Clear and draw
    gl.clearColor(0.0, 0.0, 0.05, 1.0);
    gl.enable(gl.DEPTH_TEST);
}

await setup();
let startingPosition = [0, 0, 2];
let controls = new Controls(canvas, startingPosition, 0.0004, 20);



function drawScene() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTextures[ping ? 0 : 1]);
    gl.uniform1i(simTexLoc, 0);
    ping = !ping;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0, numberOfObjects);
}


// --- WebXR VR support additions ---
let xrSession = null;
let xrRefSpace = null;
let xrMoveSpeed = 0.2; // meters per frame for joystick movement
let xrUserPosition = [0, 0, -5]; // x, y, z offset in reference space

const enterVRButton = document.getElementById('enter-vr');
if (enterVRButton) {
    enterVRButton.addEventListener('click', async () => {
        if (navigator.xr) {
            xrSession = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
            xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(xrSession, gl) });
            xrRefSpace = await xrSession.requestReferenceSpace('local-floor');
            xrSession.addEventListener('end', () => {
                xrSession = null;
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                controls.initControls();
                requestAnimationFrame(frame);
            });
            controls.removeControls();
            xrSession.requestAnimationFrame(onXRFrame);
        } else {
            alert('WebXR not supported');
        }
    });
}

function onXRFrame(time, frame) {
    const session = frame.session;
    let refSpace = xrRefSpace;
    // Handle joystick movement
    const inputSources = session.inputSources;
    for (const inputSource of inputSources) {
        if (inputSource && inputSource.gamepad && inputSource.handedness === 'left') {
            const axes = inputSource.gamepad.axes;
            // axes[3] is usually the vertical axis of the left stick (forward/backward)
            if (axes && axes.length >= 4) {
                const forward = -axes[3]; // up is negative, down is positive
                if (Math.abs(forward) > 0.1) { // deadzone
                    // Get the viewer's forward direction from the pose
                    const pose = frame.getViewerPose(refSpace);
                    if (pose) {
                        const view = pose.views[0];
                        // Forward vector is -z in view matrix
                        const orientation = view.transform.orientation;
                        // Convert quaternion to forward vector
                        const q = orientation;
                        // Forward vector for WebXR: [0, 0, -1] rotated by q
                        const fx = 2 * (q.x * q.z + q.w * q.y);
                        const fy = 2 * (q.y * q.z - q.w * q.x);
                        const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
                        // Normalize
                        const len = Math.sqrt(fx*fx + fy*fy + fz*fz);
                        const forwardVec = [fx/len, fy/len, fz/len];
                        // Move user position
                        xrUserPosition[0] += forwardVec[0] * forward * xrMoveSpeed;
                        xrUserPosition[1] += forwardVec[1] * forward * xrMoveSpeed;
                        xrUserPosition[2] += forwardVec[2] * forward * xrMoveSpeed;
                    }
                }
            }
        }
    }
    // Offset reference space by user movement
    refSpace = xrRefSpace.getOffsetReferenceSpace(new XRRigidTransform({x: xrUserPosition[0], y: xrUserPosition[1], z: xrUserPosition[2]}));
    const pose = frame.getViewerPose(refSpace);
    if (!pose) {
        session.requestAnimationFrame(onXRFrame);
        return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const view of pose.views) {
        const viewport = session.renderState.baseLayer.getViewport(view);
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        // Set matrices from XRView
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, view.projectionMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModelViewMatrix'), false, view.transform.inverse.matrix);
        // Normal matrix
        mat4.invert(normalMatrix, view.transform.inverse.matrix);
        mat4.transpose(normalMatrix, normalMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uNormalMatrix'), false, normalMatrix);
        drawScene();
    }
    session.requestAnimationFrame(onXRFrame);
}


function frame() {
    // Only run if not in XR session
    if (xrSession) return;
    const modelViewMatrix = controls.getViewMatrix();;
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModelViewMatrix'), false, modelViewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uNormalMatrix'), false, normalMatrix);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawScene();
    console.log('Frame rendered');
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);