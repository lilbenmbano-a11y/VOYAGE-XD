# VOYAGE-MD V6.0.0 — Command Reference

All command names are English. Default prefix: `/`

## 🏠 Main
`/menu` `/ping` `/alive` `/owner` `/status` `/getdp` `/botdp` `/ik` `/pair` `/mysession` `/sessions` `/logout` `/vv` `/vw` `/vw2` `/vw3` `/delete` `/del` `/forward` `/leave` `/out` `/hidetag` `/tag` `/block` `/unblock` `/follow` `/unfollow` `/fullpp` `/setppall`

## ⚙️ Settings
`/settings` `/prefix` `/setprefix` `/botname` `/setname` `/ownername` `/ownernumber` `/description` `/stickername` `/delpath` `/mode` `/online` `/setonline` `/autoread` `/autotyping` `/recording` `/autorecording` `/mentionreply` `/reactemojis` `/owneremojis` `/checkupdate` `/update` `/sudo` `/delsudo` `/listsudo`

## 🖼️ Media Center
`/fb` `/tiktok` `/gimage` `/statusview` `/statusemoji` `/statuslike` `/chreact`

## 🎧 Audio Lab
`/play` `/ytplay` `/soundcloud`

## 🧠 Intelligence Core
`/ai` `/autoreply` `/define` `/yts` `/weather` `/getbio`

## 👥 Group Management
`/tagall` `/everyone` `/kick` `/promote` `/demote` `/add` `/mute` `/unmute` `/link` `/revoke` `/ginfo` `/gcpp` `/updategname` `/updategdesc` `/poll` `/newgc` `/join` `/invite` `/requests` `/acceptall` `/rejectall` `/accept` `/reject` `/gcstatus` `/gcstatus2` `/end`

## 🛡️ Security & Automation
`/antilink` `/antidelete` `/antiviewonce` `/antistatus` `/anticall` `/anticallmsg` `/adminaction` `/autoreact` `/welcome` `/goodbye` `/setwelcome` `/setgoodbye`

## 🎮 Fun & Games
`/smile` `/blush` `/kiss` `/animegirl4` `/animegirl5` `/dog`

## ✨ Text & Creative
`/txt` `/effects`

## 🔧 Utility Tools
`/privacy` `/blocklist` `/updatebio` `/groupsprivacy` `/getprivacy`

## Notes
- Group administration commands require the sender to be a group admin/owner and the bot to be an admin where WhatsApp requires it.
- `/antilink` deletes detected links when the bot has admin permissions.
- `/antidelete` stores cached media under `data/antidelete/` and indexes messages in `data/cache-index.json`.
- `/menu` sends the VOYAGE-MD menu image as the menu artwork.
- `/follow` and `/unfollow` are included for compatibility with the reference command list, but Baileys 6.7.24 does not expose a stable public API for those operations.
