const imageInput = document.getElementById('imageInput');
const canvas = document.getElementById('scanCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const sensitivitySlider = document.getElementById('sensitivity');
const sensVal = document.getElementById('sensVal');
const viewMode = document.getElementById('viewMode');
const resetCropBtn = document.getElementById('resetCropBtn');

let loadedImg = null;
let roi = null; // Region of interest {x, y, w, h}
let isDragging = false;
let startX = 0, startY = 0;

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImg = img;
            const maxW = 720;
            const scale = img.width > maxW ? maxW / img.width : 1;
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            roi = null;
            processImage();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

sensitivitySlider.addEventListener('input', () => {
    sensVal.textContent = sensitivitySlider.value;
    if (loadedImg) processImage();
});

viewMode.addEventListener('change', () => {
    if (loadedImg) processImage();
});

resetCropBtn.addEventListener('click', () => {
    roi = null;
    if (loadedImg) processImage();
});

// Mouse selection for isolating specific muscle groups
canvas.addEventListener('mousedown', (e) => {
    if (!loadedImg) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;
    isDragging = true;
});

canvas.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;

    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    if (w > 20 && h > 20) {
        roi = { x: Math.min(startX, endX), y: Math.min(startY, endY), w, h };
        processImage();
    }
});

function processImage() {
    ctx.drawImage(loadedImg, 0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Convert to Grayscale Luminance Matrix
    const gray = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // 2. Local Contrast Normalization (Windowed Z-score approximation)
    const norm = new Float32Array(w * h);
    let meanLum = 0;
    for (let i = 0; i < gray.length; i++) meanLum += gray[i];
    meanLum /= gray.length;

    let stdLum = 0;
    for (let i = 0; i < gray.length; i++) stdLum += Math.pow(gray[i] - meanLum, 2);
    stdLum = Math.sqrt(stdLum / gray.length) || 1;

    for (let i = 0; i < gray.length; i++) {
        let val = ((gray[i] - meanLum) / stdLum) * 55 + 128;
        norm[i] = Math.max(0, Math.min(255, val));
    }

    // 3. Sobel Gradient Operator (Micro-striation & Ridge Detection)
    const threshold = parseInt(sensitivitySlider.value, 10);
    const scanBox = roi || { x: 1, y: 1, w: w - 2, h: h - 2 };
    const xStart = Math.max(1, Math.floor(scanBox.x));
    const yStart = Math.max(1, Math.floor(scanBox.y));
    const xEnd = Math.min(w - 2, Math.floor(scanBox.x + scanBox.w));
    const yEnd = Math.min(h - 2, Math.floor(scanBox.y + scanBox.h));

    let striationEdges = 0;
    let totalGradientEnergy = 0;
    let leftEnergy = 0, rightEnergy = 0;
    const midX = xStart + (xEnd - xStart) / 2;
    let pixelCount = 0;

    const outData = ctx.createImageData(w, h);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const gx =
                -norm[(y - 1) * w + (x - 1)] + norm[(y - 1) * w + (x + 1)] +
                -2 * norm[y * w + (x - 1)] + 2 * norm[y * w + (x + 1)] +
                -norm[(y + 1) * w + (x - 1)] + norm[(y + 1) * w + (x + 1)];

            const gy =
                -norm[(y - 1) * w + (x - 1)] - 2 * norm[(y - 1) * w + x] - norm[(y - 1) * w + (x + 1)] +
                norm[(y + 1) * w + (x - 1)] + 2 * norm[(y + 1) * w + x] + norm[(y + 1) * w + (x + 1)];

            const mag = Math.sqrt(gx * gx + gy * gy) / 4;
            const pIdx = idx * 4;

            const inROI = (x >= xStart && x <= xEnd && y >= yStart && y <= yEnd);
            if (inROI) {
                pixelCount++;
                totalGradientEnergy += mag;
                if (mag > threshold) striationEdges++;
                if (x < midX) leftEnergy += mag;
                else rightEnergy += mag;
            }

            // Render Mode Output
            if (viewMode.value === 'topography') {
                const base = norm[idx] * 0.35;
                if (mag > threshold && inROI) {
                    outData.data[pIdx] = 0;
                    outData.data[pIdx + 1] = Math.min(255, mag * 2.2);
                    outData.data[pIdx + 2] = 255;
                } else {
                    outData.data[pIdx] = base;
                    outData.data[pIdx + 1] = base;
                    outData.data[pIdx + 2] = base;
                }
                outData.data[pIdx + 3] = 255;
            } else if (viewMode.value === 'luminance') {
                outData.data[pIdx] = norm[idx];
                outData.data[pIdx + 1] = norm[idx];
                outData.data[pIdx + 2] = norm[idx];
                outData.data[pIdx + 3] = 255;
            }
        }
    }

    if (viewMode.value !== 'original') {
        ctx.putImageData(outData, 0, 0);
    }

    if (roi) {
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);
    }

    updateMetrics(striationEdges, totalGradientEnergy, leftEnergy, rightEnergy, pixelCount);
}

function updateMetrics(edges, energy, leftE, rightE, count) {
    if (count === 0) return;
    const edgeDensity = (edges / count) * 100;
    const avgGradient = energy / count;

    const striationScore = Math.min(100, Math.round(edgeDensity * 4.2));
    const vascularScore = Math.min(100, Math.round(avgGradient * 3.1));

    const maxSide = Math.max(leftE, rightE) || 1;
    const minSide = Math.min(leftE, rightE);
    const symmetryPct = Math.round((minSide / maxSide) * 100);

    document.getElementById('striationScore').textContent = `${striationScore} / 100`;
    document.getElementById('vascularScore').textContent = `${vascularScore} / 100`;
    document.getElementById('symmetryScore').textContent = `${symmetryPct}%`;

    const composite = (striationScore * 0.55) + (vascularScore * 0.45);
    let tier = 'BASELINE / SOFT TISSUE';
    if (composite >= 82) tier = 'ELITE COMPARTMENTALIZATION (TOP 0.5%)';
    else if (composite >= 65) tier = 'HIGH FASCIAL SEPARATION';
    else if (composite >= 45) tier = 'MODERATE DEFINITION';

    document.getElementById('tierVerdict').textContent = tier;
                   }
                    
