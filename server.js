// ═══════════════════════════════════════════════════════════
//  SPIDER VOYAGE MD — UNIFIED SERVER
//  Bot + Web Dashboard + Web Pairing
//  DEV: BEN MAPS / LORD VOYAGE
// ═══════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  downloadMediaMessage,
  jidNormalizedUser,
  getContentType
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from './config.js';
import {
  sessionContext, sessions, createSession, saveSessionRegistry,
  loadSessionRegistry, saveSessionSettings, currentSession, runInSession
} from './multi-session.js';
import { ensureStorage, readJSON, writeJSON, loadSettings } from './lib/storage.js';
import {
  extractText, isGroup, normalizeNumber, unwrapMessageContent,
  mediaType, extensionFor, formatUptime, getQuotedMessage,
  getTargetJid, hasUrl, mentionJid
} from './lib/utils.js';
import { menu, ownerCard } from './menu.js';
import { ai, apiGet, downloader, unwrapApiMedia } from './lib/api.js';
import { spamFilter } from './lib/antispam.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

ensureStorage();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ═══════════════════════════════════════════════════════════
//  PENDING WEB PAIRING REQUESTS
// ═══════════════════════════════════════════════════════════
const pendingPairings = new Map(); // phone -> { resolve, reject, timeout }

// ═══════════════════════════════════════════════════════════
//  EXPRESS WEB SERVER
// ═══════════════════════════════════════════════════════════
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── POST /pair ───
app.post('/pair', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');

  if (!phone || phone.length < 7) {
    return res.json({ success: false, error: 'Invalid number format. Enter a valid international number.' });
  }

  const existing = [...sessions.values()].find(s => s.number === phone);
  if (existing && existing.paired) {
    return res.json({ success: false, error: 'A session for this number already exists and is connected.' });
  }

  try {
    const session = existing || createSession(phone, { ownerNumber: phone });
    session.pairingNumber = phone;
    session.paired = false;
    saveSessionRegistry();

    const pairingPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingPairings.delete(phone);
        reject(new Error('Pairing timeout — code was not generated within 60 seconds.'));
      }, 60000);
      pendingPairings.set(phone, { resolve, reject, timeout });
    });

    await startSession(session);
    const result = await pairingPromise;
    res.json(result);

  } catch (e) {
    logger.error({ err: e, phone }, 'web pairing failed');
    res.json({ success: false, error: e.message || 'Pairing failed. Please try again.' });
  }
});

// ───
