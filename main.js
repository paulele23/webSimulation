import { WebGPUImplementation } from "./webGPU.js";

// File upload and dynamic initialization
const fileInput = document.getElementById("csv-upload");
const canvasContainer = document.getElementById("canvas-container");
const configMenu = document.getElementById('config-menu');
const canvasHint = document.getElementById('canvas-hint');
const uploadSection = document.getElementById('upload-section');

// Hide config and hint by default
configMenu.style.display = 'none';
canvasHint.style.display = 'none';

// Expose a function for main.js to show config/hint and hide upload
window.showSimulationUI = function() {
    configMenu.style.display = '';
    canvasHint.style.display = '';
    uploadSection.style.display = 'none';
};

let webgpu = null;

fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const csv = e.target.result;
        // Remove previous canvas if exists
        canvasContainer.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = 2560;
        canvas.height = 1440;
        canvasContainer.appendChild(canvas);
        webgpu = new WebGPUImplementation(canvas, csv);
        await webgpu.initialize();
        webgpu.isSimulationRunning = false;
        webgpu.start();
        updateConfigToggleBtn();
        if (window.showSimulationUI) window.showSimulationUI();
        console.log("WebGPU initialized and started.");
    };
    reader.readAsText(file);
});

//benchmark

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

function updateConfigToggleBtn() {
    configToggleBtn.textContent = webgpu.isSimulationRunning ? "Stop Simulation" : "Start Simulation";
    configToggleBtn.style.background = webgpu.isSimulationRunning ?  "#dc3545" : "#198754";
}

configToggleBtn.addEventListener("click", () => {
    webgpu.isSimulationRunning = !webgpu.isSimulationRunning;
    updateConfigToggleBtn();
});

applyBtn.addEventListener("click", () => {
    const dt = parseFloat(dtInput.value);
    const G = parseFloat(gInput.value);
    const epsilon = parseFloat(epsilonInput.value);
    const computeSteps = parseInt(computeStepsInput.value);
    if (!isNaN(dt)) webgpu.changeTimestepToInDays(dt);
    if (!isNaN(G)) webgpu.changeGToInSI(G);
    if (!isNaN(epsilon)) webgpu.changeEpsilonTo(epsilon);
    if (!isNaN(computeSteps)) webgpu.computeStepsPerFrame = computeSteps;
});

setSunBtn.addEventListener("click", () => {
    const x = parseFloat(sunXInput.value);
    const y = parseFloat(sunYInput.value);
    const z = parseFloat(sunZInput.value);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        webgpu.setSunPosition(x, y, z);
    }
});

updateConfigToggleBtn();