// @ts-check
// The How to play card's body (#28): a game's goal, its keys and touch controls, and each thing
// on the board beside the sprite the active theme draws for it. Built only with dom.el().

import { el } from './dom.js';
import { drawSprite } from './sprite.js';

/** @typedef {import('../contracts').HowTo} HowTo */
/** @typedef {import('../contracts').HowToLine} HowToLine */
/** @typedef {import('../contracts').HowToSprite} HowToSprite */
/** @typedef {import('../contracts').HowToThing} HowToThing */
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
 * @param {string} label
 * @param {HowToLine[]} lines
 */
function controls(label, lines) {
  if (!lines.length) return null;
  return el('div', { class: 'howto-controls' }, [
    el('p', { class: 'howto-label' }, [label]),
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
 * @param {HowTo} howTo
 * @param {ThemePack} theme
 * @returns {Node[]}
 */
export function howToBody(howTo, theme) {
  return [
    el('p', { class: 'howto-goal' }, [howTo.goal]),
    el('div', { class: 'howto-columns' }, [
      controls('Keys', howTo.keys),
      controls('Touch', howTo.touch),
    ]),
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
  ];
}
