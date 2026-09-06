// Copy the repository's docs/ into site/content so the VitePress project is self-contained:
// Vite resolves imports from the source directory, and docs/ sits outside site/node_modules.
// docs/ stays the single source of truth; content/ is generated and ignored.
import { cpSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const docs = join(here, '..', '..', 'docs')
const content = join(here, '..', 'content')

rmSync(content, { recursive: true, force: true })
mkdirSync(content, { recursive: true })
cpSync(docs, content, {
  recursive: true,
  filter: (src) => !src.includes(`${join(docs, 'plans')}`) && !src.includes('/images/'),
})
console.log(`synced docs -> ${content}`)
