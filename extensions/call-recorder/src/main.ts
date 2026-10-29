import type { Extension } from '@yapyap/extension-sdk';
import { CHANNEL } from './bus.ts';
import { serve } from './recorder.ts';

/** The call recorder's hidden page, which YapYap starts with the host API. */
export default {
  activate(host) {
    serve(host, new BroadcastChannel(CHANNEL));
  },
} satisfies Extension;
