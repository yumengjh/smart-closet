import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist')
// CLOSET_SERVER_DIR matches scripts/deploy-local.sh, so a worktree publishes into its own backend.
const serverDir = process.env.CLOSET_SERVER_DIR ? resolve(process.env.CLOSET_SERVER_DIR) : resolve(root, '../smart-closet-server')
const serverStatic = resolve(serverDir, 'src/main/resources/static')
mkdirSync(serverStatic, { recursive: true })
for (const name of ['index.html', 'favicon.svg', 'yuda-logo.png', 'yuda-logo-192.png', 'manifest.webmanifest', 'sw.js']) cpSync(resolve(output, name), resolve(serverStatic, name))
cpSync(resolve(output, 'icons'), resolve(serverStatic, 'icons'), { recursive: true })
cpSync(resolve(output, 'illustrations'), resolve(serverStatic, 'illustrations'), { recursive: true })
cpSync(resolve(output, 'licenses'), resolve(serverStatic, 'licenses'), { recursive: true })
const stickerResources = resolve(serverStatic, '../person-stickers')
mkdirSync(stickerResources, { recursive: true })
cpSync(resolve(root, 'public/person-stickers'), stickerResources, { recursive: true })
cpSync(resolve(root, 'src/domain/person-stickers.json'), resolve(stickerResources, 'catalog.json'))
const assets = resolve(serverStatic, 'assets')
rmSync(assets, { recursive: true, force: true })
mkdirSync(assets, { recursive: true })
for (const name of readdirSync(resolve(output, 'assets'))) cpSync(resolve(output, 'assets', name), resolve(assets, name))
console.log(`Published ${readdirSync(resolve(output, 'assets')).length} frontend assets to ${serverStatic}`)
