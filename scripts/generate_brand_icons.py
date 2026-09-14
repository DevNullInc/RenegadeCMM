#!/usr/bin/env python3
"""
Brand Asset & Iconography Generator for Renegade Core Model Manager
Translates D:\\gitprojects\\logos\\RenegadeCMM-Flat-White.png into:
- build/icon.svg & public/icon.svg (Vector SVG with violet gradient)
- build/icon.png & public/icon.png (512x512 Master PNG)
- build/icon.ico & public/favicon.ico (Multi-size Windows/Favicon ICO)
- build/icons/ (Freedesktop Linux icon hierarchy: 16x16 up to 1024x1024)
- build/icon.icns (macOS Icon bundle)
"""

import os
import sys
import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

LOGO_SRC = r'D:\gitprojects\logos\RenegadeCMM-Flat-White.png'
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD_DIR = os.path.join(PROJECT_ROOT, 'build')
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public')
BUILD_ICONS_DIR = os.path.join(BUILD_DIR, 'icons')

def generate_svg(src_path, out_paths):
    img = cv2.imread(src_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(f"Cannot read logo at {src_path}")
    
    alpha = img[:, :, 3]
    
    # Emblem bounding box: x in [126..1410], y in [180..1358]
    # Center into 512x512 with margin
    scale = 360.0 / 1284.0
    ox = 256.0 - (1284.0 * scale / 2.0)
    oy = 256.0 - (1178.0 * scale / 2.0) - 8.0 # slight optical centering
    
    ret, thresh = cv2.threshold(alpha, 127, 255, cv2.THRESH_BINARY)
    contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)
    
    paths = []
    for c in contours:
        if cv2.contourArea(c) < 25:
            continue
        epsilon = 0.0012 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, epsilon, True)
        pts = approx.reshape(-1, 2)
        if len(pts) < 3:
            continue
        tpts = []
        for x, y in pts:
            tx = (x - 126) * scale + ox
            ty = (y - 180) * scale + oy
            tpts.append(f"{tx:.2f},{ty:.2f}")
        d = f"M {tpts[0]} " + " ".join([f"L {p}" for p in tpts[1:]]) + " Z"
        paths.append(d)
    
    combined_d = " ".join(paths)
    
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Dark Squircle Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#151722" />
      <stop offset="50%" stop-color="#0c0e15" />
      <stop offset="100%" stop-color="#06070b" />
    </linearGradient>

    <!-- Glowing Violet / Indigo Metallic Gradient -->
    <linearGradient id="neonViolet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e9d5ff" />
      <stop offset="25%" stop-color="#c084fc" />
      <stop offset="65%" stop-color="#9333ea" />
      <stop offset="100%" stop-color="#6b21a8" />
    </linearGradient>

    <!-- Squircle Border Stroke Gradient -->
    <linearGradient id="strokeBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.75" />
      <stop offset="50%" stop-color="#6366f1" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#3b0764" stop-opacity="0.15" />
    </linearGradient>

    <!-- Radial Glow Filter -->
    <filter id="glow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Ambient Shadow Filter -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#7e22ce" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- Base Squircle Plate -->
  <rect x="18" y="18" width="476" height="476" rx="104" fill="url(#bgGrad)" stroke="url(#strokeBorder)" stroke-width="4" filter="url(#shadow)" />

  <!-- Ambient Internal Glow Halo -->
  <circle cx="256" cy="248" r="170" fill="none" stroke="#9333ea" stroke-width="1.5" stroke-opacity="0.25" filter="url(#glow)" />

  <!-- RenegadeCMM Vector Emblem -->
  <path d="{combined_d}" fill="url(#neonViolet)" fill-rule="evenodd" filter="url(#glow)" />
