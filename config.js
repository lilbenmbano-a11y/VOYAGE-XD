import 'dotenv/config'

export const config = {
  ownerNumber: process.env.OWNER_NUMBER || '263716454559',
  ownerName: process.env.OWNER_NAME || 'BEN MAPS / LORD VOYAGE',
  botName: process.env.BOT_NAME || 'VOYAGE-MD',
  prefix: process.env.PREFIX || '/',
  mode: process.env.MODE || 'public',
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  api: process.env.DREX_API || 'https://api.drextrash.online',
  dataDir: './data',
  authDir: './auth',
  antiDeleteDir: './data/antidelete',
  cacheIndex: './data/cache-index.json',
  settingsFile: './data/settings.json',
  deletedFile: './data/deleted.json',
  channel: 'https://whatsapp.com/channel/0029VbCuz94EwEjpo1O0aB0q',
  antiSpam: {
    enabled: true,
    commandCooldownMs: 3000,
    maxUserMessagesPerMin: 20,
    maxChatMessagesPerMin: 30,
    maxBulkMessages: 10,
    bulkWindowMs: 10000,
    maxMessageLength: 5000,
    blockDurationMs: 60000,
    maxOutgoingPerMinGroup: 40,
    maxOutgoingPerMinDM: 15
  }
}
