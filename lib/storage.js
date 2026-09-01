import fs from 'fs'
import path from 'path'
import { config } from '../config.js'

export function ensureStorage() {
  for (const p of [config.dataDir, config.authDir, config.antiDeleteDir]) {
    fs.mkdirSync(p, { recursive: true })
  }
  if (!fs.existsSync(config.settingsFile)) fs.writeFileSync(config.settingsFile, '{}')
  if (!fs.existsSync(config.deletedFile)) fs.writeFileSync(config.deletedFile, '[]')
  if (!fs.existsSync(config.cacheIndex)) fs.writeFileSync(config.cacheIndex, '{}')
}

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
export function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

export function loadSettings() {
  return readJSON(config.settingsFile, {})
}
export function saveSettings(s) {
  writeJSON(config.settingsFile, s)
}