</svg>
'''
    for out_p in out_paths:
        os.makedirs(os.path.dirname(out_p), exist_ok=True)
        with open(out_p, 'w', encoding='utf-8') as f:
            f.write(svg_content)
        print(f"[+] Wrote SVG: {out_p}")

def render_master_png(src_path, size=1024):
    """Render a pixel-perfect master icon combining squircle, glow, and emblem."""
    img = cv2.imread(src_path, cv2.IMREAD_UNCHANGED)
    alpha = img[:, :, 3]
    
    # 1. Create Canvas (RGBA)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    
    # Draw dark squircle background with gradient
    bg_sq = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg_sq)
    
    margin = int(size * (18 / 512))
    corner_r = int(size * (104 / 512))
    bg_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_r,
        fill=(12, 14, 21, 255),
        outline=(168, 85, 247, 180),
        width=int(size * (4 / 512))
    )
    
    # Add subtle vertical gradient over squircle
    grad_arr = np.zeros((size, size, 4), dtype=np.uint8)
    for y in range(size):
        factor = y / size
        r = int(21 * (1 - factor) + 6 * factor)
        g = int(23 * (1 - factor) + 7 * factor)
        b = int(34 * (1 - factor) + 11 * factor)
        grad_arr[y, :, 0] = r
        grad_arr[y, :, 1] = g
        grad_arr[y, :, 2] = b
        grad_arr[y, :, 3] = 255
    grad_img = Image.fromarray(grad_arr, "RGBA")
    
    # Mask gradient to rounded rect
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([margin, margin, size - margin, size - margin], radius=corner_r, fill=255)
    
    canvas.paste(grad_img, (0, 0), mask)
    canvas.paste(bg_sq, (0, 0), bg_sq)
    
    # 2. Resize and colorize emblem
    emblem_w = int(size * (360 / 512))
    emblem_h = int(emblem_w * (1178 / 1284))
    
    # Crop source to emblem bbox (126, 180, 1410, 1358)
    crop = img[180:1358, 126:1410]
    crop_resized = cv2.resize(crop, (emblem_w, emblem_h), interpolation=cv2.INTER_LANCZOS4)
    crop_alpha = crop_resized[:, :, 3]
    
    # Create Violet metallic color map
    emblem_rgb = np.zeros((emblem_h, emblem_w, 3), dtype=np.uint8)
    for y in range(emblem_h):
        t = y / max(1, emblem_h)
        if t < 0.25:
            k = t / 0.25
            r = int(233 * (1 - k) + 192 * k)
            g = int(213 * (1 - k) + 132 * k)
            b = int(255 * (1 - k) + 252 * k)
        elif t < 0.65:
            k = (t - 0.25) / 0.40
            r = int(192 * (1 - k) + 147 * k)
            g = int(132 * (1 - k) + 51 * k)
            b = int(252 * (1 - k) + 234 * k)
        else:
            k = (t - 0.65) / 0.35
            r = int(147 * (1 - k) + 107 * k)
            g = int(51 * (1 - k) + 33 * k)
            b = int(234 * (1 - k) + 168 * k)
        emblem_rgb[y, :, 0] = r
        emblem_rgb[y, :, 1] = g
        emblem_rgb[y, :, 2] = b
    
    emblem_rgba = np.dstack([emblem_rgb, crop_alpha])
    emblem_img = Image.fromarray(emblem_rgba, "RGBA")
    
    # Create glow behind emblem
    glow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pos_x = (size - emblem_w) // 2
    pos_y = (size - emblem_h) // 2 - int(size * (8 / 512))
    
    glow_emblem = Image.new("RGBA", (emblem_w, emblem_h), (192, 132, 252, 255))
    glow_img.paste(glow_emblem, (pos_x, pos_y), emblem_img)
    glow_blurred = glow_img.filter(ImageFilter.GaussianBlur(radius=int(size * 0.025)))
    
    canvas = Image.alpha_composite(canvas, glow_blurred)
    canvas.paste(emblem_img, (pos_x, pos_y), emblem_img)
    
    return canvas

def generate_all_icons():
    print("Generating Brand Assets for Renegade Core Model Manager...")
    
    # 1. SVG
    svg_outputs = [
        os.path.join(BUILD_DIR, 'icon.svg'),
        os.path.join(PUBLIC_DIR, 'icon.svg')
    ]
    generate_svg(LOGO_SRC, svg_outputs)
    
    # 2. Master PNG 1024x1024
    master_1024 = render_master_png(LOGO_SRC, size=1024)
    master_512 = master_1024.resize((512, 512), Image.LANCZOS)
    
    master_512.save(os.path.join(BUILD_DIR, 'icon.png'))
    master_512.save(os.path.join(PUBLIC_DIR, 'icon.png'))
    print(f"[+] Wrote Master PNGs: build/icon.png and public/icon.png")
    
    # 3. Windows ICO & Favicon ICO (16, 24, 32, 48, 64, 128, 256)
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path_build = os.path.join(BUILD_DIR, 'icon.ico')
    ico_path_public = os.path.join(PUBLIC_DIR, 'favicon.ico')
    
    master_1024.save(ico_path_build, format='ICO', sizes=ico_sizes)
    master_1024.save(ico_path_public, format='ICO', sizes=ico_sizes)
    print(f"[+] Wrote Multi-size ICO: {ico_path_build} & {ico_path_public}")
    
    # 4. Freedesktop Linux Icons
    os.makedirs(BUILD_ICONS_DIR, exist_ok=True)
    for sz in [16, 24, 32, 48, 64, 128, 256, 512, 1024]:
        sz_dir = os.path.join(BUILD_ICONS_DIR, f"{sz}x{sz}")
        os.makedirs(sz_dir, exist_ok=True)
        img_sz = master_1024.resize((sz, sz), Image.LANCZOS)
        out_png = os.path.join(sz_dir, "renegadecmm.png")
        img_sz.save(out_png)
        img_sz.save(os.path.join(BUILD_ICONS_DIR, f"{sz}x{sz}.png"))
    print(f"[+] Wrote Freedesktop Linux Icon sets in build/icons/")
    
    # 5. ICNS for macOS
    try:
        icns_path = os.path.join(BUILD_DIR, 'icon.icns')
        master_1024.save(icns_path, format='ICNS')
        print(f"[+] Wrote macOS ICNS: {icns_path}")
    except Exception as e:
        print(f"[-] Note on ICNS generation: {e}")

if __name__ == '__main__':
    generate_all_icons()
