import { createSphere } from "./utils/createSphere.js";
import { mat4, vec3} from 'https://cdn.skypack.dev/gl-matrix';
import { Controls } from "./utils/control.js";
import { loadSimData, loadSimDataSplit } from "./utils/loadData.js"
import { loadShader } from "./utils/loadShader.js";


const canvas = document.getElementById('canvas');
// Switch to WebGL2 context
const gl = canvas.getContext('webgl2', { xrCompatible: true });
if (!gl) {
    alert('WebGL2 not supported!');
}
const ext = gl.getExtension('EXT_color_buffer_float');
if (!ext) {
    alert('Extension not supported!');
}

const csv = await (await fetch("./data/input.csv")).text();
const vertexShaderSource = await loadShader("./shader/webgl.vert");
const fragmentShaderSource = await loadShader("./shader/webgl.frag");
const computeVertexSource = await loadShader("./shader/webglCompute.vert");
const computeVelFragmentSource = await loadShader("./shader/webglComputeVel.frag");
const computePosFragmentSource = await loadShader("./shader/webglComputePos.frag");

// Set up matrices
const projectionMatrix = mat4.create();
const modelViewMatrix = mat4.create();
const normalMatrix = mat4.create();
const program = gl.createProgram();
var vertexBuffer;
var normalBuffer;
var aPosition;
var aNormal;
var indexBuffer;
var indices;
var numberOfObjects;
let ping = true;
let simTexturePos;
let simTextureVel; // Ping-pong state
let simPosLoc;
let simVelLoc;
let xrSession;

// --- Compute step resources ---
let computeFramebuffer;
let computeVelProgram;
let computePosProgram;
let computeQuadVBO;

//simulation parameters
let G;
let dt = 0.04;
let epsilonSq = 1e-6;

function changeGToInSI(gInSI) {
    const au = 1.49597870691e11;
    const day = 86400;
    const conversionFactor = Math.pow(au, -3) * Math.pow(day, 2);
    G = conversionFactor * gInSI;
}

changeGToInSI(6.67430e-11); // Gravitational constant in m^3 kg^-1 s^-2

async function initialize() {
    // Compile shaders
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    // Create program

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);


    const cVert = compileShader(gl.VERTEX_SHADER, computeVertexSource);
    const cVelFrag = compileShader(gl.FRAGMENT_SHADER, computeVelFragmentSource);
    const cPosFrag = compileShader(gl.FRAGMENT_SHADER, computePosFragmentSource);
    
    //create compute Pipline for vel update
    computeVelProgram = gl.createProgram();
    gl.attachShader(computeVelProgram, cVert);
    gl.attachShader(computeVelProgram, cVelFrag);
    gl.linkProgram(computeVelProgram);

    //create compute Pipline for position update
    computePosProgram = gl.createProgram();
    gl.attachShader(computePosProgram, cVert);
    gl.attachShader(computePosProgram, cPosFrag);
    gl.linkProgram(computePosProgram);

    // Fullscreen quad VBO
    computeQuadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, computeQuadVBO);
    // 2 triangles covering [-1,1]x[-1,1]
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    // Framebuffer for compute output
    computeFramebuffer = gl.createFramebuffer();

    // Assume your data arrays are already defined
    const { positions, normals, ...x } = createSphere();
    indices = x.indices;

    // Create and bind vertex buffer
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Create and bind normal buffer
    normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // Create and bind index buffer
    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    // Setup attributes
    aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aPosition, 0);

    aNormal = gl.getAttribLocation(program, 'aNormal');
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aNormal, 0);
    
    
    function createSimDataTexture(data, length) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Assume 3 rows, 4 columns, 1 RGBA float per texel (12 floats per row)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            1, // width
            length, // height
            0,
            gl.RGBA,
            gl.FLOAT,
            data
        );
        return texture;
        
    }

    const simData = await loadSimDataSplit(csv);
    const simDataPos = simData[0];
    const simDataVel = simData[1];
    numberOfObjects = simData[2];
    // Create two textures for ping-ponging
    const simTexturePosA = createSimDataTexture(simDataPos, numberOfObjects);
    const simTexturePosB = createSimDataTexture(simDataPos, numberOfObjects);
    simTexturePos = [simTexturePosA, simTexturePosB];
    const simDataTextureVelA = createSimDataTexture(simDataVel, numberOfObjects);
    const simDataTextureVelB = createSimDataTexture(simDataVel, numberOfObjects);
    simTextureVel = [simDataTextureVelA, simDataTextureVelB];
    // --- End compute setup ---
    

    // Bind textures to vertex and fragment shader
    simPosLoc = gl.getUniformLocation(program, 'simTexturePos');
    simVelLoc = gl.getUniformLocation(program, 'simTextureVel');
    gl.useProgram(program);
    // Bind position texture to TEXTURE0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTexturePos[ping ? 0 : 1]);
    gl.uniform1i(simPosLoc, 0);
    // Bind velocity texture to TEXTURE1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simTextureVel[ping ? 0 : 1]);
    if (simVelLoc !== null) gl.uniform1i(simVelLoc, 1);


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

