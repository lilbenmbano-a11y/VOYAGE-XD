import 'dotenv/config'

export const config = {
  ownerNumber: process.env.OWNER_NUMBER || '263788114185',
  ownerName: process.env.OWNER_NAME || 'SCOTTY',
  botName: process.env.BOT_NAME || 'SCOTTY BOT',
  prefix: process.env.PREFIX || '.',
  mode: process.env.MODE || 'public',
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  api: process.env.DREX_API || 'https://api.drextrash.online',
  dataDir: './data',
  authDir: './auth',
  antiDeleteDir: './data/antidelete',
  cacheIndex: './data/cache-index.json',
  settingsFile: './data/settings.json',
  deletedFile: './data/deleted.json',
  channel: 'https://whatsapp.com/channel/0029VbCuz94EwEjpo1O0aB0q'
}
