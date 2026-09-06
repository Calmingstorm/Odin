import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const SITE = 'https://calmingstorm.github.io/Odin/'

export default withMermaid(defineConfig({
  title: 'Odin',
  description: 'Odin developer hub — architecture, configuration, tool and API reference for the self-hosted Discord execution agent.',
  base: '/Odin/',
  srcDir: '../docs',
  srcExclude: ['plans/**'],
  outDir: './dist',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/Odin/logo.svg' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;650;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Odin — autonomous execution agent for Discord' }],
    ['meta', { property: 'og:description', content: 'Developer hub: architecture, configuration, security model, and the complete tool and API reference.' }],
    ['meta', { property: 'og:image', content: SITE + 'social-preview.png' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  sitemap: { hostname: SITE },
  // The repository root carries the WebUI's Tailwind PostCSS config; keep this site's CSS pipeline independent of it.
  vite: { css: { postcss: { plugins: [] } } },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Odin',
    nav: [
      { text: 'Guide', link: '/install', activeMatch: '^/(install|configuration|security|skills)' },
      { text: 'Reference', link: '/reference/tools', activeMatch: '^/reference/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Contributing', link: '/contributing' },
      { text: 'odin-bot.net', link: 'https://odin-bot.net' },
      { text: 'Releases', link: 'https://github.com/Calmingstorm/Odin/releases' },
    ],
    sidebar: [
      { text: 'Guide', items: [
        { text: 'Install', link: '/install' },
        { text: 'Configuration', link: '/configuration' },
        { text: 'Security model', link: '/security' },
        { text: 'Runtime skills', link: '/skills' },
      ]},
      { text: 'Agents & delivery', items: [
        { text: 'Agent tool transcript', link: '/agent-transcript-contract' },
        { text: 'Agent results & tool output', link: '/agent-result-delivery' },
        { text: 'Process output retention', link: '/process-output-retention' },
      ]},
      { text: 'Reference', items: [
        { text: 'Built-in tools', link: '/reference/tools' },
        { text: 'REST API routes', link: '/reference/api' },
      ]},
      { text: 'Project', items: [
        { text: 'Architecture', link: '/architecture' },
        { text: 'Contributing', link: '/contributing' },
        { text: 'Security policy', link: 'https://github.com/Calmingstorm/Odin/blob/master/SECURITY.md' },
      ]},
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Calmingstorm/Odin' }],
    search: { provider: 'local' },
    editLink: { pattern: 'https://github.com/Calmingstorm/Odin/edit/master/docs/:path', text: 'Edit this page on GitHub' },
    outline: [2, 3],
    footer: { message: 'Released under the MIT License.', copyright: 'Odin — a self-hosted execution agent for Discord.' },
  },
  mermaid: { theme: 'dark' },
}))
