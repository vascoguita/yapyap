import { defineConfig } from 'vitepress';

const repository = 'https://github.com/vascoguita/yapyap';

const pluginsSidebar = [
  {
    text: 'Plugins',
    items: [
      { text: 'Writing a plugin', link: '/plugins/' },
      { text: 'Manifest', link: '/plugins/manifest' },
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
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:image', content: 'https://yapyap.guita.org/social-preview.png' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'Privacy', link: '/privacy' },
      { text: 'Brand', link: '/brand' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Contributing', link: '/contributing' },
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
            { text: 'Getting started', link: '/guide/' },
            { text: 'Install', link: '/guide/install' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            { text: 'Reference', link: '/guide/reference' },
            { text: 'AI assistant', link: '/guide/ai-assistant' },
            { text: 'FAQ', link: '/guide/faq' },
          ],
        },
      ],
      '/plugins/': pluginsSidebar,
      '/api/': pluginsSidebar,
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
            { text: '0004 Plugin trust model', link: '/adr/0004-plugin-isolation-and-trust-model' },
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
              text: '0012 Translations (proposed)',
              link: '/adr/0012-translations',
            },
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
