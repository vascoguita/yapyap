import { loadSitePlugins } from '../.vitepress/marketplace.ts';
import type { SitePlugin } from '../../scripts/src/marketplace/site.ts';

/** One page per listed plugin, which `[id].md` renders from its parameters (#390). */
export default {
  async paths(): Promise<{ params: SitePlugin }[]> {
    const plugins = (await loadSitePlugins()) ?? [];
    return plugins.map((plugin) => ({ params: plugin }));
  },
};
