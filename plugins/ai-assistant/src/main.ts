import type { Plugin } from '@yapyap/plugin-sdk';
import { CHANNEL } from './bus.ts';
import { servePanel } from './assistant.ts';

/**
 * The AI writing assistant's hidden page, which YapYap starts with the host
 * API. It keeps the user's key and settings, and answers its panel.
 */
export default {
  activate(host) {
    servePanel(host, new BroadcastChannel(CHANNEL));
  },
} satisfies Plugin;
