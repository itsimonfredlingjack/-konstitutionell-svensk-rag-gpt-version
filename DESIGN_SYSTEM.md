# Constitutional GPT - Design System & UI Kit

This document defines the visual language and core components for the "Constitutional GPT" aesthetic. Use this as a reference when building new interfaces to ensure exact replication of the "Digital Aurora" / "Glass Monolith" style.

## 1. Core Principles
- **Atmosphere:** Deep, dark, immersive space with "living" background elements.
- **Materiality:** High-quality frosted glass (`backdrop-blur-xl`) with subtle noise textures.
- **Lighting:** Dynamic glows (Cyan/Emerald/Purple) that act as status indicators.
- **Typography:** Technical and precise. Sans-serif for UI, Monospace for data/code.

## 2. Color Palette (Tailwind)

### Backgrounds
- **Deep Void (Base):** `#030305`
- **Void Gradient:** `from-indigo-950/20 via-[#05050A] to-[#05050A]`
- **Glass Surface:** `rgba(255, 255, 255, 0.03)` + `backdrop-blur(60px)`

### Accents (Neon)
- **Cyan (Primary/Active):** `#06b6d4` (cyan-500) / `#22d3ee` (cyan-400)
    - *Usage:* Active states, main focus, "living" core elements.
- **Purple (Deep/Memory):** `#7c3aed` (violet-600) / `#a855f7` (purple-500)
    - *Usage:* VRAM, history, secondary depth.
- **Emerald (Success/Health):** `#10b981` (emerald-500)
    - *Usage:* System online, verification success, healthy status.
- **Amber (Warning/Latency):** `#f59e0b` (amber-500)
    - *Usage:* Latency warnings, high load.

## 3. Global CSS Variables (`globals.css`)
Ensure these are present in your CSS root:

```css
:root {
    /* Layout */
    --chatW: clamp(1100px, 85vw, 1800px); /* The "Monolith" width */
    
    /* Colors */
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 15, 15, 30;
    --background-end-rgb: 5, 5, 10;
    
    /* Glass Tokens */
    --color-glass-border: rgba(255, 255, 255, 0.1);
    --color-glass-surface: rgba(255, 255, 255, 0.03);
    
    /* Shadows */
    --shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}

body {
    background: transparent; /* Critical for Digital Aurora visibility */
    font-family: var(--font-inter), sans-serif;
}
```

## 4. Key Components

### A. The "Glass Panel" (Container)
The standard container for all content.
- **Classes:** `relative rounded-3xl overflow-hidden backdrop-blur-xl bg-glass-surface border border-glass-border shadow-glass`
- **Effect:** Add an internal `div` with `bg-gradient-to-tr from-white/5 to-transparent` for a "glare" effect.

### B. "Digital Aurora" Background
The signature background effect using `framer-motion`.
- **Composition:** 4 distinct blobs (Cyan, Purple, Blue, Indigo) moving in separate infinite distinct orbits.
- **Blend Mode:** `mix-blend-screen`
- **Blur:** `blur-[100px]` to `blur-[140px]`
- **Texture:** A "Noise Texture" SVG overlay at 3% opacity is MANDATORY to prevent color banding and add tactile feel.

### C. "Slim Rail" (Navigation)
 Fixed right-side navigation bar.
- **Width:** `w-20`
- **Z-Index:** `z-50` (Always on top)
- **Interaction:** Icons glow Cyan when active. Shows a mini "Sparkline" graph behind the active icon.

## 5. Typography Strategy
- **Headings/UI:** `Inter` (Google Fonts) - Clean, neutral.
- **Data/Status:** `Roboto Mono` or `JetBrains Mono` - Technical, used for "SYSTEM ONLINE", IP addresses, measurements.
- **Effect:** Use `tracking-widest` and `uppercase` for small labels (e.g., "SYSTEM CORE", "MEM").

## 6. Animation Guidelines
- **Hover:** Smooth `duration-300`. Glow intensity increases.
- **Float:** All major panels should have a subtle "breathe" animation (y-axis movement).
- **Pulse:** Use for "living" indicators (e.g., the core CPU icon).

---
*To replicate this design: Copy this file to your new project's "docs" folder and instruct the AI assistant to "Follow the design system defined in docs/DESIGN_SYSTEM.md".*
