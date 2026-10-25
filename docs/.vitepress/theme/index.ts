import DefaultTheme from 'vitepress/theme';
import { inBrowser, type Theme } from 'vitepress';
import { showDownloads } from './downloads.ts';
import './brand.css';
import './diagrams.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    if (!inBrowser) {
      return;
    }
    const show = (): void => {
      void showDownloads();
    };
    router.onAfterPageLoad = show;
    router.onAfterRouteChange = show;
  },
} satisfies Theme;
