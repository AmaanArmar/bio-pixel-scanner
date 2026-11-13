# Bio-Pixel Topography Scanner

A 100% local, zero-cloud computer vision toolkit for analyzing muscle compartmentalization, fascial striations, and vascular ridge contrast from raw pixel luminance gradients.

## Privacy Architecture
* **Web App (`index.html`, `style.css`, `script.js`):** Runs strictly inside client-side browser memory via the HTML5 Canvas API. Zero images or telemetry ever leave your device.
* **Python Engine (`main.py`):** Executes offline using OpenCV and NumPy with CLAHE lighting normalization.

## Quick Start

### Option 1: Browser Web App
1. Open `index.html` directly in any modern browser (or enable **GitHub Pages** in repository settings).
2. Load an image and drag a bounding box over specific muscle groups (deltoids, serratus, forearms, back) to isolate regional striation density.

### Option 2: Python CLI Engine
```bash
pip install -r requirements.txt
python main.py --image your_photo.jpg --out scan_result.png
