import DefaultTheme from 'vitepress/theme';
import { inBrowser, type Theme } from 'vitepress';
import { showDownloads } from './downloads.ts';
import DownloadButton from './components/DownloadButton.vue';
import Landing from './components/Landing.vue';
import './brand.css';
import './diagrams.css';
import './landing.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('Landing', Landing);
    app.component('DownloadButton', DownloadButton);
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
