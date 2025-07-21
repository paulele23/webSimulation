
import { createSphere } from "./utils/createSphere.js";
import { mat4, vec3} from 'https://cdn.skypack.dev/gl-matrix';
import { Controls } from "./utils/control.js";
import { loadSimDataSplit } from "./utils/loadData.js";
import { loadShader } from "./utils/loadShader.js";

class WebGLImplementation {
    constructor(canvas, csv, enterVRButton) {
        this.canvas = canvas;
        this.csv = csv;
        this.enterVRButton = enterVRButton;
        this.gl = canvas.getContext('webgl2', { xrCompatible: true });
        if (!this.gl) {
            alert('WebGL2 not supported!');
        }
        const ext = this.gl.getExtension('EXT_color_buffer_float');
        if (!ext) {
            alert('Extension not supported!');
        }
        this.ping = true;
        this.dt = 0.04;
        this.epsilonSq = 1e-6;
        this.isSimulationRunning = false;
        this.computeStepsPerFrame = 1;
        this.G = undefined;
        this.xrSession = null;
        this.xrRefSpace = null;
        this.xrMoveSpeed = 0.2;
        this.xrUserPosition = [0, 0, -5];
        this.controls = null;
        this.program = this.gl.createProgram();
        this.projectionMatrix = mat4.create();
        this.modelViewMatrix = mat4.create();
        this.normalMatrix = mat4.create();
    }

    changeGToInSI(gInSI) {
        const au = 1.49597870691e11;
        const day = 86400;
        const conversionFactor = Math.pow(au, -3) * Math.pow(day, 2);
        this.G = conversionFactor * gInSI;
    }
    changeEpsilonTo(value){
        this.epsilonSq = value * value;
    }
    changeTimestepToInDays(value) {
        this.dt = value;
    }

