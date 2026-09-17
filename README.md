# A1: Desktop Docking Testbed

**Course:** MAC0623 / MAC6923 — 3D Interaction in Mixed Realities (2026)  
**Author:** Fernando Ramos Takara  
**Live Demo:** https://fertakara.github.io/mac0623-A1/ 

## Abstract

This project is a browser-based 3D docking task testbed built using JavaScript and **Three.js**. It evaluates 3D manipulation techniques by comparing five different input mappings for translating and rotating a 3D cube to match a specific target pose (6 Degrees of Freedom). The application logs trial metrics such as completion time, position/orientation error, and mode switches into a downloadable CSV file to support empirical HCI evaluation.

## Mappings
The application features 5 distinct mapping modes (switchable via the HUD dropdown) that compare desktop and VR techniques side-by-side:
### Desktop Mappings
1. **Mouse Based**: The A1 baseline. Translates or rotates the object using standard 2D mouse drags mapped to screen space. Mode is toggled via the `Spacebar` or `Tab`.
2. **Mouse and Keyboard Based**: The keyboard controls the rotation and thee mouse drag controls the translation of the cube.
### VR Mappings
3. **VR Direct Grab (6DoF)**:
   - Point the controller's ray at the cube and pull the trigger.
   - The cube attaches rigidly to the controller, inheriting 1:1 translation and rotation (isomorphic).
4. **VR Trackball**:
   - **Translation**: Direct grab on the cube (translates the object while ignoring controller rotation).
   - **Rotation**: Indirect grab on empty space. Dragging applies the controller's rotational delta to the cube.
   - **Gain Factor**: Utilizes a `2.0` rotational gain factor. This maps a 90-degree wrist twist to a 180-degree tumble on the object, improving ergonomics by preventing "gorilla arm" contortions.
5. **VR Gizmo**:
   - A bespoke 6DoF 3D Gizmo featuring 3 translation arrows (X, Y, Z) and 3 rotation rings.
   - Dragging an arrow mathematically projects the controller's ray to translate the object along standard world axes.
   - Dragging a ring mathematically intersects the controller's ray with an imaginary plane to smoothly twist the object around a specific axis.
## Code Structure
- `index.html`: Contains the UI overlay and loads the Three.js scene.
- `main.js`: Main application logic. Look for the `STUDENT TODO` sections inside `onGrabStart`, `onGrabEnd`, and `updateWebXR` to implement the three VR interaction mappings.
- `lab10.css`: Styles for the HTML HUD overlay.

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

## Usage
Select your preferred mapping from the dropdown menu, then click the **Enter VR** button (if using a compatible headset or the WebXR Emulator extension) to interact with the environment when using the 3-5 mappings. Press **Confirm** to log trial data into a downloadable CSV for analysis.
