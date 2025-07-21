import { WebGPUImplementation } from "./webGPU.js";
import { WebGLImplementation } from './webgl.js';

// File upload and dynamic initialization
const fileInput = document.getElementById("csv-upload");
const canvasContainer = document.getElementById("canvas-container");
const configMenu = document.getElementById('config-menu');
const canvasHint = document.getElementById('canvas-hint');
const uploadSection = document.getElementById('upload-section');
const enterVRButton = document.getElementById('enter-vr');


// Hide config and hint by default
configMenu.style.display = 'none';
canvasHint.style.display = 'none';

// Expose a function for main.js to show config/hint and hide upload
window.showSimulationUI = function() {
    configMenu.style.display = '';
    canvasHint.style.display = '';
    uploadSection.style.display = 'none';
};

let simulation = null;

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
        simulation = new WebGLImplementation(canvas, csv, enterVRButton);
        await simulation.initialize();
        simulation.isSimulationRunning = false;
        simulation.start();
        updateConfigToggleBtn();
        window.showSimulationUI();
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