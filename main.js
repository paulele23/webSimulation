
import { WebGPUImplementation } from "./webGPU.js";
import { WebGLImplementation } from './webgl.js';
const inputMenu = document.getElementById('input-menu');
const mainTitle = document.getElementById('main-title');
const configMenu = document.getElementById('config-menu');
const canvasHint = document.getElementById('canvas-hint');
const fileInput = document.getElementById("csv-upload");
const canvasContainer = document.getElementById("canvas-container");
const uploadSection = document.getElementById('upload-section');
const enterVRButton = document.getElementById('enter-vr');
const visualizeOptions = document.getElementById('visualize-options');
let csv;
let simulation = null;




// Function to get selected parameters and handle submit
async function handleInputSubmit() {
    // Get input
    inputMenu.style.display = 'none';
    const mode = document.querySelector('input[name="mode-type"]:checked').value;
    if (mode === 'benchmark') {benchmark(); return;}

    mainTitle.style.display = 'none';
    const inputType = document.querySelector('input[name="input-type"]:checked').value;
    if (inputType === 'default') {
        csv = await (await fetch(document.getElementById('default-file-select').value)).text();
    } //else already set one the file was uploaded;
    const implType = document.querySelector('input[name="impl-type"]:checked').value;
    canvasContainer.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.width = 2560;
    canvas.height = 1440;
    canvasContainer.appendChild(canvas);
    if (implType === 'webgpu') {
        simulation = new WebGPUImplementation(canvas, csv);
    } else if (implType === 'webgl') {
        simulation = new WebGLImplementation(canvas, csv, enterVRButton);
        enterVRButton.style.display = '';
    } else {
        console.error("Unknown implementation type selected:", implType);
        return;
    }
    await simulation.initialize();
    simulation.isSimulationRunning = false;
    simulation.start();
    updateConfigToggleBtn();
    window.showSimulationUI();
}

document.getElementById('input-submit').addEventListener('click', handleInputSubmit);

fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        csv = e.target.result;
    };
    reader.readAsText(file);
});

// Hide/show visualize options based on mode selection

document.getElementById('mode-visualize').addEventListener('change', () => {
    visualizeOptions.style.display = '';
});
document.getElementById('mode-benchmark').addEventListener('change', () => {
    visualizeOptions.style.display = 'none';
});

// Config menu logic
const dtInput = document.getElementById("config-dt");
const gInput = document.getElementById("config-G");
const epsilonInput = document.getElementById("config-epsilon");
const computeStepsInput = document.getElementById("config-computeSteps");
const applyBtn = document.getElementById("config-apply");
const configToggleBtn = document.getElementById("config-toggle");
const sunXInput = document.getElementById("sun-x");
const sunYInput = document.getElementById("sun-y");
const sunZInput = document.getElementById("sun-z");
const setSunBtn = document.getElementById("set-sun-btn");

window.showSimulationUI = function () {
    configMenu.style.display = '';
    canvasHint.style.display = '';
    inputMenu.style.display = 'none';
    if (mainTitle) mainTitle.style.display = 'none';
};

function updateConfigToggleBtn() {
    configToggleBtn.textContent = simulation.isSimulationRunning ? "Stop Simulation" : "Start Simulation";
    configToggleBtn.style.background = simulation.isSimulationRunning ?  "#dc3545" : "#198754";
}

configToggleBtn.addEventListener("click", () => {
    simulation.isSimulationRunning = !simulation.isSimulationRunning;
    updateConfigToggleBtn();
});

applyBtn.addEventListener("click", () => {
    const dt = parseFloat(dtInput.value);
    const G = parseFloat(gInput.value);
    const epsilon = parseFloat(epsilonInput.value);
    const computeSteps = parseInt(computeStepsInput.value);
    if (!isNaN(dt)) simulation.changeTimestepToInDays(dt);
    if (!isNaN(G)) simulation.changeGToInSI(G);
    if (!isNaN(epsilon)) simulation.changeEpsilonTo(epsilon);
    if (!isNaN(computeSteps)) simulation.computeStepsPerFrame = computeSteps;
});

setSunBtn.addEventListener("click", () => {
    const x = parseFloat(sunXInput.value);
    const y = parseFloat(sunYInput.value);
    const z = parseFloat(sunZInput.value);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        simulation.setSunPosition(x, y, z);
    }
});


async function benchmark() {
    canvasContainer.innerHTML = "";
    if (!navigator.gpu) {throw new Error("WebGPU not supported on this browser.");}
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {throw new Error("No appropriate GPUAdapter found.");}
    const deviceWebGPU = await adapter.requestDevice();
    const implementations = [
        { name: "WebGPU", Impl: WebGPUImplementation },
        { name: "WebGL", Impl: WebGLImplementation }
    ];
    const defaultFiles = [
        { name: "180", path: "data/planets_and_moons.csv" },
        { name: "80000", path: "data/scenario2_n80000.csv" },
        { name: "240000", path: "data/scenario2_n240000.csv" }
    ];

    const results = [];

    for (const impl of implementations) {
        for (const file of defaultFiles) {
            // Fetch CSV data
            const csvData = await (await fetch(file.path)).text();
            // Create canvas
            const canvas = document.createElement("canvas");
            canvas.width = 2560;
            canvas.height = 1440;
            canvasContainer.appendChild(canvas);
            canvas.style.display = 'none';
            // Create simulation instance
            let sim;
            if (impl.Impl === WebGPUImplementation) {
                sim = new WebGPUImplementation(canvas, csvData, deviceWebGPU);
            } else {
                sim = new WebGLImplementation(canvas, csvData, null);
            }
            await sim.initialize();
            var result = await sim.benchmark();
            results.push({
                implementation: impl.name,
                file: file.name,
                result: result
            });
            canvasContainer.removeChild(canvas);
        }
    }

    mainTitle.style.display = 'none';
    // Visualize results as a table
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginTop = "20px";
    const header = table.insertRow();
    ["Implementation", "File", "Result"].forEach(text => {
        const th = document.createElement("th");
        th.textContent = text;
        th.style.border = "1px solid #ccc";
        th.style.padding = "8px";
        th.style.background = "#f8f8f8";
        header.appendChild(th);
    });
    results.forEach(row => {
        const tr = table.insertRow();
        [row.implementation, row.file, typeof row.result === "object" ? JSON.stringify(row.result) : row.result].forEach(val => {
            const td = document.createElement("td");
            td.textContent = val;
            td.style.border = "1px solid #ccc";
            td.style.padding = "8px";
            tr.appendChild(td);
        });
    });
    canvasContainer.appendChild(table);
}