    setSunPosition(x, y, z) {
        const gl = this.gl;
        const activeIdx = this.ping ? 0 : 1;
        gl.bindTexture(gl.TEXTURE_2D, this.simTexturePos[activeIdx]);
        const sunData = new Float32Array([x, y, z, 1.988469999999999977e+30]);
        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0, // xoffset
            0, // yoffset
            1, // width
            1, // height
            gl.RGBA,
            gl.FLOAT,
            sunData
        );
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile failed:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createSimDataTexture(data, length) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            1,
            length,
            0,
            gl.RGBA,
            gl.FLOAT,
            data
        );
        return texture;
    }

    async initialize() {
        const gl = this.gl;
        this.changeGToInSI(6.67430e-11);
        const vertexShaderSource = await loadShader("./shader/webgl.vert");
        const fragmentShaderSource = await loadShader("./shader/webgl.frag");
        const computeVertexSource = await loadShader("./shader/webglCompute.vert");
        const computeVelFragmentSource = await loadShader("./shader/webglComputeVel.frag");
        const computePosFragmentSource = await loadShader("./shader/webglComputePos.frag");

        // Compile shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        gl.useProgram(this.program);

        const cVert = this.compileShader(gl.VERTEX_SHADER, computeVertexSource);
        const cVelFrag = this.compileShader(gl.FRAGMENT_SHADER, computeVelFragmentSource);
        const cPosFrag = this.compileShader(gl.FRAGMENT_SHADER, computePosFragmentSource);

        //create compute Pipline for vel update
        this.computeVelProgram = gl.createProgram();
        gl.attachShader(this.computeVelProgram, cVert);
        gl.attachShader(this.computeVelProgram, cVelFrag);
        gl.linkProgram(this.computeVelProgram);

        //create compute Pipline for position update
        this.computePosProgram = gl.createProgram();
        gl.attachShader(this.computePosProgram, cVert);
        gl.attachShader(this.computePosProgram, cPosFrag);
        gl.linkProgram(this.computePosProgram);

        // Fullscreen quad VBO
        this.computeQuadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.computeQuadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);

        // Framebuffer for compute output
        this.computeFramebuffer = gl.createFramebuffer();

        // Sphere geometry
        const { positions, normals, ...x } = createSphere();
        this.indices = x.indices;

        // Create and bind vertex buffer
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        // Create and bind normal buffer
        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        // Create and bind index buffer
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.STATIC_DRAW);

        // Setup attributes
        this.aPosition = gl.getAttribLocation(this.program, 'aPosition');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(this.aPosition, 0);

        this.aNormal = gl.getAttribLocation(this.program, 'aNormal');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(this.aNormal, 0);

        const simData = await loadSimDataSplit(this.csv);
        const simDataPos = simData[0];
        const simDataVel = simData[1];
        this.numberOfObjects = simData[2];
        // Create two textures for ping-ponging
        const simTexturePosA = this.createSimDataTexture(simDataPos, this.numberOfObjects);
        const simTexturePosB = this.createSimDataTexture(simDataPos, this.numberOfObjects);
        this.simTexturePos = [simTexturePosA, simTexturePosB];
        const simDataTextureVelA = this.createSimDataTexture(simDataVel, this.numberOfObjects);
        const simDataTextureVelB = this.createSimDataTexture(simDataVel, this.numberOfObjects);
        this.simTextureVel = [simDataTextureVelA, simDataTextureVelB];

        // Bind textures to vertex and fragment shader
        this.simPosLoc = gl.getUniformLocation(this.program, 'simTexturePos');
        this.simVelLoc = gl.getUniformLocation(this.program, 'simTextureVel');
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.simTexturePos[this.ping ? 0 : 1]);
        gl.uniform1i(this.simPosLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.simTextureVel[this.ping ? 0 : 1]);
        if (this.simVelLoc !== null) gl.uniform1i(this.simVelLoc, 1);

        mat4.perspective(this.projectionMatrix, Math.PI / 4, this.canvas.width / this.canvas.height, 0.1, 100.0);
        mat4.lookAt(this.modelViewMatrix, [0, 0, 0], [0, 0, 0], [0, 1, 0]);
        mat4.invert(this.normalMatrix, this.modelViewMatrix);
        mat4.transpose(this.normalMatrix, this.normalMatrix);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uProjectionMatrix'), false, this.projectionMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uModelViewMatrix'), false, this.modelViewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uNormalMatrix'), false, this.normalMatrix);

        gl.uniform3fv(gl.getUniformLocation(this.program, 'uLightPosition'), [5.0, 5.0, 5.0]);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'uLightColor'), [1.0, 1.0, 1.0]);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'uAmbientColor'), [0.6, 0.6, 0.6]);

        gl.clearColor(0.0, 0.0, 0.05, 1.0);
        gl.enable(gl.DEPTH_TEST);
    }

    computeNSimulationSteps() {
        for (let i = 0; i < this.computeStepsPerFrame*this.isSimulationRunning; i++) {
            this.runPiplineDefinedIn(
                this.computeVelProgram,
                this.simTexturePos[this.ping ? 0 : 1], this.simTextureVel[this.ping ? 0 : 1],
                this.simTextureVel[!this.ping ? 0 : 1]
            );
            this.runPiplineDefinedIn(
                this.computePosProgram,
                this.simTexturePos[this.ping ? 0 : 1], this.simTextureVel[!this.ping ? 0 : 1],
                this.simTexturePos[!this.ping ? 0 : 1]
            );
            this.ping = !this.ping;
        }
        this.restoreRenderState();
    }

    runPiplineDefinedIn(programToCompute, inputTexturePos, inputTextureVel, outputTexture) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.computeFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
        gl.viewport(0, 0, 1, this.numberOfObjects);
        gl.useProgram(programToCompute);
        gl.uniform1f(gl.getUniformLocation(programToCompute, 'dt'), this.dt);
        gl.uniform1f(gl.getUniformLocation(programToCompute, 'G'), this.G);
        gl.uniform1f(gl.getUniformLocation(programToCompute, 'epsilonSq'), this.epsilonSq);
        gl.uniform1i(gl.getUniformLocation(programToCompute, 'numberOfObjects'), this.numberOfObjects);
        const locA = gl.getUniformLocation(programToCompute, 'uTexA');
        const locB = gl.getUniformLocation(programToCompute, 'uTexB');
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexturePos);
        gl.uniform1i(locA, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, inputTextureVel);
        gl.uniform1i(locB, 1);
        const quadLoc = gl.getAttribLocation(programToCompute, 'aQuadPos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.computeQuadVBO);
        gl.enableVertexAttribArray(quadLoc);
        gl.vertexAttribPointer(quadLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(quadLoc);
    }

    restoreRenderState() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    renderStep() {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.aPosition);
        gl.vertexAttribPointer(this.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.enableVertexAttribArray(this.aNormal);
        gl.vertexAttribPointer(this.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.simTexturePos[this.ping ? 0 : 1]);
        gl.uniform1i(this.simPosLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.simTextureVel[this.ping ? 0 : 1]);
        gl.uniform1i(this.simVelLoc, 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElementsInstanced(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0, this.numberOfObjects);
    }

    drawScene() {
        this.computeNSimulationSteps();
        this.renderStep();
    }

    start() {
        let startingPosition = [0, 0, 2];
        this.controls = new Controls(this.canvas, startingPosition, 0.0004, 20);
        if (this.enterVRButton) {
            this.enterVRButton.addEventListener('click', async () => {
                if (navigator.xr) {
                    this.xrSession = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
                    this.xrSession.updateRenderState({ baseLayer: new XRWebGLLayer(this.xrSession, this.gl) });
                    this.xrRefSpace = await this.xrSession.requestReferenceSpace('local-floor');
                    this.xrSession.addEventListener('end', () => {
                        this.xrSession = null;
                        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
                        this.controls.initControls();
                        requestAnimationFrame(this.frame.bind(this));
                    });
                    this.controls.removeControls();
                    this.xrSession.requestAnimationFrame(this.onXRFrame.bind(this));
                } else {
                    alert('WebXR not supported');
                }
            });
        }
        requestAnimationFrame(this.frame.bind(this));
    }

    onXRFrame(time, frame) {
        const session = frame.session;
        let refSpace = this.xrRefSpace;
        const inputSources = session.inputSources;
        for (const inputSource of inputSources) {
            if (inputSource && inputSource.gamepad && inputSource.handedness === 'left') {
                const axes = inputSource.gamepad.axes;
                if (axes && axes.length >= 4) {
                    const forward = -axes[3];
                    if (Math.abs(forward) > 0.1) {
                        const pose = frame.getViewerPose(refSpace);
                        if (pose) {
                            const view = pose.views[0];
                            const orientation = view.transform.orientation;
                            const q = orientation;
                            const fx = 2 * (q.x * q.z + q.w * q.y);
                            const fy = 2 * (q.y * q.z - q.w * q.x);
                            const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
                            const len = Math.sqrt(fx*fx + fy*fy + fz*fz);
                            const forwardVec = [fx/len, fy/len, fz/len];
                            this.xrUserPosition[0] += forwardVec[0] * forward * this.xrMoveSpeed;
                            this.xrUserPosition[1] += forwardVec[1] * forward * this.xrMoveSpeed;
                            this.xrUserPosition[2] += forwardVec[2] * forward * this.xrMoveSpeed;
                        }
                    }
                }
            }
        }
        refSpace = this.xrRefSpace.getOffsetReferenceSpace(new XRRigidTransform({x: this.xrUserPosition[0], y: this.xrUserPosition[1], z: this.xrUserPosition[2]}));
        const pose = frame.getViewerPose(refSpace);
        if (!pose) {
            session.requestAnimationFrame(this.onXRFrame.bind(this));
            return;
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        for (const view of pose.views) {
            const viewport = session.renderState.baseLayer.getViewport(view);
            this.gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'uProjectionMatrix'), false, view.projectionMatrix);
            this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'uModelViewMatrix'), false, view.transform.inverse.matrix);
            mat4.invert(this.normalMatrix, view.transform.inverse.matrix);
            mat4.transpose(this.normalMatrix, this.normalMatrix);
            this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'uNormalMatrix'), false, this.normalMatrix);
            this.drawScene();
        }
        session.requestAnimationFrame(this.onXRFrame.bind(this));
    }

    frame() {
        if (this.xrSession) return;
        const modelViewMatrix = this.controls.getViewMatrix();
        mat4.invert(this.normalMatrix, modelViewMatrix);
        mat4.transpose(this.normalMatrix, this.normalMatrix);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'uModelViewMatrix'), false, modelViewMatrix);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'uNormalMatrix'), false, this.normalMatrix);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.drawScene();
        requestAnimationFrame(this.frame.bind(this));
    }
}

export { WebGLImplementation };


