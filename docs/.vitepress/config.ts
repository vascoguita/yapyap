import { defineConfig } from 'vitepress';

const repository = 'https://github.com/vascoguita/yapyap';

const extensionsSidebar = [
  {
    text: 'Extensions',
    items: [
      { text: 'Writing an extension', link: '/extensions/' },
      { text: 'Manifest', link: '/extensions/manifest' },
      { text: 'Marketplace', link: '/extensions/marketplace' },
      { text: 'SDK API reference', link: '/api/' },
    ],
  },
];

export default defineConfig({
  title: 'YapYap',
  description: 'A fast, private, extensible desktop client for WhatsApp Web. Unofficial.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['progress.md'],
  // ADR folders keep README.md so they also read well on GitHub.
  rewrites: { 'adr/README.md': 'adr/index.md' },
  // Each marketplace extension's page is titled after the extension (#390).
  transformPageData(pageData) {
    const params: Readonly<Record<string, unknown>> = pageData.params ?? {};
    const { name, summary } = params;
    if (typeof name === 'string' && typeof summary === 'string') {
      pageData.title = `${name} · Marketplace`;
      pageData.description = summary;
    }
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:image', content: 'https://yapyap.guita.org/social-preview.png' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    // People choosing an app come first; developers find their pages under one menu (#383).
    nav: [
      { text: 'Download', link: '/guide/install' },
      { text: 'Guide', link: '/guide/' },
      { text: 'AI assistant', link: '/guide/ai-assistant' },
      { text: 'Marketplace', link: '/marketplace/' },
      { text: 'Privacy', link: '/privacy' },
      {
        text: 'Developers',
        items: [
          { text: 'Writing an extension', link: '/extensions/' },
          { text: 'SDK API reference', link: '/api/' },
          { text: 'Architecture', link: '/architecture/' },
          { text: 'Decision records', link: '/adr/' },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Translations', link: '/translations' },
          { text: 'Brand', link: '/brand' },
        ],
      },
      { text: 'Sponsor', link: 'https://github.com/sponsors/vascoguita' },
      {
        text: 'Help',
        items: [
          { text: 'Install', link: '/guide/install' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Ask a question', link: `${repository}/discussions` },
          { text: 'Report a bug', link: `${repository}/issues/new/choose` },
          { text: 'Report a vulnerability', link: `${repository}/security/advisories/new` },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'User guide',
          items: [
            { text: 'Get started', link: '/guide/get-started' },
            { text: 'User guide', link: '/guide/' },
            { text: 'Install', link: '/guide/install' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            { text: 'Reference', link: '/guide/reference' },
            { text: 'AI assistant', link: '/guide/ai-assistant' },
            { text: 'FAQ', link: '/guide/faq' },
          ],
        },
      ],
      '/extensions/': extensionsSidebar,
      '/api/': extensionsSidebar,
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
            { text: 'Accessibility', link: '/architecture/accessibility' },
            { text: 'Security review', link: '/architecture/security-review' },
            { text: 'Decision records', link: '/adr/' },
          ],
        },
      ],
      '/adr/': [
        {
          text: 'Decision records',
          items: [
            { text: 'Index', link: '/adr/' },
            { text: '0001 Process model', link: '/adr/0001-process-model-and-security-boundaries' },
            { text: '0002 Toolchain', link: '/adr/0002-toolchain-and-resolved-versions' },
            { text: '0003 Packaging and updates', link: '/adr/0003-packaging-and-update-channels' },
            {
              text: '0004 Extension trust model',
              link: '/adr/0004-extension-isolation-and-trust-model',
            },
            { text: '0005 Test strategy', link: '/adr/0005-test-strategy' },
            { text: '0006 Settings', link: '/adr/0006-settings-schema-and-migrations' },
            { text: '0007 Git and merging', link: '/adr/0007-git-and-merge-strategy' },
            { text: '0008 Conflict log', link: '/adr/0008-requirement-conflicts' },
            { text: '0009 Performance budgets', link: '/adr/0009-performance-budgets' },
            {
              text: '0010 Static analysis',
              link: '/adr/0010-static-analysis-with-sonarqube-cloud',
            },
            {
              text: '0011 Notifications',
              link: '/adr/0011-whatsapp-notifications',
            },
            {
              text: '0012 Translations',
              link: '/adr/0012-translations',
            },
            {
              text: '0013 In-chat assistant',
              link: '/adr/0013-in-chat-assistant-bar',
            },
            { text: '0014 Marketplace', link: '/adr/0014-extension-marketplace' },
            { text: '0015 Call recording', link: '/adr/0015-call-recording' },
            { text: '0016 Extensions', link: '/adr/0016-extensions-not-plugins' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: `${repository}/edit/master/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: {
      message:
        'Released under the MIT License. Development supported by <a href="https://www.ensita.org/">Ensita</a>. YapYap is unofficial and not affiliated with WhatsApp or Meta.',
      copyright: 'Copyright © Vasco Guita',
    },
  },
});
