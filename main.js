
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



// Function to get selected parameters and handle submit
async function handleInputSubmit() {
    // Get input
    const mode = document.querySelector('input[name="mode-type"]:checked').value;
    if (mode === 'benchmark') {benchmark(); return;}

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







let simulation = null;

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


function benchmark(){
    console.log("Benchmark function called");
}