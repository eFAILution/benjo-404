// @ts-check
// The How to play card's body (#28): a game's goal, the controls for the visitor's device, each
// thing on the board beside the sprite the active theme draws for it, and the power-ups the game
// can drop (#64). Built only with dom.el().

import { el } from './dom.js';
import { POWERS } from './power.js';
import { drawSprite } from './sprite.js';

/** @typedef {import('../contracts').HowTo} HowTo */
/** @typedef {import('../contracts').HowToLine} HowToLine */
/** @typedef {import('../contracts').HowToSprite} HowToSprite */
/** @typedef {import('../contracts').HowToThing} HowToThing */
/** @typedef {import('../contracts').PowerId} PowerId */
/** @typedef {import('../contracts').ThemePack} ThemePack */

/** Icon box in CSS px. The canvas backing store is twice that, for sharp sprites on HiDPI. */
const ICON_PX = 32;
const ICON_SCALE = 2;
/** The sprite fills this share of the box; a swatch is a square this share wide. */
const SPRITE_FRAC = 0.85;
const SWATCH_FRAC = 0.6;

/**
 * The sprite a game draws for this thing, picked modulo the set like the games do.
 * @param {ThemePack} theme @param {HowToSprite} ref
 */
export function pickSprite(theme, ref) {
  if (ref.set === 'benjo') return theme.sprites.benjo;
  const list = theme.sprites[ref.set];
  return list.length ? list[ref.index % list.length] : null;
}

/** @param {ThemePack} theme @param {HowToThing} thing */
function icon(theme, thing) {
  const canvas = el('canvas', { class: 'howto-icon', 'aria-hidden': 'true' });
  canvas.width = ICON_PX * ICON_SCALE;
  canvas.height = ICON_PX * ICON_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(ICON_SCALE, ICON_SCALE);
  const mid = ICON_PX / 2;
  const sprite = thing.sprite ? pickSprite(theme, thing.sprite) : null;
  if (sprite) {
    drawSprite(ctx, theme.palette, sprite, mid, mid, ICON_PX * SPRITE_FRAC);
  } else if (thing.swatch) {
    const side = ICON_PX * SWATCH_FRAC;
    ctx.fillStyle = theme.palette[thing.swatch];
    ctx.fillRect(mid - side / 2, mid - side / 2, side, side);
  }
  return canvas;
}

/**
 * What each power-up does when the game words nothing better. Cache Hit and Breakpoint are run by
 * the host alone, so they read the same in every game.
 * @type {Record<PowerId, string>}
 */
const POWER_TIPS = {
  cache: 'Every point counts double',
  breakpoint: 'The game runs at half speed',
  twin: 'Takes one hit that would end the run',
  rollback: "Can't be fired. If the run ends while it waits, rewinds 3 seconds",
  gc: "Clears what's on screen",
  magnet: 'Pulls pickups toward Benjo',
};

/** @param {string} label @param {Array<Node | null>} body */
const section = (label, body) =>
  el('div', { class: 'howto-section' }, [el('p', { class: 'howto-label' }, [label]), ...body]);

/**
 * @param {string} label
 * @param {HowToLine[]} lines
 */
function controls(label, lines) {
  if (!lines.length) return null;
  return section(label, [
    el(
      'dl',
      { class: 'howto-lines' },
      lines.flatMap(([input, action]) => [
        el('dt', { class: 'howto-input' }, [input]),
        el('dd', {}, [action]),
      ]),
    ),
  ]);
}

/**
 * The power-ups a game can drop: the two the host runs alone, then the ones the game lists.
 * @param {PowerId[] | undefined} listed GameModule.powers
 * @returns {PowerId[]}
 */
export function cardPowers(listed) {
  const extra = (listed ?? []).filter((id) => id in POWERS);
  return [...new Set(/** @type {PowerId[]} */ (['cache', 'breakpoint', ...extra]))];
}

/**
 * @param {HowTo} howTo
 * @param {PowerId[]} ids
 * @param {boolean} touch
 */
function powerList(howTo, ids, touch) {
  const fire = touch ? 'Tap the slot to fire it.' : 'Press E to fire it.';
  return section('Power-ups', [
    el('p', { class: 'howto-fire' }, [
      `As you score, a power-up drops into the slot beside Best. ${fire}`,
    ]),
    el(
      'ul',
      { class: 'howto-things' },
      ids.map((id) => {
        const [label, name, seconds] = POWERS[id];
        return el('li', { class: 'howto-thing' }, [
          el('span', { class: 'howto-badge', 'aria-hidden': 'true' }, [label]),
          el('span', { class: 'howto-thing-text' }, [
            el('span', { class: 'howto-thing-name' }, [seconds ? `${name}, ${seconds} s` : name]),
            el('span', { class: 'howto-tip' }, [howTo.powers?.[id] ?? POWER_TIPS[id]]),
          ]),
        ]);
      }),
    ),
  ]);
}

/**
 * Only the controls for the visitor's device (#64): touch lines when `touch`, else keys. A game
 * with no lines for that device falls back to the other kind.
 * @param {HowTo} howTo
 * @param {ThemePack} theme
 * @param {{ touch: boolean, powers: PowerId[] }} device what the visitor plays with, and the
 *   power-ups the game can drop (see cardPowers)
 * @returns {Array<Node | null>} null entries are skipped, as el() skips them
 */
export function howToBody(howTo, theme, { touch, powers }) {
  const useTouch = touch ? howTo.touch.length > 0 : howTo.keys.length === 0;
  return [
    el('p', { class: 'howto-goal' }, [howTo.goal]),
    useTouch ? controls('Touch', howTo.touch) : controls('Keys', howTo.keys),
    el(
      'ul',
      { class: 'howto-things', 'aria-label': 'On the board' },
      howTo.things.map((thing) =>
        el('li', { class: 'howto-thing' }, [
          icon(theme, thing),
          el('span', { class: 'howto-thing-text' }, [
            el('span', { class: 'howto-thing-name' }, [thing.name]),
            el('span', { class: 'howto-tip' }, [thing.tip]),
          ]),
        ]),
      ),
    ),
    powers.length ? powerList(howTo, powers, useTouch) : null,
  ];
}
