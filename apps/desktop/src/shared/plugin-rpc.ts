/** The one IPC message a plugin's preload listens for: it carries the plugin's MessagePort. */
export const PLUGIN_PORT_CHANNEL = 'yapyap:plugin-port';

/** Where YapYap serves the script that starts a plugin; plugins cannot ship a file there. */
export const HOST_SCRIPT_PATH = '/__yapyap/host.js';

/** Where YapYap serves the page that holds a plugin's panel, which loads the panel's module. */
export const PANEL_PAGE_PATH = '/__yapyap/panel.html';
