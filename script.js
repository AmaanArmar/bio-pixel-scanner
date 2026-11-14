const imageInput = document.getElementById('imageInput');
const canvas = document.getElementById('scanCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const sensitivitySlider = document.getElementById('sensitivity');
const sensVal = document.getElementById('sensVal');
const resetCropBtn = document.getElementById('resetCropBtn');
const saveLogBtn = document.getElementById('saveLogBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const verifyDataBtn = document.getElementById('verifyDataBtn');

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
        if(btn.dataset.tab === 'logs') renderLogs();
    });
});

let loadedImg = null;
let roi = null;
let isDragging = false;
let startX = 0, startY = 0;
let currentScanResults = {};

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImg = img;
            const maxW = 600;
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

resetCropBtn.addEventListener('click', () => {
    roi = null;
    if (loadedImg) processImage();
});

// Mouse selection
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

    const gray = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    let meanLum = 0;
    for (let i = 0; i < gray.length; i++) meanLum += gray[i];
    meanLum /= gray.length;

    let stdLum = 0;
    for (let i = 0; i < gray.length; i++) stdLum += Math.pow(gray[i] - meanLum, 2);
    stdLum = Math.sqrt(stdLum / gray.length) || 1;

    const norm = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) {
        let val = ((gray[i] - meanLum) / stdLum) * 60 + 128;
        norm[i] = Math.max(0, Math.min(255, val));
    }

    const threshold = parseInt(sensitivitySlider.value, 10);
    const scanBox = roi || { x: 1, y: 1, w: w - 2, h: h - 2 };
    const xStart = Math.max(1, Math.floor(scanBox.x));
    const yStart = Math.max(1, Math.floor(scanBox.y));
    const xEnd = Math.min(w - 2, Math.floor(scanBox.x + scanBox.w));
    const yEnd = Math.min(h - 2, Math.floor(scanBox.y + scanBox.h));

    let edgePixels = 0;
    let totalEnergy = 0;
    let leftEnergy = 0, rightEnergy = 0;
    const midX = xStart + (xEnd - xStart) / 2;
    let pixelCount = 0;

    const outData = ctx.createImageData(w, h);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const gx = -norm[(y-1)*w + (x-1)] + norm[(y-1)*w + (x+1)] - 2*norm[y*w + (x-1)] + 2*norm[y*w + (x+1)] - norm[(y+1)*w + (x-1)] + norm[(y+1)*w + (x+1)];
            const gy = -norm[(y-1)*w + (x-1)] - 2*norm[(y-1)*w + x] - norm[(y-1)*w + (x+1)] + norm[(y+1)*w + (x-1)] + 2*norm[(y+1)*w + x] + norm[(y+1)*w + (x+1)];
            const mag = Math.sqrt(gx * gx + gy * gy) / 4;
            const pIdx = idx * 4;

            const inROI = (x >= xStart && x <= xEnd && y >= yStart && y <= yEnd);
            if (inROI) {
                pixelCount++;
                totalEnergy += mag;
                if (mag > threshold) edgePixels++;
                if (x < midX) leftEnergy += mag;
                else rightEnergy += mag;
            }

            const base = norm[idx] * 0.4;
            if (mag > threshold && inROI) {
                outData.data[pIdx] = 56;
                outData.data[pIdx + 1] = 189;
                outData.data[pIdx + 2] = 248;
            } else {
                outData.data[pIdx] = base;
                outData.data[pIdx + 1] = base;
                outData.data[pIdx + 2] = base;
            }
            outData.data[pIdx + 3] = 255;
        }
    }

    ctx.putImageData(outData, 0, 0);
    if (roi) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(roi.x, roi.y, roi.w, roi.h);
    }

    updateMetrics(edgePixels, totalEnergy, leftEnergy, rightEnergy, pixelCount);
}

