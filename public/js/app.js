// Global variables
let currentStep = 1;
let socket = null;
let currentTrainingId = null;
let currentInferenceId = null;
let lossChart = null;
let diceChart = null;
let scene = null;
let camera = null;
let renderer = null;
let trainingPollInterval = null;
let uploadedFiles = {
    rawImages: null,
    annotations: null,
    inferenceData: null
};

let segmentationMesh = null;
let segmentationData = null;
let availableClasses = [];
let visibleClasses = [];
let currentSliceRange = [0, 100]; // percentage range

let classMeshes = {}; // Object to store separate meshes per class
let meshGroup = null; // Group to contain all class meshes

let sliceDirection = 'z'; // 'x', 'y', or 'z'

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeSocketConnection();
    initializeFileUpload();
    initializeCharts();
    updateProgressBar();
});

function updateProgressBar() {
    const progress = ((currentStep - 1) / 4) * 100;
    document.getElementById('overallProgress').style.width = progress + '%';
}