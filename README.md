# A1/A2/A3/A4: 3D Interaction Testbed

**Course:** MAC0623 / MAC6923 — 3D Interaction in Mixed Realities (2026)  
**Author:** Fernando Ramos Takara  
**Live Demo:** https://fertakara.github.io/mac0623-A1/ 

## Abstract

This project is a browser-based 3D environment built using JavaScript and **Three.js**. It evaluates 3D manipulation, navigation, and Augmented Reality interaction techniques by providing three main tasks:
1. **Desktop & VR Manipulation (A1/A2)**: A 3D docking task to match a cube to a specific target pose (6 Degrees of Freedom).
2. **VR Navigation (A3)**: A large-scale wayfinding task testing locomotion techniques across an expansive environment populated with landmarks.
3. **Mobile AR Manipulation (A4)**: A tabletop 3-DoF docking task in Augmented Reality using WebXR, comparing multi-touch screen gestures against physical device motion.

The application logs trial metrics such as completion time, docking precision (position and orientation errors), selection mistakes, touch counts, tracking losses, and arm fatigue ratings into a downloadable CSV file to support empirical Human-Computer Interaction (HCI) evaluation.

## Features & Techniques

### Task 1: Desktop & VR Manipulation (Docking — A1/A2)
Features 5 distinct mapping modes (switchable via the HUD dropdown) that compare desktop and VR techniques side-by-side:
1. **Mouse Based**: Translates or rotates the object using standard 2D mouse drags mapped to screen space. Mode is toggled via `Spacebar` or `Tab`.
2. **Mouse and Keyboard Based**: Keyboard controls rotation, mouse drag controls translation.
3. **VR Direct Grab (6DoF)**: Point and pull trigger. The cube attaches rigidly to the controller, inheriting 1:1 translation and rotation.
4. **VR Trackball**: 
   - Translation via direct grab.
   - Rotation via indirect grab on empty space, utilizing a `2.0` rotational gain factor to improve ergonomics.
5. **VR Gizmo**: A 6DoF 3D Gizmo featuring 3 translation arrows (X, Y, Z) and 3 rotation rings.

### Task 2: VR Navigation (Wayfinding — A3)
Features 2 VR locomotion techniques tested in a 40x40 meter environment:
1. **World-in-Miniature (WIM)**: 
   - A miniature board (clipboard style) attached to the left hand.
   - The user grabs their red avatar pin on the board with their right hand to drag it.
   - Upon releasing the trigger, the user instantly teleports to the corresponding real-world location.
2. **Teleport + Ghost (Half-Life: Alyx Style)**: 
   - The user pushes the thumbstick forward (Joystick Y) to activate aiming.
   - A Bezier curve and a green "ghost" marker project onto the floor indicating the landing spot.
   - Releasing the thumbstick instantly teleports the user to the ghost.

### Task 3: Mobile AR Tabletop Manipulation (Docking — A4)
Accessible via `ar.html`. Runs on mobile WebXR-compatible browsers (e.g. Chrome on Android) with DOM Overlay and surface hit-testing. The user aligns one of 3 colored candidate cubes with a translucent target "ghost" cube placed on a real-world table or floor (3 DoF: horizontal X and Z translation, plus vertical Yaw rotation):
1. **Technique 1 (Baseline: Touch Gestures)**:
   - 1-finger drag translates the cube across the tabletop plane.
   - 2-finger twist rotates the cube around the vertical axis (Yaw).
   - Quick tap outside deselects or switches cubes.
2. **Technique 2 (Raycast + Phone Motion)**:
   - Tap a cube to select it.
   - **Translation**: Anchored to a continuous raycast from the screen center (`#centerReticle`) onto the tabletop plane as the user moves the phone.
   - **Rotation ("Steering Wheel" / Volante)**: The physical lateral tilt (roll) of the smartphone rotates the cube's yaw, amplified by an ergonomic `1:2` sensitivity gain (`ROTATION_GAIN = 2.0`).
