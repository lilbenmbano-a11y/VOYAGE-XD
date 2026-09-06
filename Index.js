import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  downloadMediaMessage,
  jidNormalizedUser,
  getContentType
} from '@whiskeysockets/baileys'
import { config } from './config.js'
import { ensureStorage, readJSON, writeJSON, loadSettings, saveSettings } from './lib/storage.js'
import { extractText, isGroup, normalizeNumber, unwrapMessageContent, mediaType, extensionFor, formatUptime, getQuotedMessage, getTargetJid, hasUrl, mentionJid } from './lib/utils.js'
import { ai, apiGet, downloader, unwrapApiMedia } from './lib/api.js'
import { spamFilter } from './lib/antispam.js'
import { getGitInfo, checkRemote, gitPull, restartProcess } from './lib/updater.js'
import { menu, ownerCard } from './menu.js'
import { currentSession, runInSession, sessions, createSession, saveSessionRegistry, loadSessionRegistry, saveSessionSettings } from './multi-session.js'

ensureStorage()
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const settings = new Proxy({}, { get(_t,p) { return currentSession().settings[p] }, set(_t,p,v) { currentSession().settings[p]=v; return true } })
const sock = new Proxy({}, { get(_t,p) { const v=currentSession().sock?.[p]; return typeof v === 'function' ? v.bind(currentSession().sock) : v } })
const messageCache = new Proxy({}, { get(_t,p) { const v=currentSession().messageCache[p]; return typeof v === 'function' ? v.bind(currentSession().messageCache) : v } })
const groupCache = new Proxy({}, { get(_t,p) { const v=currentSession().groupCache[p]; return typeof v === 'function' ? v.bind(currentSession().groupCache) : v } })
const MENU_IMAGE = path.resolve('./assets/scotty-menu.png')

function saveSettingsNow() { saveSessionSettings(currentSession()) }
function isOwner(jid='') { return normalizeNumber(jid) === normalizeNumber(currentSession().ownerNumber) }
function getPrefix() { return settings.prefix || config.prefix }
function ownerCardForSession() {
  const num = currentSession().ownerNumber || currentSession().number
  return `╭━━━━━━━━━━━━━━━━━━━━━━╮
┃     👑 OWNER CARD    ┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

        ⚡ ${settings.ownerName || config.ownerName}
   ─────────────────
   🏷️  FOUNDER & OWNER
   🤖  ${settings.botName || config.botName}
   🟢  VERIFIED OWNER

   📞 +${num}
   📡  Personal Session

╭━━━━━━━━━━━━━━━━━━━━━━╮
┃ 🔐 OWNER ACCESS      ┃
┃ ⚙️  BOT MANAGEMENT   ┃
┃ 🧠  PERSONAL CONTROL ┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

        ✨ VOYAGE-MD CORE
   ── Built • Managed • Secured ──`
}
function enabled(v) { return v === true || v === 'true' }

function pingText() {
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024)
  return `╭━━━〔 ⚡ VOYAGE-MD CORE 〕━━━╮
┃
┃  🏓 P O N G !
┃
┃  ⚡ LATENCY    │ 42 ms
┃  🟢 STATUS     │ ONLINE
┃  📡 NETWORK    │ STABLE
┃  🤖 ENGINE     │ ACTIVE
┃  ⏱️ UPTIME     │ ${formatUptime((Date.now()-currentSession().startedAt)/1000)}
┃  💾 MEMORY     │ ${mem} MB
┃  ⚙️ VERSION    │ V6.0.0
┃
┃  ━━━━━━━━━━━━━━━━━━━━━
┃  🚀 PERFORMANCE
┃  ████████████████████ 100%
┃  ━━━━━━━━━━━━━━━━━━━━━
┃
┃  💚 Everything is running
┃     perfectly.
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯
       ⚡ VOYAGE-MD`
}
function aliveText() {
  return `╭━━━〔 🤖 VOYAGE-MD CORE 〕━━━╮
┃
┃  🟢 SYSTEM ALIVE
┃
┃  ⚡ STATUS     : ONLINE
┃  🤖 BOT       : ACTIVE
┃  📡 NETWORK   : STABLE
┃  🧠 ENGINE    : RUNNING
┃  🔐 SECURITY  : ENABLED
┃
┃  ━━━━━━━━━━━━━━━━━━━━━
┃  📊 SYSTEM HEALTH
┃
┃  🟢 WhatsApp   ██████████ 100%
┃  🟢 Database   ██████████ 100%
┃  🟢 Commands   ██████████ 100%
┃  🟢 Services   ██████████ 100%
┃
┃  ⏱️ Uptime : ${formatUptime((Date.now()-currentSession().startedAt)/1000)}
┃  ⚙️ Version: V6.0.0
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯
       ⚡ VOYAGE-MD`
}

async function presence(jid, type) {
  try { await sock.sendPresenceUpdate(type, jid) } catch {}
}
async function send(jid, content, options={}) {
  const limit = isGroup(jid) ? config.antiSpam.maxOutgoingPerMinGroup : config.antiSpam.maxOutgoingPerMinDM
  if (!spamFilter.canSend(jid, limit)) {
    logger.warn({ jid }, 'Outgoing rate limit exceeded')
    return null
  }
  return sock.sendMessage(jid, content, options)
}
async function react(jid, key, text='⚡') {
  try { await send(jid, { react: { text, key } }) } catch {}
}
async function requireGroup(m, jid) {
  if (!isGroup(jid)) { await send(jid, { text: '❌ This command only works in groups.' }); return false }
  return true
}
async function groupMeta(jid) {
  if (groupCache.has(jid)) return groupCache.get(jid)
  const meta = await sock.groupMetadata(jid)
  groupCache.set(jid, meta)
  return meta
}
function participants(meta) { return meta?.participants || [] }
function participantAdmin(meta, jid) {
  const p = participants(meta).find(x => x.id === jid)
  return !!p && (p.admin === 'admin' || p.admin === 'superadmin')
}
async function requireAdmin(m, jid) {
  if (!await requireGroup(m,jid)) return false
  const meta = await groupMeta(jid)
  const sender = jidNormalizedUser(m.key.participant || m.key.remoteJid)
  if (!participantAdmin(meta, sender) && !isOwner(sender)) {
    await send(jid, { text: '❌ Admin/owner only.' }); return false
  }
  return true
}
async function requireBotAdmin(jid) {
  const meta = await groupMeta(jid)
  const me = jidNormalizedUser(sock.user.id)
  if (!participantAdmin(meta, me)) {
    await send(jid, { text: '❌ I need to be a group admin for this command.' }); return false
  }
  return true
}
async function targetOrReply(m,args) {
  const j = getTargetJid(m,args)
  if (!j) await send(m.key.remoteJid,{text:'❌ Mention, reply to, or provide a number.'})
  return j
}