function computeNSimulationSteps(N=100) {
    for (let i = 0; i < N; i++) {
        runPiplineDefinedIn(
            computeVelProgram, //program
            simTexturePos[ping ? 0 : 1], simTextureVel[ping ? 0 : 1], //input textures
            simTextureVel[!ping ? 0 : 1]); //output texture // Swap after compute
        runPiplineDefinedIn(
            computePosProgram,
            simTexturePos[ping ? 0 : 1], simTextureVel[!ping ? 0 : 1],
            simTexturePos[!ping ? 0 : 1]);
        ping = !ping;
    }
    restoreRenderState();
}

function runPiplineDefinedIn(programToCompute, inputTexturePos, inputTextureVel, outputTexture) {
    // Bind output texture to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, computeFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
    // Set viewport to texture size
    gl.viewport(0, 0, 1, numberOfObjects);
    gl.useProgram(programToCompute);
    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(programToCompute, 'dt'), dt);
    gl.uniform1f(gl.getUniformLocation(programToCompute, 'G'), G);
    gl.uniform1f(gl.getUniformLocation(programToCompute, 'epsilonSq'), epsilonSq);
    gl.uniform1i(gl.getUniformLocation(programToCompute, 'numberOfObjects'), numberOfObjects);
    // Bind input textures
    const locA = gl.getUniformLocation(programToCompute, 'uTexA');
    const locB = gl.getUniformLocation(programToCompute, 'uTexB');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexturePos);
    gl.uniform1i(locA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, inputTextureVel);
    gl.uniform1i(locB, 1);
    // Draw fullscreen quad
    const quadLoc = gl.getAttribLocation(programToCompute, 'aQuadPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, computeQuadVBO);
    gl.enableVertexAttribArray(quadLoc);
    gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(quadLoc);
}

function restoreRenderState() {
    if (xrSession) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, xrSession.renderState.baseLayer.framebuffer);
        const viewport = xrSession.renderState.baseLayer.getViewport(xrSession.renderState.baseLayer.views[0]);
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
}

function renderStep() {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

    // Restore normal buffer and attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

    // Bind position texture to TEXTURE0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simTexturePos[ping ? 0 : 1]);
    gl.uniform1i(simPosLoc, 0);
    // Bind velocity texture to TEXTURE1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simTextureVel[ping ? 0 : 1]);
    gl.uniform1i(simVelLoc, 1);
    
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElementsInstanced(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0, numberOfObjects);
}

function drawScene() {
    computeNSimulationSteps();
    renderStep();
}

function start() {
    let startingPosition = [0, 0, 2];
let controls = new Controls(canvas, startingPosition, 0.0004, 20);

// --- WebXR VR support additions ---
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
}

await initialize();
start()


