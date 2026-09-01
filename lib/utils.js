import fs from 'fs'
import path from 'path'
import os from 'os'

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function isGroup(jid='') {
  return jid.endsWith('@g.us')
}
export function normalizeNumber(jid='') {
  return jid.split('@')[0].replace(/:\d+$/, '')
}
export function mentionJid(jid) {
  return `@${normalizeNumber(jid)}`
}
export function extractText(m) {
  const mm = m?.message
  if (!mm) return ''
  if (mm.conversation) return mm.conversation
  if (mm.extendedTextMessage?.text) return mm.extendedTextMessage.text
  if (mm.imageMessage?.caption) return mm.imageMessage.caption
  if (mm.videoMessage?.caption) return mm.videoMessage.caption
  if (mm.documentMessage?.caption) return mm.documentMessage.caption
  return ''
}
export function unwrapMessageContent(message) {
  let m = message
  let viewOnce = false
  while (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message
  while (m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.viewOnceMessageV2Extension?.message) {
    m = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message
    viewOnce = true
  }
  return { content: m, viewOnce }
}
export function mediaType(content={}) {
  return ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage']
    .find(k => content[k]) || null
}
export function formatUptime(sec) {
  sec = Math.floor(sec)
  const h = String(Math.floor(sec/3600)).padStart(2,'0')
  const m = String(Math.floor((sec%3600)/60)).padStart(2,'0')
  const s = String(sec%60).padStart(2,'0')
  return `${h}:${m}:${s}`
}
export function getQuotedMessage(msg) {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo ||
              msg?.message?.imageMessage?.contextInfo ||
              msg?.message?.videoMessage?.contextInfo ||
              msg?.message?.documentMessage?.contextInfo
  return ctx?.quotedMessage ? {
    key: {
      remoteJid: msg.key.remoteJid,
      fromMe: !!ctx.participant?.startsWith('bot'),
      id: ctx.stanzaId,
      participant: ctx.participant
    },
    message: ctx.quotedMessage
  } : null
}
export function getTargetJid(msg, args=[]) {
  const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
  if (mentioned[0]) return mentioned[0]
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.participant
  if (quoted) return quoted
  const n = args[0]?.replace(/[^\d]/g,'')
  return n ? `${n}@s.whatsapp.net` : null
}
export function hasUrl(text='') {
  return /(https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/|youtu\.be\/|youtube\.com\/)/i.test(text)
}
export function extensionFor(type, mime='') {
  if (type === 'imageMessage') return '.jpg'
  if (type === 'videoMessage') return '.mp4'
  if (type === 'audioMessage') return '.mp3'
  if (type === 'stickerMessage') return '.webp'
  const ext = mime.split('/')[1]?.split(';')[0]
  return ext ? `.${ext}` : '.bin'
}
