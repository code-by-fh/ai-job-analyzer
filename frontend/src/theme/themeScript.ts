import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from "./theme";

const STORAGE_KEY_LITERAL = JSON.stringify(THEME_STORAGE_KEY);
const QUERY_LITERAL = JSON.stringify(DARK_SCHEME_QUERY);

/**
 * Inline <head> script that sets data-mode before first paint, so a stored dark preference never
 * flashes light. It mirrors resolveMode() because it must run before any bundle is loaded.
 */
export const THEME_BOOT_SCRIPT = `(function(){var p=null;try{p=localStorage.getItem(${STORAGE_KEY_LITERAL})}catch(e){}var d=p==="dark"||(p!=="light"&&window.matchMedia(${QUERY_LITERAL}).matches);document.documentElement.dataset.mode=d?"dark":"light"})()`;
