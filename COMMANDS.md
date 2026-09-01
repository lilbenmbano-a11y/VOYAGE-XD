# SCOTTY BOT V6.0.0 — Command Reference

All command names are English. Default prefix: `.`

## Main
`.menu` `.ping` `.alive` `.owner` `.status` `.getdp` `.botdp` `.ik` `.pair` `.vv` `.vw` `.vw2` `.vw3` `.delete` `.forward` `.leave` `.hidetag` `.block` `.unblock` `.follow` `.unfollow` `.fullpp`

## Settings
`.sudo` `.delsudo` `.listsudo` `.statusemoji` `.statuslike` `.welcome` `.goodbye` `.setwelcome` `.setgoodbye` `.autoread` `.antilink` `.antistatus` `.antidelete` `.recording` `.statusview` `.autoreact` `.anticall` `.anticallmsg` `.adminaction` `.autotyping` `.online` `.mode` `.prefix` `.botname` `.ownername` `.ownernumber` `.description` `.stickername` `.delpath` `.reactemojis` `.owneremojis` `.mentionreply` `.settings`

## Group
`.del` `.unmute` `.mute` `.tagall` `.kick` `.promote` `.demote` `.gcpp` `.revoke` `.link` `.ginfo` `.updategdesc` `.updategname` `.poll` `.out` `.newgc` `.end` `.join` `.invite` `.tag` `.acceptall` `.rejectall` `.requests` `.accept` `.reject` `.add` `.gcstatus2` `.gcstatus` `.everyone` `.chreact`

## Main / Search
`.define` `.yts` `.delete` `.forward` `.leave` `.hidetag` `.pair` `.follow` `.unfollow` `.status` `.fullpp`

## Privacy / Profile
`.privacy` `.blocklist` `.getbio` `.setppall` `.setonline` `.setname` `.updatebio` `.groupsprivacy` `.getprivacy`

## Fun / Tools
`.smile` `.blush` `.kiss` `.animegirl4` `.animegirl5` `.dog` `.txt` `.weather` `.gimage` `.effects`

## Downloaders / AI
`.play` `.soundcloud` `.fb` `.tiktok` `.ai` `.autoreply dm on/off` `.autoreply grp on/off`

## Notes
- Group administration commands require the sender to be a group admin/owner and the bot to be an admin where WhatsApp requires it.
- `.antilink` deletes detected links when the bot has admin permissions.
- `.antidelete` stores cached media under `data/antidelete/` and indexes messages in `data/cache-index.json`.
- `.menu` sends the SCOTTY WORLD image as the menu artwork.
- `.follow` and `.unfollow` are included for compatibility with the reference command list, but Baileys 6.7.24 does not expose a stable public API for those operations.
