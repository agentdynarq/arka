import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Populate `process.env` from `.env` at the repo root, without overwriting
 * anything already set.
 *
 * A hand-rolled parser rather than a dependency: the format needed here is
 * `KEY=value` lines and `#` comments, which is what `.env.example` already is,
 * and pulling in a package for that is not worth a new dependency in a script
 * that otherwise has none.
 */
export function loadEnvFile(path: string = join(REPO_ROOT, '.env')): void {
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
