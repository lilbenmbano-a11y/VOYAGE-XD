import { execSync } from 'child_process'

export function getGitInfo() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim()
    const msg = execSync('git log -1 --pretty=%s', { encoding: 'utf8', cwd: process.cwd() }).trim()
    const author = execSync('git log -1 --pretty=%an', { encoding: 'utf8', cwd: process.cwd() }).trim()
    const date = execSync('git log -1 --pretty=%cd', { encoding: 'utf8', cwd: process.cwd() }).trim()
    return { ok: true, hash, branch, msg, author, date }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function checkRemote() {
  try {
    execSync('git fetch origin', { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' })
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: process.cwd() }).trim()
    const behind = execSync(`git rev-list --count HEAD..origin/${branch}`, { encoding: 'utf8', cwd: process.cwd() }).trim()
    const count = parseInt(behind, 10) || 0
    return { ok: true, behind: count > 0, count }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export function gitPull() {
  try {
    const output = execSync('git pull origin $(git rev-parse --abbrev-ref HEAD)', { encoding: 'utf8', cwd: process.cwd(), stdio: 'pipe' }).trim()
    return { ok: true, output }
  } catch (e) {
    return { ok: false, error: e.stderr?.toString() || e.message }
  }
}

export function restartProcess() {
  console.log('[VOYAGE-MD] Restarting process...')
  setTimeout(() => process.exit(0), 500)
}
