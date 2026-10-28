import { loadSiteExtensions } from '../.vitepress/marketplace.ts';
import type { SiteExtension } from '../../scripts/src/marketplace/site.ts';

/** One page per listed extension, which `[id].md` renders from its parameters (#390). */
export default {
  async paths(): Promise<{ params: SiteExtension }[]> {
    const extensions = (await loadSiteExtensions()) ?? [];
    return extensions.map((extension) => ({ params: extension }));
  },
};