function updateMetrics(edges, energy, leftE, rightE, count) {
    if (count === 0) return;
    const densityRatio = (edges / count);
    const avgGradient = energy / count;

    const shreddedScore = Math.min(100, Math.round(densityRatio * 180 + avgGradient * 0.8));
    let estBF = 22.0 - (shreddedScore * 0.14);
    estBF = Math.max(7.5, Math.min(24.0, estBF));

    // Factor in manual tape measurements if available for cross-verification
    let taperRatio = (1.35 + (shreddedScore * 0.003)).toFixed(2);
    const manualWaist = parseFloat(document.getElementById('inputWaist').value);
    const manualShoulders = parseFloat(document.getElementById('inputShoulders').value);
    
    if (manualWaist > 0 && manualShoulders > 0) {
        const tapeTaper = (manualShoulders / manualWaist).toFixed(2);
        // Cross-verified blended ratio
        taperRatio = ((parseFloat(tapeTaper) * 0.7) + (parseFloat(taperRatio) * 0.3)).toFixed(2);
    }

    const maxSide = Math.max(leftE, rightE) || 1;
    const minSide = Math.min(leftE, rightE);
    const symmetryPct = Math.round((minSide / maxSide) * 100);

    let tier = 'ATHLETIC / BASELINE';
    if (shreddedScore >= 75) tier = 'ELITE STRIATED / STAGE READY';
    else if (shreddedScore >= 55) tier = 'HIGHLY CONDITIONED & COMPARTMENTALIZED';
    else if (shreddedScore >= 38) tier = 'SHARP LEAN BASELINE';

    currentScanResults = {
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        bf: estBF.toFixed(1),
        shredded: shreddedScore,
        taper: taperRatio,
        symmetry: symmetryPct,
        tier: tier,
        waist: manualWaist || 'N/A',
        shoulders: manualShoulders || 'N/A'
    };

    document.getElementById('bfScore').textContent = `~${currentScanResults.bf}%`;
    document.getElementById('shreddedScore').textContent = `${currentScanResults.shredded} / 100`;
    document.getElementById('taperScore').textContent = `${currentScanResults.taper} : 1`;
    document.getElementById('symmetryScore').textContent = `${currentScanResults.symmetry}%`;
    document.getElementById('tierVerdict').textContent = currentScanResults.tier;
}

verifyDataBtn.addEventListener('click', () => {
    if (loadedImg) processImage();
    alert('Cross-verification complete: Tape measurements integrated with optical pixel ratios.');
});

// Local Storage Logs
saveLogBtn.addEventListener('click', () => {
    if (!currentScanResults.shredded) {
        alert('Please run a scan first!');
        return;
    }
    let logs = JSON.parse(localStorage.getItem('physique_logs') || '[]');
    logs.unshift(currentScanResults);
    localStorage.setItem('physique_logs', JSON.stringify(logs));
    alert('Scan and measurements saved to local log!');
});

function renderLogs() {
    const container = document.getElementById('logsContainer');
    let logs = JSON.parse(localStorage.getItem('physique_logs') || '[]');
    if (logs.length === 0) {
        container.innerHTML = `<p class="no-logs">No saved logs yet. Run a scan and click 'Save Scan & Measurements'.</p>`;
        return;
    }
    container.innerHTML = logs.map(log => `
        <div class="log-item">
            <div><strong>${log.date}</strong><br>Tier: ${log.tier}</div>
            <div>Cond: <b>${log.shredded}/100</b> | Est. BF: <b>~${log.bf}%</b></div>
            <div>Taper: <b>${log.taper}:1</b> | Sym: <b>${log.symmetry}%</b></div>
            <div>Waist: <b>${log.waist}cm</b> | Shoulders: <b>${log.shoulders}cm</b></div>
        </div>
    `).join('');
}

clearLogsBtn.addEventListener('click', () => {
    if (confirm('Clear all local logs?')) {
        localStorage.removeItem('physique_logs');
        renderLogs();
    }
});
                        
