import { defineConfig } from 'vitepress';

const repository = 'https://github.com/vascoguita/yapyap';

export default defineConfig({
  title: 'YapYap',
  description: 'A fast, private, extensible desktop client for WhatsApp Web. Unofficial.',
  base: '/yapyap/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['progress.md'],
  // ADR folders keep README.md so they also read well on GitHub.
  rewrites: { 'adr/README.md': 'adr/index.md' },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/yapyap/logo.svg' }],
    [
      'meta',
      { property: 'og:image', content: 'https://vascoguita.github.io/yapyap/social-preview.png' },
    ],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Privacy', link: '/privacy' },
      { text: 'Brand', link: '/brand' },
      { text: 'Architecture', link: '/architecture/' },
      { text: 'Contributing', link: '/contributing' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'User guide',
          items: [
            { text: 'Getting started', link: '/guide/' },
            { text: 'Install', link: '/guide/install' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
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
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: `${repository}/edit/master/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: {
      message:
        'Released under the MIT License. YapYap is unofficial and not affiliated with WhatsApp or Meta.',
      copyright: 'Copyright © Vasco Guita',
    },
  },
});
