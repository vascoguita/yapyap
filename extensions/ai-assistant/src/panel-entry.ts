import { CHANNEL } from './bus.ts';
import { mountPanel } from './panel.ts';

// The panel's page loads this module (manifest `contributes.panel.entry`).
mountPanel(document, new BroadcastChannel(CHANNEL));
