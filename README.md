# A1: Desktop Docking Testbed

**Course:** MAC0623 / MAC6923 — 3D Interaction in Mixed Realities (2026)  
**Author:** Fernando Ramos Takara  
**Live Demo:** https://fertakara.github.io/mac0623-A1/ 

## Abstract

This project is a browser-based 3D docking task testbed built using JavaScript and **Three.js**. It evaluates 3D manipulation techniques by comparing two different input mappings for translating and rotating a 3D cube to match a specific target pose (6 Degrees of Freedom). The application logs trial metrics such as completion time, position/orientation error, and mode switches into a downloadable CSV file to support empirical HCI evaluation.

## Interaction Mappings

1. **Baseline Mapping:** A mode-switched approach where the user toggles between translation mode and rotation mode. Mouse movement drives the active mode.
2. **Custom Mapping:** A simultaneous input mapping where the mouse handles 2D translation (X/Y) and the depth, while the keyboard handles all rotations (Pitch/Yaw/Roll), eliminating the need for mode-switching.

## How to Run Locally

This project requires no build tools or bundlers. It uses ES modules and imports Three.js directly via CDN.

1. Clone the repository:
   ```bash
   git clone https://github.com/ferTakara/mac0623-A1.git
   cd mac0623-A1

2. Then start a local server from the same folder using
   ```bash
   python3 -m http.server 8000

3. And open the project in the given link