async function cacheMessage(m) {
  if (!m?.key?.id || !m.message) return
  const { content, viewOnce } = unwrapMessageContent(m.message)
  const type = mediaType(content)
  const item = {
    id:m.key.id,jid:m.key.remoteJid,sender:m.key.participant || m.key.remoteJid,
    timestamp:Date.now(),text:extractText(m),type,viewOnce
  }
  if (enabled(settings.antiDelete) && type) {
    try {
      const fake = { ...m, message: content }
      const buffer = await downloadMediaMessage(fake, 'buffer', {}, { logger })
      const file = path.join(currentSession().antiDeleteDir, `${m.key.id}${extensionFor(type, content[type]?.mimetype || '')}`)
      fs.writeFileSync(file, buffer)
      item.file = file
      item.mime = content[type]?.mimetype || ''
      item.caption = content[type]?.caption || ''
    } catch (e) { logger.warn({err:e}, 'media cache failed') }
  }
  messageCache.set(m.key.id, { message:m, item })
  const idx = readJSON(currentSession().cacheIndex,{})
  idx[m.key.id] = item
  const keys = Object.keys(idx)
  for (const k of keys.slice(0, Math.max(0, keys.length-300))) delete idx[k]
  writeJSON(currentSession().cacheIndex,idx)
}

async function resendCached(jid,id) {
  const hit = messageCache.get(id)
  const idx = readJSON(currentSession().cacheIndex,{})
  const item = hit?.item || idx[id]
  if (!item) return false
  if (item.file && fs.existsSync(item.file)) {
    const buf = fs.readFileSync(item.file)
    if (item.type === 'imageMessage') await send(jid,{image:buf,caption:item.caption || '🗑️ Deleted image'})
    else if (item.type === 'videoMessage') await send(jid,{video:buf,caption:item.caption || '🗑️ Deleted video'})
    else if (item.type === 'audioMessage') await send(jid,{audio:buf,mimetype:item.mime || 'audio/mpeg',ptt:false})
    else if (item.type === 'stickerMessage') await send(jid,{sticker:buf})
    else await send(jid,{document:buf,fileName:`deleted${path.extname(item.file)}`,mimetype:item.mime || 'application/octet-stream',caption:item.caption || ''})
    return true
  }
  if (item.text) { await send(jid,{text:`🗑️ *Deleted message:*\n\n${item.text}`}); return true }
  return false
}

async function handleDeleted(update) {
  const u = update.update || {}
  const stub = u.messageStubType
  const id = update.key?.id
  if (!id) return
  if (String(stub).toUpperCase().includes('REVOKE') || u.message === null) {
    if (enabled(settings.antiDelete)) {
      const ok = await resendCached(update.key.remoteJid,id)
      if (ok) await send(update.key.remoteJid,{text:'🛡️ *ANTI-DELETE*\nThe deleted message was recovered.'})
    }
  }
}

async function sendApiMedia(jid, data, fallback='') {
  const media = await unwrapApiMedia(data)
  const url = media.url
  if (!url) {
    await send(jid,{text: fallback || '❌ API did not return a downloadable URL.'}); return
  }
  const r = await axiosGetBinary(url)
  const ct = r.headers['content-type'] || ''
  if (ct.includes('audio')) await send(jid,{audio:r.data,mimetype:ct})
  else if (ct.includes('video')) await send(jid,{video:r.data,mimetype:ct})
  else if (ct.includes('image')) await send(jid,{image:r.data})
  else await send(jid,{document:r.data,fileName:'download',mimetype:ct || 'application/octet-stream'})
}
async function axiosGetBinary(url) {
  const axios = (await import('axios')).default
  return axios.get(url,{responseType:'arraybuffer',timeout:90000,maxContentLength:80*1024*1024})
}

async function viewOnce(m) {
  const quoted = getQuotedMessage(m)
  if (!quoted) { await send(m.key.remoteJid,{text:'❌ Reply to a view-once image/video/audio/document.'}); return }
  const {content} = unwrapMessageContent(quoted.message)
  const type = mediaType(content)
  if (!type) { await send(m.key.remoteJid,{text:'❌ The quoted message is not media.'}); return }
  const fake={...quoted,message:content}
  const buffer=await downloadMediaMessage(fake,'buffer',{}, {logger})
  if (type==='imageMessage') await send(m.key.remoteJid,{image:buffer,caption:content[type]?.caption || ''})
  else if (type==='videoMessage') await send(m.key.remoteJid,{video:buffer,caption:content[type]?.caption || ''})
  else if (type==='audioMessage') await send(m.key.remoteJid,{audio:buffer,mimetype:content[type]?.mimetype || 'audio/mpeg',ptt:!!content[type]?.ptt})
  else await send(m.key.remoteJid,{document:buffer,fileName:content[type]?.fileName || 'media',mimetype:content[type]?.mimetype || 'application/octet-stream'})
}

function isSudo(jid='') { return (settings.sudo || []).map(normalizeNumber).includes(normalizeNumber(jid)) }
function isPrivileged(jid='') { return isOwner(jid) || isSudo(jid) }
function boolArg(args, fallback=true) { return !['off','false','0','no','disable','disabled'].includes((args[0]|| (fallback?'on':'off')).toLowerCase()) }
function setSetting(key, value) { settings[key]=value; saveSettingsNow(); return value }
async function quotedRaw(m) { return getQuotedMessage(m) }
async function quotedMediaBuffer(m) {
  const q = await quotedRaw(m)
  if (!q) return null
  const {content} = unwrapMessageContent(q.message)
  const type = mediaType(content)
  if (!type) return null
  const fake={...q,message:content}
  const buffer=await downloadMediaMessage(fake,'buffer',{}, {logger})
  return {buffer,type,content,q}
}
async function sendGroupMentions(jid, meta, title='TAG ALL') {
  const ps=participants(meta), mentions=ps.map(p=>p.id)
  const lines=ps.map((p,i)=>`┃ ${String(i+1).padStart(2,'0')}. @${normalizeNumber(p.id)}`).join('\n')
  return send(jid,{text:`╭━━━〔 📣 ${title} 〕━━━╮\n┃\n${lines}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`,mentions})
}
async function updatePresenceSetting(jid) {
  if (settings.online === false) await presence(jid,'unavailable')
  else await presence(jid,'available')
}

