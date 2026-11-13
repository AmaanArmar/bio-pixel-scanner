import argparse
import cv2
import numpy as np


def analyze_physique(image_path: str, output_path: str = "topography_output.png"):
    # Load image locally (zero network calls)
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Could not load image at: {image_path}")

    # Resize to standardized processing width while keeping aspect ratio
    target_width = 800
    scale = target_width / img.shape[1]
    img_resized = cv2.resize(img, (target_width, int(img.shape[0] * scale)))

    # 1. Convert to LAB color space & apply CLAHE to neutralize uneven lighting
    lab = cv2.cvtColor(img_resized, cv2.COLOR_BGR2LAB)
    l_channel, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    norm_l = clahe.apply(l_channel)

    # 2. Slight Gaussian blur to suppress camera sensor noise before edge detection
    blurred = cv2.GaussianBlur(norm_l, (3, 3), 0)

    # 3. Sobel X & Y gradients to capture directional muscle striations
    sobel_x = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
    gradient_mag = np.sqrt(sobel_x**2 + sobel_y**2)
    gradient_norm = np.uint8(np.clip((gradient_mag / np.max(gradient_mag)) * 255, 0, 255))

    # 4. Morphological Top-Hat transform to isolate tubular vascular/vein ridges
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    tophat = cv2.morphologyEx(norm_l, cv2.MORPH_TOPHAT, kernel)

    # 5. Scoring Metrics
    striation_threshold = 45
    striation_pixels = np.sum(gradient_norm > striation_threshold)
    total_pixels = gradient_norm.size

    striation_score = min(100.0, round((striation_pixels / total_pixels) * 420, 1))
    vascular_score = min(100.0, round(np.mean(tophat) * 6.5, 1))

    # Bilateral symmetry comparison (left half vs right half gradient energy)
    mid = target_width // 2
    left_energy = np.mean(gradient_norm[:, :mid])
    right_energy = np.mean(gradient_norm[:, mid:])
    symmetry = round((min(left_energy, right_energy) / max(left_energy, right_energy)) * 100, 1)

    # 6. Generate Visual Topography Map
    heatmap = cv2.applyColorMap(gradient_norm, cv2.COLORMAP_OCEAN)
    overlay = cv2.addWeighted(img_resized, 0.45, heatmap, 0.55, 0)
    cv2.imwrite(output_path, overlay)

    print("\n=== BIO-PIXEL TOPOGRAPHY REPORT (LOCAL OFFLINE) ===")
    print(f"Striation & Fascial Separation Score : {striation_score} / 100")
    print(f"Vascular & Ridge Prominence Score    : {vascular_score} / 100")
    print(f"Bilateral Gradient Symmetry          : {symmetry}%")
    print(f"Topography Overlay Saved To          : {output_path}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Offline Bio-Pixel Physique Topography Analyzer")
    parser.add_argument("--image", required=True, help="Path to local input image")
    parser.add_argument("--out", default="topography_output.png", help="Path for output map")
    args = parser.parse_args()
    analyze_physique(args.image, args.out)
  
