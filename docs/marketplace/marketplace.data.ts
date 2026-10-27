import { defineLoader } from 'vitepress';
import { loadSitePlugins } from '../.vitepress/marketplace.ts';

export default defineLoader({ load: loadSitePlugins });
