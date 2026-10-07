# A1/A2/A3: 3D Interaction Testbed

**Course:** MAC0623 / MAC6923 — 3D Interaction in Mixed Realities (2026)  
**Author:** Fernando Ramos Takara  
**Live Demo:** https://fertakara.github.io/mac0623-A1/ 

## Abstract

This project is a browser-based 3D environment built using JavaScript and **Three.js**. It evaluates 3D manipulation and navigation techniques by providing two main tasks:
1. **Manipulation (A1/A2)**: A 3D docking task to match a cube to a specific target pose (6 Degrees of Freedom).
2. **Navigation (A3)**: A large-scale wayfinding task testing locomotion techniques across an expansive environment populated with landmarks.

The application logs trial metrics such as completion time, path length, and errors into a downloadable CSV file to support empirical HCI evaluation.

## Features & Techniques

### Task 1: Manipulation (Docking)
Features 5 distinct mapping modes (switchable via the HUD dropdown) that compare desktop and VR techniques side-by-side:
1. **Mouse Based**: Translates or rotates the object using standard 2D mouse drags mapped to screen space. Mode is toggled via the `Spacebar` or `Tab`.
2. **Mouse and Keyboard Based**: Keyboard controls rotation, mouse drag controls translation.
3. **VR Direct Grab (6DoF)**: Point and pull trigger. The cube attaches rigidly to the controller, inheriting 1:1 translation and rotation.
4. **VR Trackball**: 
   - Translation via direct grab.
   - Rotation via indirect grab on empty space, utilizing a `2.0` rotational gain factor to improve ergonomics.
5. **VR Gizmo**: A 6DoF 3D Gizmo featuring 3 translation arrows (X, Y, Z) and 3 rotation rings.

### Task 2: Navigation (Wayfinding)
Features 2 VR locomotion techniques tested in a 40x40 meter environment:
1. **World-in-Miniature (WIM)**: 
   - A miniature board (clipboard style) attached to the left hand.
   - The user grabs their red avatar pin on the board with their right hand to drag it.
   - Upon releasing the trigger, the user instantly teleports to the corresponding real-world location.
2. **Teleport + Ghost (Half-Life: Alyx Style)**: 
   - The user pushes the thumbstick forward (Joystick Y) to activate aiming.
   - A Bezier curve and a green "ghost" marker project onto the floor indicating the landing spot.
   - Releasing the thumbstick instantly teleports the user to the ghost.

## Code Structure
- `index.html`: Contains the UI overlay and loads the Three.js scene.
- `css/style.css`: Styles for the HTML HUD overlay.
- `js/`: Application logic.
  - `config.js`: Centralized constants and settings.
  - `main.js`: Main application logic, UI wiring, and WebXR render loop.
  - `environment.js`: Generation of the large A3 environment and landmarks.
  - `waypoint.js`: Logic for spawning and validating navigation targets.
  - `wim.js`: Mini-map rendering and WIM-to-world coordinate transformations.
  - `teleport.js`: Visuals and Bezier curve math for the joystick teleport.
- `Assignment-1/` & `Assignment-2/`: Data analysis, Jupyter notebooks, and LaTeX reports.

## How to Run Locally

This project requires no build tools or bundlers. It uses ES modules and imports Three.js directly via CDN.

1. Clone the repository:
   ```bash
   git clone https://github.com/ferTakara/mac0623-A1.git
   cd mac0623-A1
   ```

2. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```

3. And open the project in the given link

## Usage
Select your preferred Mode (Manipulation or Navigation) and Technique from the dropdown menu, then click the **Enter VR** button (if using a compatible headset or the WebXR Emulator extension). For Navigation tasks, use the **Grip** button to confirm when standing inside a waypoint's tolerance radius. Press **Download CSV** to export trial data.
