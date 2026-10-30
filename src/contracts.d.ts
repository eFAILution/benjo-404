// src/contracts.d.ts

/** Safe id: ^[a-z0-9-]{1,32}$ */
export type Id = string;

// ---------- Message ----------

export interface MessageModule {
  id: Id;
  /** Document title. Live page: "Page Not Found | Beast Code". Default: "<code> · <kicker>". */
  title?: string;
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
  /** Optional sound overrides, one cue at a time. Missing cues use the shell's defaults. */
  cues?: Partial<Record<AudioCue, Tone[]>>;
}

// ---------- Sound ----------

/** Named sound cues. Games pick the closest one; the host plays 'best' or 'over' at the end. */
export type AudioCue =
  | 'jump' | 'shoot' | 'land' | 'turn' | 'score' | 'pickup' | 'hit' | 'clear' | 'best' | 'over';

/** One synthesized tone. Times in seconds from the cue start, frequencies in Hz. */
export interface Tone {
  type?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** Start frequency. */
  f: number;
  /** Optional end frequency for a slide. */
  to?: number;
  /** Delay before the tone starts. Default 0. */
  at?: number;
  /** Duration. */
  d: number;
  /** Peak gain, 0 to 1. Default 0.3. */
  g?: number;
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
  /** A yes or no, stored as '1' or '0'. Missing or anything else reads as false. */
  getFlag(key: string): boolean;
  setFlag(key: string, on: boolean): boolean;
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
  /** Optional sound. Silent while muted or before the player's first input. */
  audio?: { play(cue: AudioCue): void };
  /** Optional power-ups (#22). Absent in tests and older hosts, so always call with `?.`. */
  power?: PowerPort;
  /**
   * Optional. Report where Benjo (or the thing the player steers) is, in canvas CSS px, once per
   * update. The host draws the Digital Twin and the ghost of the best run there. Games without an
   * avatar never call it.
   */
  track?(x: number, y: number): void;
}

// ---------- Power-ups (#22) ----------

/**
 * Power-ups the host hands out during a run. The host runs 'cache' and 'breakpoint' on its own.
 * 'twin', 'rollback', 'gc', and 'magnet' need the game's help, so a game lists the ones it
 * supports in GameModule.powers and the host only drops those.
 */
export type PowerId = 'twin' | 'rollback' | 'cache' | 'gc' | 'breakpoint' | 'magnet';

export interface PowerPort {
  /** True while a timed power runs. Games poll 'magnet' each update and pull pickups toward Benjo. */
  active(id: PowerId): boolean;
  /**
   * Digital Twin. Call at the moment a hit would end the run (or cost a life). True means the twin
   * took the hit: skip the death, give Benjo about one second of grace, and play on. False means
   * no twin is up; handle the hit as usual. Each true uses the twin up.
   */
  absorb(): boolean;
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
  /**
   * Optional, needed for 'gc'. Garbage Collector: remove every hazard on screen now, with a small
   * effect. Return how many were cleared (0 is fine).
   */
  collect?(): number;
  /**
   * Optional, needed for 'rollback'. A deep copy of everything update() and render() read, taken
   * between updates. It must survive later updates untouched (no shared arrays or objects).
   */
  snapshot?(): unknown;
  /**
   * Optional, needed for 'rollback'. Put the run back to a value snapshot() returned. Called
   * instead of letting a death end the run. The game must also re-sync the HUD score.
   */
  restore?(snapshot: unknown): void;
}

// ---------- Game ----------

/** A theme sprite, picked the way the game picks it, so the card matches the holiday art. */
export type HowToSprite = { set: 'benjo' } | { set: 'hazards' | 'pickups'; index: number };

/** One thing on the board: what it looks like and what to do about it. */
export interface HowToThing {
  /** The theme sprite the game draws for it... */
  sprite?: HowToSprite;
  /** ...or, for something the game draws as a shape, a square in this palette color. */
  swatch?: keyof Palette;
  /** Max 24 chars. */
  name: string;
  /** Max 72 chars. */
  tip: string;
}

/** Each line pairs an input with what it does: ['Space', 'Whack the center hole']. Max 24 and 48 chars. */
export type HowToLine = [input: string, action: string];

export interface HowTo {
  /** What a run is about and how it ends. Max 140 chars. */
  goal: string;
  keys: HowToLine[];
  touch: HowToLine[];
  things: HowToThing[];
  /**
   * What each power-up in GameModule.powers does in this game (#64), like 'Clears every tower
   * on screen'. Max 72 chars. The shell words the rest, and any power left out here.
   */
  powers?: Partial<Record<PowerId, string>>;
}

export interface GameModule {
  id: Id;
  name: string;
  /** Short hints for the HUD. Max 40 chars each. */
  controls: { keyboard: string; touch: string };
  /** The How to play card, shown before a game's first run (#28). Every bundled game has one. */
  howTo?: HowTo;
  /** Storage key for best score. Host shows it on the game over card. */
  bestKey: string;
  /** Build a fresh instance. Must not start the loop or touch the DOM beyond host.root. */
  create(host: HostContext): GameInstance;
  /** Game-assisted power-ups this game supports (#22). 'cache' and 'breakpoint' need no entry. */
  powers?: Array<'twin' | 'rollback' | 'gc' | 'magnet'>;
}

// ---------- Registry and config ----------

export interface Registry {
  messages: Record<Id, MessageModule>;
  games: Record<Id, GameModule>;
  themes: Record<Id, ThemePack>;
}

export interface BenjoConfig {
  message: Id;
  /** Games to bundle, in the order the picker lists them. */
  games: Id[];
  /** Which game a visit starts on: a random bundled one (default) or the first in `games`. ADR-0014. */
  startGame?: 'random' | 'first';
  /** Show a game picker on the idle screen and the game over card when two or more games are bundled. Default true. */
  gamePicker?: boolean;
  /** 'auto' resolves from the date; otherwise a theme id pin. */
  theme: 'auto' | Id;
  /** Themes to bundle when theme is 'auto'. */
  themes: Id[];
}

export interface Resolved {
  message: MessageModule;
  game: GameModule | null;
  /** Every bundled, configured game, in config order. */
  games: GameModule[];
  /** True when the player may switch games: the picker is on and there is more than one game. */
  picker: boolean;
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