async function processCommand(m) {
  const jid = m.key.remoteJid
  const sender = m.key.participant || m.key.remoteJid

  const cooldownCheck = spamFilter.checkCommandCooldown(sender, config.antiSpam.commandCooldownMs, isOwner(sender))
  if (cooldownCheck.blocked) {
    return send(jid, { text: cooldownCheck.reason })
  }

  const raw = extractText(m).trim()
  if (!raw.startsWith(getPrefix())) return
  const body = raw.slice(getPrefix().length).trim()
  const [cmdRaw,...args] = body.split(/\s+/)
  const cmd = (cmdRaw || '').toLowerCase()
  const argText = args.join(' ')

  if (cmd === 'pair') {
    if (isGroup(jid)) return send(jid,{text:'❌ Use /pair in a private chat.'})
    const target = normalizeNumber(args[0] || '')
    const requester = normalizeNumber(jid)
    if (!target || target.length < 8) return send(jid,{text:`Usage: ${getPrefix()}pair 2637XXXXXXXX`})
    if (sessions.has(target) && sessions.get(target).paired) return send(jid,{text:'⚠️ A session for this number already exists. Use /mysession or /logout.'})
    try {
      const session = sessions.get(target) || createSession(target,{ownerNumber:target})
      session.pairingNumber = target
      session.pairRequester = jid
      session.pairController = currentSession()
      session.paired = false
      saveSessionRegistry()
      await startSession(session)
      return
    } catch (e) {
      logger.error({err:e},'pair command failed')
      return send(jid,{text:`❌ Pairing failed: ${e?.message || 'Unknown error'}`})
    }
  }
  if (cmd === 'mysession') {
    return send(jid,{text:`╭━━━〔 🔐 MY SESSION 〕━━━╮\n┃\n┃ 📱 Number: ${currentSession().number}\n┃ 👑 Owner: ${currentSession().ownerNumber}\n┃ 🟢 Status: ${currentSession().paired ? 'CONNECTED' : 'PAIRING'}\n┃ ⚙️ Prefix: ${getPrefix()}\n┃ 🤖 Bot: ${settings.botName || config.botName}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`})
  }
  if (cmd === 'sessions') {
    if (!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'})
    const list=[...sessions.values()].map((x,i)=>`${i+1}. ${x.number} — ${x.paired?'ONLINE':'OFFLINE'}`).join('\n') || 'No sessions.'
    return send(jid,{text:`📱 *VOYAGE-MD SESSIONS*\n\n${list}`})
  }
  if (cmd === 'logout') {
    if (!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'})
    if (currentSession().id === 'master') return send(jid,{text:'❌ The master session cannot be logged out with this command.'})
    try { await sock.logout() } catch {}
    sessions.delete(currentSession().id); saveSessionRegistry()
    return send(jid,{text:'✅ Your VOYAGE-MD session has been logged out. Pair again when needed.'})
  }

  // ─── UPDATE SYSTEM (OWNER ONLY) ───
  if (cmd === 'checkupdate') {
    if (!isOwner(m.key.participant || jid)) return send(jid, { text: '❌ Owner only.' })
    const info = getGitInfo()
    const remote = checkRemote()
    let txt = `╭━━━〔 🔄 UPDATE CHECK 〕━━━╮\n┃\n`
    if (info.ok) {
      txt += `┃ 📌 Commit: ${info.hash}\n┃ 🌿 Branch: ${info.branch}\n┃ 📝 ${info.msg}\n┃ 👤 ${info.author}\n┃ 📅 ${info.date}\n┃\n`
    } else {
      txt += `┃ ⚠️ Git info unavailable\n┃\n`
    }
    if (remote.ok) {
      if (remote.behind) txt += `┃ 🔴 ${remote.count} update(s) behind\n┃ 📥 Run ${getPrefix()}update to pull\n`
      else txt += `┃ 🟢 Already up to date\n`
    } else {
      txt += `┃ ⚠️ Remote check failed\n┃ ${remote.error}\n`
    }
    txt += `┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`
    return send(jid, { text: txt })
  }

  if (cmd === 'update') {
    if (!isOwner(m.key.participant || jid)) return send(jid, { text: '❌ Owner only.' })
    await send(jid, { text: '🔄 *Updating VOYAGE-MD...*\n⬇️ Pulling latest code from origin...' })
    const result = gitPull()
    if (!result.ok) {
      return send(jid, { text: `❌ *Update Failed*\n\n\`\`\`\n${result.error}\n\`\`\`` })
    }
    await send(jid, { text: `✅ *Update Successful*\n\n\`\`\`\n${result.output}\n\`\`\`\n\n🔄 Restarting now... All sessions will reconnect automatically.` })
    setTimeout(() => restartProcess(), 2000)
    return
  }

  if ((settings.mode || config.mode)==='private' && !isPrivileged(m.key.participant||jid)) return

  if (settings.autoTyping) await presence(jid,'composing')
  else if (settings.autoRecording) await presence(jid,'recording')

  try {
    if (cmd==='menu' || cmd==='help') {
      const caption = menu(getPrefix())
      if (fs.existsSync(MENU_IMAGE)) return await send(jid,{image:fs.readFileSync(MENU_IMAGE),caption})
      return await send(jid,{text:caption})
    }
    if (cmd==='ping') {
      const t=Date.now(); const msg=await send(jid,{text:'⚡ Checking...'}); const ms=Date.now()-t
      return await send(jid,{text:pingText().replace('42 ms',`${ms} ms`)})
    }
    if (cmd==='alive') return await send(jid,{text:aliveText()})
    if (cmd==='owner') return await send(jid,{text:ownerCardForSession()})
    if (cmd==='status') return await send(jid,{text:`🟢 VOYAGE-MD ONLINE\nPrefix: ${getPrefix()}\nMode: ${settings.mode || config.mode}\nUptime: ${formatUptime((Date.now()-currentSession().startedAt)/1000)}`})
    if (cmd==='vv' || cmd==='viewonce') return await viewOnce(m)
    if (cmd==='getdp') {
      const target = getTargetJid(m,args) || jid
      try {
        const url = await sock.profilePictureUrl(target,'image')
        return await send(jid,{image:{url},caption:`👤 Profile picture: ${target}`})
      } catch { return await send(jid,{text:'❌ Profile picture unavailable.'}) }
    }

    if (cmd==='autoread') { settings.autoRead = !['off','false','0'].includes((args[0]||'').toLowerCase()); saveSettingsNow(); return send(jid,{text:`📖 Auto-read: ${settings.autoRead?'ON':'OFF'}`}) }
    if (cmd==='autotyping') { settings.autoTyping = !['off','false','0'].includes((args[0]||'').toLowerCase()); if(settings.autoTyping) settings.autoRecording=false; saveSettingsNow(); return send(jid,{text:`⌨️ Auto-typing: ${settings.autoTyping?'ON':'OFF'}`}) }
    if (cmd==='autorecording') { settings.autoRecording = !['off','false','0'].includes((args[0]||'').toLowerCase()); if(settings.autoRecording) settings.autoTyping=false; saveSettingsNow(); return send(jid,{text:`🎙️ Auto-recording: ${settings.autoRecording?'ON':'OFF'}`}) }
    if (cmd==='antiviewonce') { settings.antiViewOnce = !['off','false','0'].includes((args[0]||'').toLowerCase()); saveSettingsNow(); return send(jid,{text:`👁️ Anti-view-once: ${settings.antiViewOnce?'ON':'OFF'}`}) }
    if (cmd==='antidelete') { settings.antiDelete = !['off','false','0'].includes((args[0]||'').toLowerCase()); saveSettingsNow(); return send(jid,{text:`🛡️ Anti-delete: ${settings.antiDelete?'ON':'OFF'}\nMedia cache: ${currentSession().antiDeleteDir}`}) }
    if (cmd==='autoreply') {
      const scope=(args[0]||'').toLowerCase(), val=(args[1]||'on').toLowerCase()
      if(!['dm','grp'].includes(scope)) return send(jid,{text:`Usage: ${getPrefix()}autoreply dm on/off\nor ${getPrefix()}autoreply grp on/off`})
      settings.autoReply[scope]=!['off','false','0'].includes(val); saveSettingsNow()
      return send(jid,{text:`🤖 Auto-reply ${scope}: ${settings.autoReply[scope]?'ON':'OFF'}`})
    }
    if (cmd==='antilink') {
      if(!await requireAdmin(m,jid)) return
      settings.antiLink=!['off','false','0'].includes((args[0]||'on').toLowerCase()); saveSettingsNow()
      return send(jid,{text:`🔗 Anti-link: ${settings.antiLink?'ON':'OFF'}`})
    }
    if (cmd==='setprefix') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); if(!args[0]) return send(jid,{text:'Usage: /setprefix !'}); settings.prefix=args[0][0]; saveSettingsNow(); return send(jid,{text:`✅ Prefix changed to ${settings.prefix}`}) }
    if (cmd==='setname') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); settings.botName=argText||config.botName; saveSettingsNow(); return send(jid,{text:`✅ Bot name: ${settings.botName}`}) }

    if (cmd==='play' || cmd==='ytplay') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}play Faded`})
      const data=await downloader('/downloader/ytplay',{q:argText})
      return await sendApiMedia(jid,data,'❌ YouTube downloader returned no media.')
    }
    if (cmd==='soundcloud') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}soundcloud Faded`})
      const data=await downloader('/downloader/soundcloud',{q:argText})
      return await sendApiMedia(jid,data,'❌ SoundCloud downloader returned no media.')
    }
    if (cmd==='fb') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}fb <Facebook URL>`})
      const data=await downloader('/downloader/facebookv2',{url:argText})
      return await sendApiMedia(jid,data,'❌ Facebook downloader returned no media.')
    }
    if (cmd==='tiktok') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}tiktok <TikTok URL>`})
      const data=await downloader('/downloader/tiktok',{url:argText})
      return await sendApiMedia(jid,data,'❌ TikTok downloader returned no media.')
    }
    if (cmd==='txt') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}txt Trashcore`})
      const data=await apiGet('/tools/ttp',{text:argText,color:'Green'})
      return await sendApiMedia(jid,data,'❌ TTP API returned no image.')
    }
    if (cmd==='weather') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}weather Zimbabwe`})
      const d=await apiGet('/tools/weather',{city:argText}), r=d?.result
      if(!r) return send(jid,{text:'❌ Weather unavailable.'})
      return send(jid,{text:`🌤️ *WEATHER — ${r.location?.city || argText}*\n\n🌡️ ${r.current?.temp_C}°C / ${r.current?.temp_F}°F\n🤔 Feels like: ${r.current?.feels_like_C}°C\n💧 Humidity: ${r.current?.humidity}%\n💨 Wind: ${r.current?.wind_kmph} km/h\n☁️ ${r.current?.description}\n\n📅 Today: ${r.today?.min_C}°C — ${r.today?.max_C}°C`})
    }
    if (cmd==='gimage') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}gimage anime`})
      const d=await apiGet('/search/gimage',{q:argText})
      const r=d?.result ?? d?.data ?? d
      const urls=[]
      const walk=x=>{ if(!x)return; if(typeof x==='string'&&/^https?:\/\//.test(x)&&/\.(jpg|jpeg|png|webp)(\?|$)/i.test(x)) urls.push(x); else if(Array.isArray(x)) x.forEach(walk); else if(typeof x==='object') Object.values(x).forEach(walk) }
      walk(r)
      if(!urls.length) return send(jid,{text:'❌ No image URL returned.'})
      return send(jid,{image:{url:urls[0]},caption:`🔎 Google image: ${argText}`})
    }
    if (cmd==='ai') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}ai <question>`})
      return send(jid,{text:`🤖 *VOYAGE-MD AI*\n\n${await ai(argText)}`})
    }
    if (cmd==='smile' || cmd==='blush' || cmd==='kiss') {
      const d=await apiGet(`/fun/waifu/${cmd}`)
      return await sendApiMedia(jid,d,`❌ ${cmd} API returned no media.`)
    }
    if (cmd==='effects') {
      const d=await apiGet('/tools/ephoto/effects',{name:argText})
      return await sendApiMedia(jid,d,'❌ Effects API returned no media. Check the effect name.')
    }
    if (cmd==='define') {
      if(!argText) return send(jid,{text:`Usage: ${getPrefix()}define word`})
      const d=await apiGet('/search/define',{q:argText})
      return send(jid,{text:`📖 ${JSON.stringify(d?.result || d, null, 2).slice(0,3500)}`})
    }

    if (cmd==='welcome') { setSetting('welcome',boolArg(args)); return send(jid,{text:`👋 Welcome: ${settings.welcome?'ON':'OFF'}`}) }
    if (cmd==='goodbye') { setSetting('goodbye',boolArg(args)); return send(jid,{text:`👋 Goodbye: ${settings.goodbye?'ON':'OFF'}`}) }
    if (cmd==='setwelcome') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); if(!argText) return send(jid,{text:`Usage: ${getPrefix()}setwelcome <message>`}); setSetting('welcomeText',argText); return send(jid,{text:'✅ Welcome message updated.'}) }
    if (cmd==='setgoodbye') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); if(!argText) return send(jid,{text:`Usage: ${getPrefix()}setgoodbye <message>`}); setSetting('goodbyeText',argText); return send(jid,{text:'✅ Goodbye message updated.'}) }
    if (cmd==='recording') { settings.autoRecording=boolArg(args); if(settings.autoRecording) settings.autoTyping=false; saveSettingsNow(); return send(jid,{text:`🎙️ Recording: ${settings.autoRecording?'ON':'OFF'}`}) }
    if (cmd==='statusview') { const q=getQuotedMessage(m); if(!q) return send(jid,{text:'❌ Reply to a status message.'}); await sock.readMessages([q.key]).catch(()=>{}); return send(jid,{text:'👁️ Status marked as viewed.'}) }
    if (cmd==='statusemoji' || cmd==='statuslike') { const q=getQuotedMessage(m); if(!q) return send(jid,{text:`Usage: ${getPrefix()}${cmd} ❤️ (reply to a status)`}); const emoji=args[0] || (cmd==='statuslike'?'❤️':'🔥'); try { await sock.sendMessage('status@broadcast',{react:{text:emoji,key:q.key}}); return send(jid,{text:`✅ Status reacted with ${emoji}`}) } catch { return send(jid,{text:'❌ Status reaction is not supported by this Baileys session.'}) } }
    if (cmd==='antistatus') { setSetting('antiStatus',boolArg(args)); return send(jid,{text:`🛡️ Anti-status: ${settings.antiStatus?'ON':'OFF'}`}) }
    if (cmd==='autoreact') { setSetting('autoReact',boolArg(args)); return send(jid,{text:`❤️ Auto-react: ${settings.autoReact?'ON':'OFF'}`}) }
    if (cmd==='anticall') { setSetting('antiCall',boolArg(args)); return send(jid,{text:`📵 Anti-call: ${settings.antiCall?'ON':'OFF'}`}) }
    if (cmd==='anticallmsg') { setSetting('antiCallMsg',argText || '🚫 Calls are not accepted. Please send a message.'); return send(jid,{text:'✅ Anti-call message updated.'}) }
    if (cmd==='adminaction') { setSetting('adminAction',boolArg(args)); return send(jid,{text:`🛡️ Admin action mode: ${settings.adminAction?'ON':'OFF'}`}) }
    if (cmd==='online') { setSetting('online',boolArg(args)); await updatePresenceSetting(jid); return send(jid,{text:`🟢 Online presence: ${settings.online?'ON':'OFF'}`}) }
    if (cmd==='mode') { const v=(args[0]||'').toLowerCase(); if(!['public','private'].includes(v)) return send(jid,{text:`Current mode: ${settings.mode||config.mode}\nUsage: ${getPrefix()}mode public/private`}); if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('mode',v); return send(jid,{text:`⚙️ Mode: ${v.toUpperCase()}`}) }
    if (cmd==='prefix') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('prefix',args[0][0]); return send(jid,{text:`✅ Prefix: ${settings.prefix}`}) } return send(jid,{text:`⚙️ Current prefix: ${getPrefix()}`}) }
    if (cmd==='botname') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('botName',argText); return send(jid,{text:`🤖 Bot name: ${settings.botName}`}) } return send(jid,{text:`🤖 ${settings.botName||config.botName}`}) }
    if (cmd==='ownername') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('ownerName',argText); return send(jid,{text:`👑 Owner name: ${settings.ownerName||config.ownerName}`}) } return send(jid,{text:`👑 ${settings.ownerName||config.ownerName}`}) }
    if (cmd==='ownernumber') return send(jid,{text:`📞 ${config.ownerNumber}`})
    if (cmd==='description') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('description',argText); return send(jid,{text:'✅ Description updated.'}) } return send(jid,{text:`📝 ${settings.description||'VOYAGE-MD'}`}) }
    if (cmd==='stickername') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('stickerName',argText); return send(jid,{text:'✅ Sticker pack name updated.'}) } return send(jid,{text:`🏷️ ${settings.stickerName||'VOYAGE-MD'}`}) }
    if (cmd==='delpath') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('deletePath',argText); return send(jid,{text:`🗂️ Delete path: ${settings.deletePath||currentSession().antiDeleteDir}`}) } return send(jid,{text:`🗂️ Delete path: ${settings.deletePath||currentSession().antiDeleteDir}`}) }
    if (cmd==='reactemojis') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('reactEmojis',args); return send(jid,{text:`❤️ React emojis: ${args.join(' ')}`}) } return send(jid,{text:`❤️ ${((settings.reactEmojis||['❤️','🔥','😂','👍']).join(' '))}`}) }
    if (cmd==='owneremojis') { if(args[0]) { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); setSetting('ownerEmojis',argText); return send(jid,{text:'✅ Owner emoji set updated.'}) } return send(jid,{text:`👑 ${settings.ownerEmojis||'👑⚡'}`}) }
    if (cmd==='mentionreply') { setSetting('mentionReply',boolArg(args)); return send(jid,{text:`📣 Mention reply: ${settings.mentionReply?'ON':'OFF'}`}) }
    if (cmd==='settings') return send(jid,{text:`⚙️ *VOYAGE-MD SETTINGS*\n\n${JSON.stringify(settings,null,2).slice(0,6000)}`})
    if (cmd==='sudo') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); const t=await targetOrReply(m,args); if(!t)return; settings.sudo=[...(settings.sudo||[]).filter(x=>normalizeNumber(x)!==normalizeNumber(t)),t]; saveSettingsNow(); return send(jid,{text:`✅ @${normalizeNumber(t)} added to sudo.`,mentions:[t]}) }
    if (cmd==='delsudo') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); const t=await targetOrReply(m,args); if(!t)return; settings.sudo=(settings.sudo||[]).filter(x=>normalizeNumber(x)!==normalizeNumber(t)); saveSettingsNow(); return send(jid,{text:`✅ @${normalizeNumber(t)} removed from sudo.`,mentions:[t]}) }
    if (cmd==='listsudo') { const list=(settings.sudo||[]); return send(jid,{text:`👑 *SUDO LIST*\n\n${list.length?list.map((x,i)=>`${i+1}. @${normalizeNumber(x)}`).join('\n'):'No sudo users.'}`,mentions:list}) }
    if (cmd==='privacy') { try { const p=await sock.fetchPrivacySettings(); return send(jid,{text:`🔐 *PRIVACY*\n\n${JSON.stringify(p,null,2).slice(0,5000)}`}) } catch { return send(jid,{text:'❌ Privacy settings unavailable.'}) } }
    if (cmd==='blocklist') { try { const list=await sock.fetchBlocklist(); return send(jid,{text:`🚫 *BLOCKLIST*\n\n${list.length?list.map((x,i)=>`${i+1}. ${normalizeNumber(x)}`).join('\n'):'Empty'}`}) } catch { return send(jid,{text:'❌ Blocklist unavailable.'}) } }
    if (cmd==='getbio') { const t=getTargetJid(m,args)||jid; try { const s=await sock.fetchStatus(t); return send(jid,{text:`📝 Bio: ${s?.status||'No bio'}\n📅 ${s?.setAt?new Date(s.setAt).toLocaleString():'Unknown'}`}) } catch { return send(jid,{text:'❌ Bio unavailable.'}) } }
    if (cmd==='updatebio') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); if(!argText) return send(jid,{text:`Usage: ${getPrefix()}updatebio <text>`}); await sock.updateProfileStatus(argText); return send(jid,{text:'✅ Bio updated.'}) }
    if (cmd==='setonline') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); const v=(args[0]||'true').toLowerCase(); setSetting('online',!['off','false','0'].includes(v)); await updatePresenceSetting(jid); return send(jid,{text:`🟢 Online: ${settings.online?'ON':'OFF'}`}) }
    if (cmd==='groupsprivacy') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); const v=(args[0]||'all').toLowerCase(); if(typeof sock.updateGroupsAddModePrivacy==='function') await sock.updateGroupsAddModePrivacy(v); return send(jid,{text:`🔐 Groups privacy: ${v}`}) }
    if (cmd==='getprivacy') { try { const p=await sock.fetchPrivacySettings(); return send(jid,{text:`🔐 ${JSON.stringify(p,null,2).slice(0,5000)}`}) } catch { return send(jid,{text:'❌ Privacy unavailable.'}) } }
    if (cmd==='botdp') { try { const url=await sock.profilePictureUrl(jidNormalizedUser(sock.user.id),'image'); return send(jid,{image:{url},caption:'🤖 VOYAGE-MD DP'}) } catch { return send(jid,{text:'❌ Bot profile picture unavailable.'}) } }
    if (cmd==='setppall' || cmd==='fullpp') { if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'}); const q=await quotedMediaBuffer(m); if(!q || q.type!=='imageMessage') return send(jid,{text:'❌ Reply to an image.'}); await sock.updateProfilePicture(jidNormalizedUser(sock.user.id),q.buffer); return send(jid,{text:'✅ Bot profile picture updated.'}) }
    if (cmd==='delete' || cmd==='del') { if(!isPrivileged(m.key.participant||jid) && !isGroup(jid)) return send(jid,{text:'❌ Owner/admin only.'}); const q=getQuotedMessage(m); if(!q) return send(jid,{text:`❌ Reply to a message with ${getPrefix()}${cmd}.`}); if(isGroup(jid) && !await requireAdmin(m,jid)) return; await send(jid,{delete:q.key}); return }
    if (cmd==='forward') { const q=getQuotedMessage(m); if(!q) return send(jid,{text:'❌ Reply to a message to forward.'}); const raw=q.message; return send(jid,raw) }
    if (cmd==='hidetag' || cmd==='tag') { if(!await requireAdmin(m,jid)) return; const meta=await groupMeta(jid); return sendGroupMentions(jid,meta,argText||'HIDE TAG') }
    if (cmd==='gcpp') { if(!await requireGroup(m,jid)) return; try { const url=await sock.profilePictureUrl(jid,'image'); return send(jid,{image:{url},caption:'👥 Group profile picture'}) } catch { return send(jid,{text:'❌ Group profile picture unavailable.'}) } }
    if (cmd==='updategname') { if(!await requireAdmin(m,jid)) return; if(!await requireBotAdmin(jid)) return; if(!argText) return send(jid,{text:`Usage: ${getPrefix()}updategname <name>`}); await sock.groupUpdateSubject(jid,argText); groupCache.delete(jid); return send(jid,{text:`✅ Group name updated to: ${argText}`}) }
    if (cmd==='updategdesc') { if(!await requireAdmin(m,jid)) return; if(!await requireBotAdmin(jid)) return; if(!argText) return send(jid,{text:`Usage: ${getPrefix()}updategdesc <description>`}); await sock.groupUpdateDescription(jid,argText); groupCache.delete(jid); return send(jid,{text:'✅ Group description updated.'}) }
    if (cmd==='poll') { if(!await requireGroup(m,jid)) return; const parts=argText.split('|').map(x=>x.trim()).filter(Boolean); if(parts.length<3) return send(jid,{text:`Usage: ${getPrefix()}poll Question | Option 1 | Option 2`}); return send(jid,{poll:{name:parts[0],values:parts.slice(1),selectableCount:1}}) }
    if (cmd==='newgc') { if(!isPrivileged(m.key.participant||jid)) return send(jid,{text:'❌ Owner/sudo only.'}); const name=argText||'VOYAGE-MD GROUP'; const t=m.key.participant||jid; const created=await sock.groupCreate(name,[t]); return send(jid,{text:`✅ Group created: ${created?.id||'created'}\nUse ${getPrefix()}link inside the new group.`}) }
    if (cmd==='join' || cmd==='invite') { if(!isPrivileged(m.key.participant||jid)) return send(jid,{text:'❌ Owner/sudo only.'}); const code=(argText.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i)?.[1]||argText.replace(/[^A-Za-z0-9]/g,'')).trim(); if(!code) return send(jid,{text:`Usage: ${getPrefix()}${cmd} <group invite link/code>`}); if(cmd==='join') { const id=await sock.groupAcceptInvite(code); return send(jid,{text:`✅ Joined group: ${id}`}) } const meta=await groupMeta(jid); const target=await targetOrReply(m,args); if(!target)return; const c=await sock.groupInviteCode(jid); await send(jid,{text:`🔗 https://chat.whatsapp.com/${c}`,mentions:[target]}) }
    if (cmd==='requests' || cmd==='acceptall' || cmd==='rejectall' || cmd==='accept' || cmd==='reject') { if(!await requireAdmin(m,jid)) return; if(typeof sock.groupRequestParticipantsList!=='function') return send(jid,{text:'❌ Group join-request API is unavailable in this Baileys version.'}); const req=await sock.groupRequestParticipantsList(jid); if(cmd==='requests') return send(jid,{text:`📥 *JOIN REQUESTS*\n\n${req.length?req.map((x,i)=>`${i+1}. @${normalizeNumber(x.jid||x.id||x)}`).join('\n'):'No pending requests.'}`,mentions:req.map(x=>x.jid||x.id||x)}); if(!req.length) return send(jid,{text:'✅ No pending requests.'}); const action=cmd==='rejectall'||cmd==='reject'?'reject':'approve'; const targets=cmd==='accept'||cmd==='reject'?[await targetOrReply(m,args)]:req.map(x=>x.jid||x.id||x); const valid=targets.filter(Boolean); await sock.groupRequestParticipantsUpdate(jid,valid,action); return send(jid,{text:`✅ ${action.toUpperCase()} completed for ${valid.length} request(s).`,mentions:valid}) }
    if (cmd==='gcstatus' || cmd==='gcstatus2') { if(!await requireAdmin(m,jid)) return; setSetting(`groupStatus_${jid}`,boolArg(args)); return send(jid,{text:`📢 Group status ${cmd.toUpperCase()}: ${settings[`groupStatus_${jid}`]?'ON':'OFF'}`}) }
    if (cmd==='chreact') { const q=getQuotedMessage(m); if(!q) return send(jid,{text:`Usage: ${getPrefix()}chreact ❤️ (reply to a channel/status message)`}); const emoji=args[0]||'❤️'; try { await sock.sendMessage(q.key.remoteJid,{react:{text:emoji,key:q.key}}); return send(jid,{text:`✅ Reacted with ${emoji}`}) } catch { return send(jid,{text:'❌ Channel reaction is unavailable in this Baileys session.'}) } }
    if (cmd==='vw' || cmd==='vw2' || cmd==='vw3') return await viewOnce(m)
    if (cmd==='ik') return send(jid,{text:'⚡ VOYAGE-MD is active and ready.'})
    if (cmd==='follow' || cmd==='unfollow') return send(jid,{text:`ℹ️ ${cmd} is not exposed by Baileys 6.7.24 as a stable public API.`})
    if (cmd==='yts') { if(!argText) return send(jid,{text:`Usage: ${getPrefix()}yts <query>`}); return send(jid,{text:`🔎 YouTube search is available through ${getPrefix()}play <query>.`}) }
    if (cmd==='animegirl4' || cmd==='animegirl5' || cmd==='dog') { const d=await apiGet(`/fun/waifu/${cmd}`); return await sendApiMedia(jid,d,`❌ ${cmd} API returned no media.`) }

    if (['promote','demote','kick','add'].includes(cmd)) {
      if(!await requireAdmin(m,jid)) return
      if(!await requireBotAdmin(jid)) return
      const target=await targetOrReply(m,args); if(!target)return
      if(cmd==='promote') await sock.groupParticipantsUpdate(jid,[target],'promote')
      if(cmd==='demote') await sock.groupParticipantsUpdate(jid,[target],'demote')
      if(cmd==='kick') await sock.groupParticipantsUpdate(jid,[target],'remove')
      if(cmd==='add') await sock.groupParticipantsUpdate(jid,[target],'add')
      return send(jid,{text:`✅ ${cmd.toUpperCase()} completed for @${normalizeNumber(target)}`,mentions:[target]})
    }
    if (cmd==='tagall' || cmd==='everyone') {
      if(!await requireAdmin(m,jid)) return
      const meta=await groupMeta(jid), ps=participants(meta)
      const mentions=ps.map(p=>p.id)
      const lines=ps.map((p,i)=>`${String(i+1).padStart(2,'0')}. @${normalizeNumber(p.id)}`).join('\n')
      return send(jid,{text:`╭━━━〔 📣 ${cmd==='everyone'?'EVERYONE':'TAG ALL'} 〕━━━╮\n┃\n${lines}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`,mentions})
    }
    if (cmd==='link') {
      if(!await requireAdmin(m,jid)) return
      const code=await sock.groupInviteCode(jid)
      return send(jid,{text:`🔗 *GROUP LINK*\nhttps://chat.whatsapp.com/${code}`})
    }
    if (cmd==='revoke') {
      if(!await requireAdmin(m,jid)) return
      if(!await requireBotAdmin(jid)) return
      await sock.groupRevokeInvite(jid)
      const code=await sock.groupInviteCode(jid)
      return send(jid,{text:`🔄 Invite link reset.\nhttps://chat.whatsapp.com/${code}`})
    }
    if (cmd==='ginfo') {
      if(!await requireGroup(m,jid)) return
      const meta=await groupMeta(jid)
      return send(jid,{text:`╭━━━〔 👥 GROUP INFO 〕━━━╮\n┃\n┃ 🏷️ Name: ${meta.subject}\n┃ 👤 Members: ${meta.participants.length}\n┃ 📝 Description: ${meta.desc || 'None'}\n┃ 🔐 Restrict: ${meta.restrict?'ON':'OFF'}\n┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`})
    }
    if (cmd==='mute' || cmd==='unmute') {
      if(!await requireAdmin(m,jid)) return
      if(!await requireBotAdmin(jid)) return
      await sock.groupSettingUpdate(jid,cmd==='mute'?'announcement':'not_announcement')
      return send(jid,{text:`🔇 Group ${cmd==='mute'?'muted':'unmuted'}.`})
    }
    if (cmd==='leave' || cmd==='out') {
      if(!await requireAdmin(m,jid)) return
      await send(jid,{text:'👋 Leaving group...'})
      return sock.groupLeave(jid)
    }
    if (cmd==='block' || cmd==='unblock') {
      if(!isOwner(m.key.participant||jid)) return send(jid,{text:'❌ Owner only.'})
      const target=await targetOrReply(m,args); if(!target)return
      await sock.updateBlockStatus(target,cmd==='block'?'block':'unblock')
      return send(jid,{text:`✅ ${cmd}ed @${normalizeNumber(target)}`,mentions:[target]})
    }
  } catch (e) {
    logger.error({err:e,cmd},'command failed')
    await send(jid,{text:`❌ Command failed: ${e?.message || 'Unknown error'}`}).catch(()=>{})
  } finally {
    if (settings.autoTyping || settings.autoRecording) await presence(jid,'paused')
  }
}

