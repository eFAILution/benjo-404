// @ts-check
// Brand values shared by the theme packs and the favicon. src/shell/styles/tokens.css repeats
// BRAND_RED as --brand and --accent, because CSS cannot import it; tests/themes/packs.test.js
// fails if they drift apart.
export const BRAND_RED = '#d72228';
/** BRAND_RED at 20% alpha, for glows. */
export const BRAND_RED_SOFT = `${BRAND_RED}33`;
