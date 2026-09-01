# SCOTTY BOT V6.0.0 — Multi-User Baileys / Pterodactyl

## Multi-user pairing

The master SCOTTY session can provision personal bot sessions. A user should send `.pair <their own WhatsApp number>` to the master bot in a private chat. The target number must match the requesting WhatsApp account unless the master owner is provisioning another user.

Example:

```text
.pair 263788123456
```

The bot creates an isolated session under `data/users/263788123456/`, generates a pairing code, and sends that code back to the requester. The user completes pairing in WhatsApp: **Settings → Linked devices → Link a device → Link with phone number instead**.

Each paired account has its own:

- Baileys auth state
- settings.json
- anti-delete cache
- deleted-message index
- group cache/runtime
- owner number
- prefix/bot name/settings

Changing `.autoread`, `.antilink`, `.prefix`, `.autoreply`, etc. on one paired bot does not change another user's bot.

Useful session commands:

- `.pair <number>` — create a personal session
- `.mysession` — show the current session
- `.sessions` — show registered sessions (owner access)
- `.logout` — log out the current personal session

## Pterodactyl

1. Upload and extract the ZIP.
2. Use Node.js 20 or newer.
3. Run `npm install`.
4. Start with `npm start`.
5. Keep the server storage persistent.

The original master account continues using the legacy `auth/` directory so an existing SCOTTY installation does not need to be paired again. New users are stored under `data/users/<number>/`.

## Security

`.pair` is intentionally limited to private chats. A normal user can only request a session for their own number; this prevents one WhatsApp user from provisioning a session for an unrelated number. The master owner can provision other users.

## Important

WhatsApp/Baileys pairing is subject to WhatsApp-side changes. If a pairing code is rejected, QR login remains the fallback for the master/session deployment.
