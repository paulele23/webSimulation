import { mat4, vec3} from 'https://cdn.skypack.dev/gl-matrix';
import { loadShader } from "./utils/loadShader.js";
import { createSphere } from "./utils/createSphere.js";
import { Controls } from "./utils/control.js";
import { loadSimData, u32ToF32Bits } from "./utils/loadData.js"

export class WebGPUImplementation {
    constructor(canvas, csv, device = null) {
        this.canvas = canvas;
        this.csv = csv
        this.device = device;
        this.context = null;
        this.canvasFormat = null;
        this.WORKGROUP_SIZE = 64;
        this.simConstantsBuffer = null;
        this.simDataBuffers = null;
        this.uniformBuffer = null;
        this.bindGroups = null;
        this.pingPongCounter = 0;
        this.computeStepsPerFrame = 1;
        this.numberOfObjects = 0;
        this.vertexBuffer = null;
        this.normalBuffer = null;
        this.indexBuffer = null;
        this.depthTexture = null;
        this.controls = null;
        this.simulationPipeline = null;
        this.renderPipeline = null;
        this.indices = null;
        this.isSimulationRunning = true;
    }

    async initialize() {
        if (!this.device) {
            if (!navigator.gpu) {
                alert("WebGPU not supported on this browser.");
                throw new Error("WebGPU not supported on this browser.");
            }
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                throw new Error("No appropriate GPUAdapter found.");
            }
            this.device = await adapter.requestDevice();
        }
        this.context = this.canvas.getContext("webgpu");
        this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.canvasFormat,
        });

        // Buffers
        this.simConstantsBuffer = this.device.createBuffer({
            label: "constants",
            size: 4 * 4, //G, dt, epsilonSq, numberOfObjects
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Helper functions
        this.changeGToInSI = (value) => {
            const au = 1.49597870691e11;
            const day = 86400;
            const conversionFactor = Math.pow(au, -3) * Math.pow(day, 2);
            this.device.queue.writeBuffer(this.simConstantsBuffer, 0 * 4, new Float32Array([conversionFactor * value]));
        };
        this.changeTimestepToInDays = (value) => {
            this.device.queue.writeBuffer(this.simConstantsBuffer, 1 * 4, new Float32Array([value]));
        };
        this.changeEpsilonTo = (value) => {
            this.device.queue.writeBuffer(this.simConstantsBuffer, 2 * 4, new Float32Array([value * value]));
        };
        this.changeNumberOfObjects = (number) => {
            this.device.queue.writeBuffer(this.simConstantsBuffer, 3 * 4, new Float32Array([u32ToF32Bits(number)]));
        };

        this.changeComputeStepsPerFrame = (steps) => {
            this.computeStepsPerFrame = steps;
        };

        this.changeGToInSI(6.67430e-11);
        this.changeTimestepToInDays(0.04);
        this.changeEpsilonTo(1e-6);

        // pos/vel buffer
        const [simData, numberOfObjects] = await loadSimData(this.csv);
        this.numberOfObjects = numberOfObjects;
        this.changeNumberOfObjects(numberOfObjects);
        this.simDataBuffers = [
            this.device.createBuffer({
                label: "Sim Data A",
                size: simData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            }),
            this.device.createBuffer({
                label: "Sim Data B",
                size: simData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            }),
        ];
        this.device.queue.writeBuffer(this.simDataBuffers[0], 0, simData);
        this.device.queue.writeBuffer(this.simDataBuffers[1], 0, simData);

        this.setSunPosition = (x, y, z) => {
            const pos = new Float32Array([x, y, z]);
            // Write to both simDataBuffers at offset 0 (first 3 floats)
            this.device.queue.writeBuffer(this.simDataBuffers[0], 0, pos);
            this.device.queue.writeBuffer(this.simDataBuffers[1], 0, pos);
        };

        // sphere vertex buffer
        const { positions, normals, indices } = createSphere();
        this.indices = indices;
        this.normalBuffer = this.device.createBuffer({
            size: normals.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.normalBuffer, 0, normals);
        this.vertexBuffer = this.device.createBuffer({
            size: positions.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, positions);
        this.indexBuffer = this.device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

        // render Model–View–Projection matrix
        const uniformBufferSize = 64 + 16; // mvp + light vec
        this.uniformBuffer = this.device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create the bind group layout and pipeline layout.
        const bindGroupLayout = this.device.createBindGroupLayout({
            label: "Bind Group Layout",
            entries: [
                {
                    binding: 0, // uniform render
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: {},
                },
                {
                    binding: 1, // sim constant
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {},
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }, // sim data
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }, // sim data
                },
            ],
        });

        const pipelineLayout = this.device.createPipelineLayout({
            label: "Simulation Pipeline Layout",
            bindGroupLayouts: [bindGroupLayout], // index equals group number
        });

        // Shader
        const renderShader = await loadShader('./shader/render.wgsl');
        const shaderModule = this.device.createShaderModule({
            code: renderShader,
        });
        const simulationShader = await loadShader('./shader/compute.wgsl');
        const simulationShaderModule = this.device.createShaderModule({
            code: simulationShader,
        });

        this.simulationPipeline = this.device.createComputePipeline({
            label: "Simulation pipeline",
            layout: pipelineLayout,
            compute: {
                module: simulationShaderModule,
                entryPoint: "computeMain",
                constants: {
                    WORKGROUP_SIZE: this.WORKGROUP_SIZE,
                },
            },
        });

        this.renderPipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [
                    {
                        arrayStride: 12,
                        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }], // position
                    },
                    {
                        arrayStride: 12,
                        attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], // normal
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [
                    {
                        format: this.canvasFormat,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // bindGroup
        this.bindGroups = [
            this.device.createBindGroup({
                label: "Bind Group",
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: this.simConstantsBuffer } },
                    { binding: 2, resource: { buffer: this.simDataBuffers[0] } },
                    { binding: 3, resource: { buffer: this.simDataBuffers[1] } },
                ],
            }),
            this.device.createBindGroup({
                label: "Bind Group",
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: this.simConstantsBuffer } },
                    { binding: 2, resource: { buffer: this.simDataBuffers[1] } },
                    { binding: 3, resource: { buffer: this.simDataBuffers[0] } },
                ],
            }),
        ];

        // controls
        this.controls = new Controls(this.canvas);
    }

    start() {
        this.last_time = 0;
        const frame = (time) => {
            console.log("Frame time:", time - this.last_time);
            this.last_time = time;
            const aspect = this.canvas.width / this.canvas.height;
            const farClipping = 1000;
            const nearClipping = 0.01;
            const projection = mat4.perspective(new Float32Array(16), Math.PI / 4, aspect, nearClipping, farClipping);
            const view = this.controls.getViewMatrix();
            const mvp = mat4.multiply(new Float32Array(16), projection, view);
            const lightDir = new Float32Array([0.5, 0.7, -1.0]);
            this.device.queue.writeBuffer(this.uniformBuffer, 0, mvp);
            this.device.queue.writeBuffer(this.uniformBuffer, 64, lightDir);

            const encoder = this.device.createCommandEncoder();
            const workgroupCount = Math.ceil(this.numberOfObjects / this.WORKGROUP_SIZE);
            const computePass = encoder.beginComputePass();
            computePass.setPipeline(this.simulationPipeline);
            for (let i = 0; i < this.computeStepsPerFrame * this.isSimulationRunning; ++i) {
                computePass.setBindGroup(0, this.bindGroups[this.pingPongCounter]);
                computePass.dispatchWorkgroups(workgroupCount);
                this.pingPongCounter = (this.pingPongCounter + 1) % 2;
            }
            computePass.end();

            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.context.getCurrentTexture().createView(),
                        loadOp: 'clear',
                        storeOp: 'store',
                        clearValue: { r: 0, g: 0, b: 0.05, a: 1 },
                    },
                ],
                depthStencilAttachment: {
                    view: this.depthTexture.createView(),
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                    depthClearValue: 1.0,
                },
            });

            pass.setPipeline(this.renderPipeline);
            pass.setVertexBuffer(0, this.vertexBuffer);
            pass.setVertexBuffer(1, this.normalBuffer);
            pass.setIndexBuffer(this.indexBuffer, 'uint32');
            pass.setBindGroup(0, this.bindGroups[this.pingPongCounter]);
            pass.drawIndexed(this.indices.length, this.numberOfObjects);
            pass.end();

            this.device.queue.submit([encoder.finish()]);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    computeNSteps(n) {
        const workgroupCount = Math.ceil(this.numberOfObjects / this.WORKGROUP_SIZE);
        const encoder = this.device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.simulationPipeline);
        for (let i = 0; i < n; ++i) {
            computePass.setBindGroup(0, this.bindGroups[this.pingPongCounter]);
            computePass.dispatchWorkgroups(workgroupCount);
            this.pingPongCounter = (this.pingPongCounter + 1) % 2;
        }
        computePass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    async benchmark() {
        const N = 1000;
        const encoder = this.device.createCommandEncoder();
        const start = performance.now();
        const workgroupCount = Math.ceil(this.numberOfObjects / this.WORKGROUP_SIZE);
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.simulationPipeline);
        for (let i = 0; i < N; ++i) {
            computePass.setBindGroup(0, this.bindGroups[this.pingPongCounter]);
            computePass.dispatchWorkgroups(workgroupCount);
            this.pingPongCounter = (this.pingPongCounter + 1) % 2;
        }
        computePass.end();
        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        const end = performance.now();
        console.log(`Benchmark completed in ${end - start} ms for ${N} compute steps.`);
        return (end - start)/ N;
    }
}