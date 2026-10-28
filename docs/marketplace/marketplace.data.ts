import { defineLoader } from 'vitepress';
import { loadSiteExtensions } from '../.vitepress/marketplace.ts';

export default defineLoader({ load: loadSiteExtensions });