3. **Free-Play & Familiarization Mode**:
   - Before starting the recorded activity, the target ghost cube is hidden. Users can freely select, move, and rotate any cube to practice and adapt to the interaction technique without triggering timers or recording errors.
4. **Experiment Workflow & Fatigue Assessment**:
   - Pressing **"Iniciar atividade"** locks the workspace, displays the target ghost cube with a random yaw and target color, resets candidate cubes to their initial arc layout (~38 cm from target), and begins Trial 1.
   - Real-time docking tolerance feedback (Δpos ≤ 2.0 cm, Δyaw ≤ 10° turning green on the HUD status pill).
   - **Confirm** button validates each trial.
   - After completing 3 trials, an arm fatigue questionnaire modal (rating 1 to 5) appears.
   - Once rated, the system automatically returns to the initial state, ready for another session.

## Code Structure
- `index.html`: Entry point for Desktop and VR tasks (A1/A2/A3).
- `ar.html`: Entry point for Mobile AR tabletop manipulation (A4) with mobile safe-area support.
- `server.py`: Local HTTPS development server with auto-detection of real LAN IP, automatic `mkcert` SSL certificate management, and scannable terminal QR code.
- `css/style.css`: Styles for HUD overlay, center reticle, fatigue modal, safe-area insets, and buttons.
- `js/`: Application logic.
  - `ar.js`: Full WebXR AR logic, surface detection, hit-testing, Technique 1 (multi-touch) and Technique 2 (raycast + steering wheel roll), trial lifecycle, and metrics logging.
  - `config.js`: Centralized constants and settings for desktop/VR.
  - `main.js`: Main application logic, UI wiring, and WebXR render loop for A1/A2/A3.
  - `environment.js`: Generation of the large A3 environment and landmarks.
  - `waypoint.js`: Logic for spawning and validating navigation targets.
  - `wim.js`: Mini-map rendering and WIM-to-world coordinate transformations.
  - `teleport.js`: Visuals and Bezier curve math for the joystick teleport.
- `Assignment-1/`, `Assignment-2/`, `Assignment-3/`: Data analysis, Jupyter notebooks, boxplots, CSV datasets, and LaTeX reports.

## How to Run Locally

This project requires no build tools or bundlers. It uses ES modules and imports Three.js directly via CDN.

### Desktop & VR (A1 / A2 / A3)
1. Start any local HTTP server:
   ```bash
   python3 -m http.server 8000
   ```
2. Open `http://localhost:8000` in a WebXR-compatible browser or emulator.

### Mobile AR (A4)
WebXR AR on mobile devices requires a secure origin (HTTPS):
1. Run the dedicated secure server:
   ```bash
   python3 server.py
   ```
   * Automatically detects your machine's real LAN IP (Wi-Fi, Ethernet, or Hotspot).
   * Generates or validates an SSL certificate for the current IP via `mkcert`.
   * Displays a scannable **QR Code** directly in the terminal to open `https://<YOUR-IP>:8001/ar.html` on your mobile device without typing.
2. Scan the terminal QR code with your phone or navigate directly to the displayed URL.

## Usage
- **Desktop/VR**: Select your preferred Mode (Manipulation or Navigation) and Technique from the dropdown, then click **Enter VR** (or use mouse/keyboard on desktop). Press **Download CSV** to export data.
- **Mobile AR**: 
  1. Click **START AR** to enter the camera feed.
  2. Point your camera at a surface (table or floor) and tap when the white reticle appears to place the workspace.
  3. Freely interact with the cubes to test the chosen technique.
  4. Tap **Iniciar atividade** to begin the 3 recorded trials.
  5. Position and align the requested cube into the target ghost cube and press **Confirm (Enter)**.
  6. Rate arm fatigue after Trial 3 and export the experiment CSV via **Download CSV**.
