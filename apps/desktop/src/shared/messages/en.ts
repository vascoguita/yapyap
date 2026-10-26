import { buildCatalog } from './catalog.ts';
import source from './locales/en.json' with { type: 'json' };
import type { Messages } from './messages.generated.ts';

export type { Messages };

/** The English text of YapYap's own windows, menus, dialogs and notifications. */
export const en = buildCatalog(source, source, 'en') as Messages;
