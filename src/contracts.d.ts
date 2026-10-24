// src/contracts.d.ts

/** Safe id: ^[a-z0-9-]{1,32}$ */
export type Id = string;

// ---------- Message ----------

export interface MessageModule {
  id: Id;
  /** Small mono line above the code. Live page: "Page Not Found". */
  kicker: string;
  /** Big display text. Live page: "404". */
  code: string;
  /** One or two sentences. */
  body: string;
  cta: { label: string; href: string };
  /** Prompt shown under the button when a game is available. */
  playPrompt: string;
}

// ---------- Theme pack ----------

export interface Palette {
  bg: string;        // page background, near black
  accent: string;    // brand or holiday accent (default: #d72228)
  accentSoft: string;// accent at low alpha for glows
  glow: string;      // particle color (default: #ff8a3d, the globe orange)
  ink: string;       // text on bg (default: #f2f2f2)
  muted: string;     // mono labels (default: #9e9e9e)
  hazard: string;    // obstacles / enemies
  pickup: string;    // collectibles
}

/** Vector sprite drawn with Path2D. Coordinates in the sprite's own viewBox. */
export interface Sprite {
  viewBox: [number, number, number, number]; // x y w h
  paths: Array<{ d: string; fill?: string; stroke?: string; strokeWidth?: number }>;
  /** Optional anchor as fraction of w,h. Default [0.5, 0.5]. */
  anchor?: [number, number];
}

export interface ParticleSettings {
  /** Base count at 1x; host scales by viewport area and halves on mobile. */
  count: number;
  color: string;
  size: [number, number];    // min, max in CSS px
  speed: [number, number];   // min, max in CSS px per second
  drift: 'none' | 'up' | 'down' | 'left' | 'right';
  twinkle: boolean;
}

export interface ThemePack {
  id: Id;
  name: string;
  /** Holiday id from calendar.js, or 'default'. */
  holiday: Id | 'default';
  palette: Palette;
  particles: ParticleSettings;
  sprites: {
    /** Required. Benjo facing right. */
    benjo: Sprite;
    /** At least one of each. Games pick by index modulo length. */
    hazards: Sprite[];
    pickups: Sprite[];
    /** Optional scenery; games may ignore. */
    props?: Sprite[];
  };
  /** Shown in the HUD status line during attract mode. Max 32 chars. */
  tagline?: string;
}

// ---------- Host (what a game receives) ----------

export type Action = 'primary' | 'secondary' | 'left' | 'right' | 'up' | 'down' | 'pause';

export interface InputState {
  /** True while the action is held. */
  isDown(action: Action): boolean;
  /** True only on the update tick after the action went down. */
  justPressed(action: Action): boolean;
  /** Pointer in canvas CSS px; null when no pointer is over the canvas. */
  pointer: { x: number; y: number; down: boolean } | null;
  /** Last swipe since previous tick, if any. Cleared each tick. */
  swipe: 'left' | 'right' | 'up' | 'down' | null;
  /** True when the last input came from touch. Games use it to draw touch hints. */
  touch: boolean;
}

export interface GameStorage {
  /** Namespaced to the game id. Returns null when missing or storage throws. */
  get(key: string): string | null;
  /** Value max 256 chars. Returns false when storage is unavailable. */
  set(key: string, value: string): boolean;
  getNumber(key: string, fallback: number): number;
  setNumber(key: string, value: number): boolean;
}

export interface Size {
  width: number;   // CSS px
  height: number;  // CSS px
  dpr: number;     // device pixel ratio actually applied (capped at 2)
}

export type EndResult = {
  score: number;
  /** Mono label for the game over card, e.g. "DISTANCE". Max 16 chars. */
  scoreLabel?: string;
  /** One short line, e.g. "Benjo hit a broken link." Max 48 chars. */
  reason?: string;
};

export interface HostContext {
  /** The game's own layer. Only the canvas lives here. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Live object; host updates fields on resize. */
  size: Size;
  input: InputState;
  theme: ThemePack;
  storage: GameStorage;
  /** Aborted when the game is torn down. Attach all listeners with { signal }. */
  signal: AbortSignal;
  reducedMotion: boolean;
  /** Random in [0,1). Seeded in tests. */
  random(): number;
  /** Draw a sprite centered at x,y with height h CSS px. */
  drawSprite(sprite: Sprite, x: number, y: number, h: number, opts?: { flipX?: boolean; rotate?: number; alpha?: number; tint?: string }): void;
  /** HUD helpers. Cheap; host only touches the DOM when the value changes. */
  setScore(value: number): void;
  setStatus(text: string): void;
  /** Ask the host to end the run. Host calls instance.destroy() after this. */
  end(result: EndResult): void;
}

// ---------- Game ----------

export interface GameModule {
  id: Id;
  name: string;
  /** Short hints for the HUD. Max 40 chars each. */
  controls: { keyboard: string; touch: string };
  /** Storage key for best score. Host shows it on the game over card. */
  bestKey: string;
  /** Build a fresh instance. Must not start the loop or touch the DOM beyond host.root. */
  create(host: HostContext): GameInstance;
}

export interface GameInstance {
  /** Called once, right before the first update. Reset state here. */
  start(): void;
  /** Fixed step. dt is always 1/60 s. Called 0 to 5 times per frame. */
  update(dt: number): void;
  /** Called once per animation frame. alpha in [0,1) is interpolation between steps. */
  render(alpha: number): void;
  pause(): void;
  resume(): void;
  /** Release everything. Host clears the canvas afterward. Must not throw. */
  destroy(): void;
}

// ---------- Registry and config ----------

export interface Registry {
  messages: Record<Id, MessageModule>;
  games: Record<Id, GameModule>;
  themes: Record<Id, ThemePack>;
}

export interface BenjoConfig {
  message: Id;
  /** First entry is the default game. */
  games: Id[];
  /** 'auto' resolves from the date; otherwise a theme id pin. */
  theme: 'auto' | Id;
  /** Themes to bundle when theme is 'auto'. */
  themes: Id[];
}

export interface Resolved {
  message: MessageModule;
  game: GameModule | null;
  theme: ThemePack;
  debug: boolean;
  reducedMotion: boolean;
}

// ---------- Holidays ----------

export type DateRule =
  | { kind: 'fixed'; month: number; day: number }
  | { kind: 'nthWeekday'; month: number; weekday: number; n: number } // n = -1 for last
  | { kind: 'easter'; offsetDays: number };

export interface Holiday {
  id: Id;
  name: string;
  rule: DateRule;
  /** Days before the date the theme may show. */
  before: number;
  /** Days after the date the theme may show. */
  after: number;
}
