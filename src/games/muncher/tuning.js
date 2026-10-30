// @ts-check
// Cache Muncher tuning. Lengths are CSS px at the reference height or cells, times are seconds,
// speeds are cells per second, so the game plays the same at any canvas size.

// Layout (the same safe area as every game, A-13.4)
export const REF_HEIGHT = 640;
export const UNIT_MIN = 0.6;
export const UNIT_MAX = 1.25;
/** The HUD strip covers the top of the canvas: 56px, 88px under 600px wide. */
export const CEILING = 64;
export const CEILING_NARROW = 96;
export const NARROW_WIDTH = 600;
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const SIDE_PAD = 16;
export const BOTTOM_PAD = 16;
/** Largest cell at unit 1, in px. */
export const CELL_MAX = 30;

// Maze cells: # wall, . byte, o Clear cache pellet, space empty path, = pen door, G pen.
export const MAZE = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#.......#.####',
  '####.#.##=##.#.####',
  '####...#GGG#...####',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#..... .....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];
/** Benjo starts here, on an empty cell, facing left. */
export const BENJO_START = [9, 15];
/** The cell just outside the pen door, where cache misses leave from. */
export const PEN_EXIT = [9, 7];
/** Where each cache miss starts: the first outside the door, the rest in the pen. */
export const MISS_START = [
  [9, 7],
  [8, 9],
  [9, 9],
  [10, 9],
];
/** Seconds into a life before each cache miss leaves the pen. */
export const RELEASE_T = [0, 3, 8, 14];
/** Each cache miss's home corner while scattering: top right, top left, bottom right, bottom left. */
export const CORNERS = [
  [17, 1],
  [1, 1],
  [17, 19],
  [1, 19],
];
/** How far ahead of Benjo the ambusher aims, and how close the shy one gets before it scatters. */
export const AMBUSH_CELLS = 4;
export const SHY_CELLS = 8;

// Speeds
export const BENJO_SPEED = 6;
/** Cache misses move at this share of Benjo's speed, a little more each level, up to the cap. */
export const MISS_RATIO = 0.8;
export const MISS_RATIO_STEP = 0.03;
export const MISS_RATIO_CAP = 0.95;
export const FRIGHT_RATIO = 0.5;
/** Both speeds grow this share per level, up to the cap (lower with reduced motion). */
export const LEVEL_SPEED = 0.05;
export const SPEED_CAP = 8;
export const SPEED_CAP_REDUCED = 7;

// Modes: scatter, chase, scatter, chase, ... in seconds; the last chase never ends.
export const MODE_T = [6, 20, 6, 20, 4];
/** Catchable time after a Clear cache pellet: shorter each level, down to the floor. */
export const FRIGHT_T = 6;
export const FRIGHT_T_STEP = 1;
export const FRIGHT_T_MIN = 2;
/** The cache misses flash for this long before they turn dangerous again. */
export const FRIGHT_WARN_T = 1.5;
/** A munched cache miss waits in the pen this long before it leaves again. */
export const RESPAWN_T = 3;

// Rules and score
export const LIVES = 3;
export const BYTE_SCORE = 10;
export const PELLET_SCORE = 50;
/** Munching cache misses in one Clear cache: 200, 400, 800, then 1600 each. */
export const MISS_SCORE = 200;
export const MISS_SCORE_MAX = 1600;
/** Benjo and a cache miss touch when their centers are this many cells apart. */
export const HIT_R = 0.6;
/** Nothing moves for this long at the start of each life, so the player can get set. */
export const READY_T = 1;
/** Inputs this early in a run are the press that started it. */
export const START_GRACE = 0.12;
/** A host tap that echoes a pointer press within this window is the same press. */
export const TAP_ECHO = 0.4;

// Feedback
/** Hit stop after a lost life, and before the next level. */
export const HIT_T = 1;
export const CLEAR_T = 1;
/** Hit stop before the game over card so the player sees what got them. */
export const DEATH_PAUSE = 0.6;
export const FLASH_EVERY = 0.12;
export const HINT_T = 3;
export const STATUS_T = 1.5;
export const NEW_BEST_T = 1.5;

// Drawing, as fractions of a cell
export const BENJO_H = 0.95;
export const MISS_H = 0.9;
export const PELLET_H = 0.7;
export const BYTE_SIZE = 0.16;
export const PELLET_PULSE = 0.15;
export const PELLET_RATE = 5;
export const WALL_ALPHA = 0.16;
export const EDGE_ALPHA = 0.6;
export const BYTE_ALPHA = 0.7;
export const LIFE_R = 3;
export const LIFE_SPACING = 14;

// Power-ups (#22)
/** After the Digital Twin takes a touch, cache misses pass through Benjo for this long. */
export const GRACE_T = 1.5;
export const GRACE_BLINK = 0.1;
export const GRACE_ALPHA = 0.35;
/** Magnet: Benjo munches the bytes this many cells from him, counted along the open paths. */
export const MAGNET_CELLS = 2;

// Events raised by one step
export const EVENT_BYTE = 1;
export const EVENT_PELLET = 2;
export const EVENT_MUNCH = 4;
export const EVENT_HIT = 8;
export const EVENT_LEVEL = 16;