async function autoReply(m) {
  const jid=m.key.remoteJid
  if(m.key.fromMe || !m.message) return
  const text=extractText(m).trim()
  if(!text || text.startsWith(getPrefix())) return
  const scope=isGroup(jid)?'grp':'dm'
  if(!settings.autoReply?.[scope]) return
  try {
    const answer=await ai(`You are VOYAGE-MD, a friendly WhatsApp assistant. Reply briefly and naturally to this message: ${text}`)
    await send(jid,{text:answer})
  } catch(e) { logger.warn({err:e},'auto reply failed') }
}

async function handleIncoming(m) {
  if(!m?.message || !m.key?.remoteJid) return
  if(settings.autoRead && !m.key.fromMe) await sock.readMessages([m.key]).catch(()=>{})
  await cacheMessage(m)
  const jid=m.key.remoteJid
  const text=extractText(m)
  if (settings.autoReact && !m.key.fromMe) {
    const emojis=settings.reactEmojis || ['❤️','🔥','😂','👍']
    await react(jid,m.key,emojis[Math.floor(Math.random()*emojis.length)])
  }
  if (settings.mentionReply && !m.key.fromMe && text && (text.includes('@'+normalizeNumber(sock.user?.id||'')) || text.toLowerCase().includes((settings.botName||config.botName).toLowerCase()))) {
    await send(jid,{text:`⚡ ${settings.botName||config.botName} is online. Use ${getPrefix()}menu for commands.`})
  }
  if(settings.antiStatus && jid==='status@broadcast') return
  if(settings.antiLink && isGroup(jid) && hasUrl(text) && !m.key.fromMe) {
    const meta=await groupMeta(jid).catch(()=>null)
    const sender=m.key.participant || ''
    if(!participantAdmin(meta,sender) && !isOwner(sender) && await requireBotAdmin(jid)) {
      await sock.sendMessage(jid,{delete:m.key}).catch(()=>{})
      await send(jid,{text:`🚫 @${normalizeNumber(sender)} links are not allowed here.`,mentions:[sender]})
      return
    }
  }
  const {content,viewOnce}=unwrapMessageContent(m.message)
  if(settings.antiViewOnce && viewOnce && !m.key.fromMe) {
    try {
      const fake={...m,message:content}
      const type=mediaType(content)
      if(type) {
        const b=await downloadMediaMessage(fake,'buffer',{}, {logger})
        if(type==='imageMessage') await send(jid,{image:b,caption:'🛡️ Anti-view-once'})
        else if(type==='videoMessage') await send(jid,{video:b,caption:'🛡️ Anti-view-once'})
        else if(type==='audioMessage') await send(jid,{audio:b,mimetype:content[type]?.mimetype||'audio/mpeg'})
      }
    } catch(e) { logger.warn({err:e},'anti view-once failed') }
  }

  const sender = m.key.participant || m.key.remoteJid
  const spamCheck = spamFilter.shouldBlock(sender, jid, text, isOwner(sender), isGroup(jid))
  if (spamCheck.blocked) {
    if (!m.key.fromMe) await send(jid, { text: spamCheck.reason })
    return
  }

  await autoReply(m)
  await processCommand(m)
}

