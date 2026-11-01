/** The one IPC message an extension's preload listens for: it carries the extension's MessagePort. */
export const EXTENSION_PORT_CHANNEL = 'yapyap:extension-port';

/** Where YapYap serves the script that starts an extension; extensions cannot ship a file there. */
export const HOST_SCRIPT_PATH = '/__yapyap/host.js';

/** Where YapYap serves the page that holds an extension's panel, which loads the panel's module. */
export const PANEL_PAGE_PATH = '/__yapyap/panel.html';

/** Where YapYap serves the stylesheet every panel starts with (#396). */
export const PANEL_STYLE_PATH = '/__yapyap/panel.css';
