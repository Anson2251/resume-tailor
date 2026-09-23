// Writes electron/dist/package.json so the compiled CommonJS output loads
// correctly: the repo root is `"type": "module"`, which would otherwise make
// Electron parse electron/dist/main.js as ESM and crash on require/exports.
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true })
writeFileSync(new URL('./dist/package.json', import.meta.url), JSON.stringify({ type: 'commonjs' }) + '\n')