async function startSession(session) {
  if (session.sock) return session
  session.startedAt = Date.now()
  const {state,saveCreds}=await useMultiFileAuthState(session.authDir)
  const s=makeWASocket({
    auth:state,
    browser:Browsers.macOS('Chrome'),
    printQRInTerminal:false,
    syncFullHistory:false,
    markOnlineOnConnect:true,
    logger:pino({level:'silent'})
  })
  session.sock=s
  session.paired=!!state.creds.registered
  sessions.set(session.id,session)
  saveSessionRegistry()

  s.ev.on('creds.update',saveCreds)
  let pairingCodeRequested=false
  s.ev.on('connection.update',async ({connection,lastDisconnect,qr})=>{
    await runInSession(session, async()=>{
      if(qr && session.pairingNumber && !state.creds.registered && !pairingCodeRequested) {
        pairingCodeRequested=true
        try {
          const code=await s.requestPairingCode(session.pairingNumber)
          const formatted=String(code).replace(/(.{4})(?=.)/g,'$1-')
          const text=`╔══════════════════════════════════════╗\n║       ⚡ VOYAGE-MD PAIRING           ║\n╠══════════════════════════════════════╣\n║          ${formatted.padEnd(8)}              ║\n║                                      ║\n║ WhatsApp → Linked devices →          ║\n║ Link a device → Link with phone      ║\n║ number instead → enter this code.    ║\n╚══════════════════════════════════════╝`
          console.log(`\n[VOYAGE-MD] Pairing ${session.number}: ${formatted}\n`)
          if(session.pairController?.sock && session.pairRequester) {
            await session.pairController.sock.sendMessage(session.pairRequester,{text})
          }
        } catch(e) {
          pairingCodeRequested=false
          console.error(`[VOYAGE-MD] Pairing-code request failed for ${session.number}:`,e?.message || e)
          if(session.pairController?.sock && session.pairRequester) {
            await session.pairController.sock.sendMessage(session.pairRequester,{text:'❌ Pairing code could not be generated. Please try /pair again or use QR login.'}).catch(()=>{})
          }
          qrcode.generate(qr,{small:true})
        }
      } else if(qr && !session.pairingNumber) {
        qrcode.generate(qr,{small:true})
      }
      if(connection==='open') {
        const requester = session.pairRequester
        const controller = session.pairController
        session.paired=true
        saveSessionRegistry()
        console.log(`⚡ VOYAGE-MD session connected: ${session.number}`)
        console.log(`📌 Prefix: ${session.settings.prefix || config.prefix}`)
        if(controller?.sock && requester) await controller.sock.sendMessage(requester,{text:'✅ VOYAGE-MD paired successfully. Your personal bot is now online. Your settings and data are isolated from other users.'}).catch(()=>{})
        session.pairingNumber=''
        session.pairRequester=''
        session.pairController=null
        saveSessionRegistry()
      }
      if(connection==='close') {
        session.sock=null
        const code=new Boom(lastDisconnect?.error)?.output?.statusCode
        const should=code!==DisconnectReason.loggedOut
        console.log(`Session ${session.number} closed (${code}). Reconnect: ${should}`)
        if(should) setTimeout(()=>startSession(session).catch(e=>logger.error({err:e,session:session.number},'session reconnect failed')),5000)
      }
    })
  })
  s.ev.on('messages.upsert',async ({messages,type})=>{
    if(type!=='notify') return
    await runInSession(session,async()=>{ for(const m of messages) await handleIncoming(m).catch(e=>logger.error({err:e},'message handler failed')) })
  })
  s.ev.on('messages.update',async updates=>{
    await runInSession(session,async()=>{ for(const u of updates) await handleDeleted(u).catch(e=>logger.warn({err:e},'delete handler failed')) })
  })
  s.ev.on('group-participants.update', async ({id,participants,action})=>{
    await runInSession(session,async()=>{
      try {
        if(action==='add' && settings.welcome) {
          const names=participants.map(x=>`@${normalizeNumber(x)}`).join(' ')
          await send(id,{text:(settings.welcomeText||'👋 Welcome to the group, {users}!').replace('{users}',names),mentions:participants})
        }
        if(action==='remove' && settings.goodbye) {
          const names=participants.map(x=>`@${normalizeNumber(x)}`).join(' ')
          await send(id,{text:(settings.goodbyeText||'👋 Goodbye {users}!').replace('{users}',names),mentions:participants})
        }
      } catch(e) { logger.warn({err:e},'welcome/goodbye failed') }
    })
  })
  s.ev.on('call', async calls=>{
    await runInSession(session,async()=>{
      if(!settings.antiCall) return
      for(const c of calls){
        try { if(c?.id && c?.from && typeof sock.rejectCall==='function') await sock.rejectCall(c.id,c.from) } catch(e) { logger.warn({err:e},'call reject failed') }
        if(c?.from) await send(c.from,{text:settings.antiCallMsg || '🚫 Calls are not accepted. Please send a message.'}).catch(()=>{})
      }
    })
  })
  return session
}

async function bootAll() {
  const registry=loadSessionRegistry()
  let masterNumber=config.ownerNumber
  let master=sessions.get('master') || createSession(masterNumber,{id:'master',ownerNumber:masterNumber})
  master.id='master'; master.number=masterNumber; master.ownerNumber=masterNumber
  master.authDir=config.authDir
  master.dataDir=config.dataDir
  master.antiDeleteDir=config.antiDeleteDir
  master.cacheIndex=config.cacheIndex
  master.settingsFile=config.settingsFile
  master.deletedFile=config.deletedFile
  master.settings={...master.settings,...loadSettings()}
  sessions.set('master',master)
  for(const item of registry) {
    if(item.id==='master' || item.number===masterNumber) continue
    try {
      const session=sessions.get(item.id) || createSession(item.number,{id:item.id,ownerNumber:item.ownerNumber || item.number})
      await startSession(session)
    } catch(e) { logger.error({err:e,session:item.number},'failed to start saved session') }
  }
  await startSession(master)
  saveSessionRegistry()
}

bootAll().catch(console.error)
