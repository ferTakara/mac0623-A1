export const BACKGROUND_COLOR = 0x1a1a1a;
export const HEMISPHERE_SKY_COLOR = 0xffffff;
export const HEMISPHERE_GROUND_COLOR = 0x444444;
export const DIRECTIONAL_LIGHT_COLOR = 0xffffff;
export const GRID_COLOR_CENTER_LINE = 0x444444;
export const GRID_COLOR_LINES = 0x2a2a2a;
export const CUBE_FACE_COLORS = [0xffffff, 0xffff33, 0x3388ff, 0x33ff33, 0xff3333, 0xffa500];

export const HEMISPHERE_LIGHT_INTENSITY = 1.2;
export const DIRECTIONAL_LIGHT_INTENSITY = 0.8;
export const DIRECTIONAL_LIGHT_POSITION = [2, 4, 3];

export const GRID_SIZE = 6;
export const GRID_DIVISIONS = 24;
export const AXES_HELPER_SIZE = 0.6;

export const CUBE_SIZE = 0.4;
export const CUBE_INITIAL_POSITION = [0, 0.5, 0];
export const TARGET_OPACITY = 0.35;

export const CAMERA_FOV_DEG = 60;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 100;
export const CAMERA_POSITION = [0, 1.4, 4];
export const CAMERA_LOOK_AT = [0, 0.5, 0];

export const TRANSLATE_SPEED = 0.0025;
export const ROTATE_SPEED    = 0.005;
export const WHEEL_TRANSLATE_SPEED_Z = 0.001;
export const WHEEL_ROTATE_SPEED_Z = 0.002;

export const RAY_LENGTH_SCALE = 1.5;
export const RAY_COLOR = 0xffffff;

export const WORLD_HUD_CANVAS_WIDTH = 512;
export const WORLD_HUD_CANVAS_HEIGHT = 160;
export const WORLD_HUD_SPRITE_SCALE = [0.22, 0.069, 1];
export const WORLD_HUD_LOCAL_POSITION = [0.46, 0.32, -0.7];
export const AXIS_SWATCH_X = "#" + CUBE_FACE_COLORS[0].toString(16).padStart(6, "0");
export const AXIS_SWATCH_Y = "#" + CUBE_FACE_COLORS[2].toString(16).padStart(6, "0");
export const AXIS_SWATCH_Z = "#" + CUBE_FACE_COLORS[4].toString(16).padStart(6, "0");

export const TARGET_BOUNDS = {
    x: [-1.0, 1.0],
    y: [0.2, 1.6],
    z: [-0.6, 0.6],
};

export const POSITION_TOLERANCE = 0.05;
export const ORIENTATION_TOLERANCE_DEG = 10;
