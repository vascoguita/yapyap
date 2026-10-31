import type { Extension } from '@yapyap/extension-sdk';
import { CHANNEL } from './bus.ts';
import { servePanel } from './assistant.ts';
import { serveBar } from './bar-flow.ts';
import { pageLocalModel } from './built-in/page.ts';

/**
 * The AI writing assistant's hidden page, which YapYap starts with the host
 * API. It keeps the user's key and settings, runs the private model, and
 * answers its panel and YapYap's assistant bar.
 */
export default {
  activate(host) {
    // One private model for the page, so the bar and the panel share its download and memory.
    const local = pageLocalModel(host);
    servePanel(host, new BroadcastChannel(CHANNEL), local);
    serveBar(host, local);
  },
} satisfies Extension;
