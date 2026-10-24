// @ts-check
// Theme pack registry. Each pack is also a named export so the build can
// import only the packs listed in benjo.config.json. `default` is a reserved
// word as a binding name, so the brand pack is exported as `defaultTheme`.
import christmas from './christmas/index.js';
import defaultTheme from './default/index.js';
import halloween from './halloween/index.js';

export { christmas, defaultTheme, halloween };

/** @type {Record<string, import('../contracts').ThemePack>} */
export const themes = {
  default: defaultTheme,
  halloween,
  christmas,
};
