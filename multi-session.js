import fs from 'fs'
import path from 'path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from './config.js'
import { readJSON, writeJSON, loadSettings, saveSettings } from './lib/storage.js'

export const sessionContext = new AsyncLocalStorage()
export const sessions = new Map()
export const sessionsFile = path.resolve('./data/sessions.json')

export function currentSession() {
  const s = sessionContext.getStore()
  if (!s) throw new Error('No active bot session context')
  return s
}

export function runInSession(session, fn) {
  return sessionContext.run(session, fn)
}

export function defaultSettings() {
  const base = {}
  return {
    autoRead: false, autoTyping: false, autoRecording: false,
    antiViewOnce: false, antiDelete: false, antiLink: false,
    autoReply: { dm: false, grp: false }, autoReact: false,
    antiCall: false, antiStatus: false, online: true,
    welcome: false, goodbye: false, mentionReply: false,
    mode: 'public', prefix: config.prefix, botName: config.botName,
    ownerName: config.ownerName, sudo: [], reactEmojis: ['❤️','🔥','😂','👍'],
    ...base,
    autoReply: { dm: false, grp: false, ...(base.autoReply || {}) },
    sudo: Array.isArray(base.sudo) ? base.sudo : []
  }
}

export function createSession(number, options={}) {
  const n = String(number).replace(/\D/g, '')
  if (!/^\d{8,15}$/.test(n)) throw new Error('Invalid WhatsApp number')
  const id = options.id || n
  const root = path.resolve('./data/users', id)
  const session = {
    id,
    number: n,
    ownerNumber: options.ownerNumber || n,
    authDir: path.join(root, 'auth'),
    dataDir: root,
    antiDeleteDir: path.join(root, 'antidelete'),
    cacheIndex: path.join(root, 'cache-index.json'),
    settingsFile: path.join(root, 'settings.json'),
    deletedFile: path.join(root, 'deleted.json'),
    startedAt: Date.now(),
    settings: defaultSettings(),
    messageCache: new Map(),
    groupCache: new Map(),
    sock: null,
    pairingNumber: n,
    paired: false,
    createdAt: options.createdAt || new Date().toISOString()
  }
  fs.mkdirSync(session.authDir, { recursive: true })
  fs.mkdirSync(session.antiDeleteDir, { recursive: true })
  if (fs.existsSync(session.settingsFile)) session.settings = { ...session.settings, ...readJSON(session.settingsFile, {}) }
  else writeJSON(session.settingsFile, session.settings)
  if (!fs.existsSync(session.cacheIndex)) writeJSON(session.cacheIndex, {})
  if (!fs.existsSync(session.deletedFile)) writeJSON(session.deletedFile, [])
  sessions.set(id, session)
  return session
}

export function saveSessionRegistry() {
  const list = [...sessions.values()].map(s => ({
    id: s.id, number: s.number, ownerNumber: s.ownerNumber,
    authDir: s.authDir, dataDir: s.dataDir, antiDeleteDir: s.antiDeleteDir,
    cacheIndex: s.cacheIndex, settingsFile: s.settingsFile, deletedFile: s.deletedFile,
    createdAt: s.createdAt
  }))
  writeJSON(sessionsFile, list)
}

export function loadSessionRegistry() {
  return readJSON(sessionsFile, [])
}

export function removeSession(id) {
  sessions.delete(id)
  saveSessionRegistry()
}

export function saveSessionSettings(session) {
  writeJSON(session.settingsFile, session.settings)
}
