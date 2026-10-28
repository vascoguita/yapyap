import type { Extension } from '@yapyap/extension-sdk';
import { CHANNEL } from './bus.ts';
import { servePanel } from './assistant.ts';
import { serveBar } from './bar-flow.ts';

/**
 * The AI writing assistant's hidden page, which YapYap starts with the host
 * API. It keeps the user's key and settings, and answers its panel and
 * YapYap's assistant bar.
 */
export default {
  activate(host) {
    servePanel(host, new BroadcastChannel(CHANNEL));
    serveBar(host);
  },
} satisfies Extension;
