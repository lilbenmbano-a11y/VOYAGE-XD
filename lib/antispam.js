// ═══════════════════════════════════════════════════════════
//  VOYAGE-MD ANTI-SPAM SYSTEM
//  Prevents abuse, bulk messaging, and command flooding
// ═══════════════════════════════════════════════════════════

class SpamFilter {
  constructor() {
    this.userCooldowns = new Map();       // userJid -> lastCommandTime
    this.userMessageCounts = new Map();   // userJid -> { count, windowStart }
    this.chatMessageCounts = new Map();   // chatJid -> { count, windowStart }
    this.bulkTrackers = new Map();        // userJid -> [{ time, len }, ...]
    this.blockedUsers = new Map();        // userJid -> unblockTime
    this.warnedUsers = new Map();         // userJid -> warnCount
    this.outgoingCounts = new Map();      // chatJid -> { count, windowStart }
  }

  _now() { return Date.now(); }

  _isBlocked(userJid) {
    const unblockAt = this.blockedUsers.get(userJid);
    if (!unblockAt) return false;
    if (this._now() >= unblockAt) {
      this.blockedUsers.delete(userJid);
      return false;
    }
    return true;
  }

  isOnCooldown(userJid, cooldownMs = 3000) {
    const last = this.userCooldowns.get(userJid);
    if (last && this._now() - last < cooldownMs) return true;
    this.userCooldowns.set(userJid, this._now());
    return false;
  }

  checkUserRate(userJid, maxPerMin = 20) {
    const now = this._now();
    let data = this.userMessageCounts.get(userJid);
    if (!data || now - data.windowStart > 60000) {
      data = { count: 1, windowStart: now };
    } else {
      data.count++;
    }
    this.userMessageCounts.set(userJid, data);
    return data.count <= maxPerMin;
  }

  checkChatRate(chatJid, maxPerMin = 30) {
    const now = this._now();
    let data = this.chatMessageCounts.get(chatJid);
    if (!data || now - data.windowStart > 60000) {
      data = { count: 1, windowStart: now };
    } else {
      data.count++;
    }
    this.chatMessageCounts.set(chatJid, data);
    return data.count <= maxPerMin;
  }

  isBulkSpam(userJid, text = '', windowMs = 10000, maxMsgs = 10) {
    const now = this._now();
    let history = this.bulkTrackers.get(userJid) || [];
    history = history.filter(t => now - t.time < windowMs);
    history.push({ time: now, len: text.length });
    this.bulkTrackers.set(userJid, history);
    return history.length > maxMsgs;
  }

  checkLength(text = '', maxLen = 5000) {
    return (text || '').length <= maxLen;
  }

  shouldBlock(userJid, chatJid, text = '', isOwner = false, isGroup = false) {
    if (isOwner) return { blocked: false };

    // Check if currently blocked
    if (this._isBlocked(userJid)) {
      return { blocked: true, reason: '🚫 You are temporarily blocked for spamming. Wait 60 seconds.' };
    }

    // Check message length
    if (!this.checkLength(text)) {
      this._warnOrBlock(userJid);
      return { blocked: true, reason: '⚠️ Message too long. Max 5000 characters allowed.' };
    }

    // Check bulk spam (rapid fire)
    if (this.isBulkSpam(userJid, text)) {
      this.blockedUsers.set(userJid, this._now() + 60000);
      return { blocked: true, reason: '🚫 Bulk messaging detected. You are blocked for 60 seconds.' };
    }

    // Check user rate
    if (!this.checkUserRate(userJid)) {
      this._warnOrBlock(userJid);
      return { blocked: true, reason: '⚠️ Too many messages. Slow down.' };
    }

    // Check chat rate (groups only)
    if (isGroup && !this.checkChatRate(chatJid)) {
      return { blocked: true, reason: '⚠️ This chat is being flooded. Slow down.' };
    }

    return { blocked: false };
  }

  checkCommandCooldown(userJid, cooldownMs = 3000, isOwner = false) {
    if (isOwner) return { blocked: false };
    if (this.isOnCooldown(userJid, cooldownMs)) {
      return { blocked: true, reason: '⏳ Command on cooldown. Wait a few seconds.' };
    }
    return { blocked: false };
  }

  _warnOrBlock(userJid) {
    const warns = (this.warnedUsers.get(userJid) || 0) + 1;
    this.warnedUsers.set(userJid, warns);
    if (warns >= 3) {
      this.blockedUsers.set(userJid, this._now() + 60000);
      this.warnedUsers.delete(userJid);
    }
  }

  // Limit bot from being used to spam others
  canSend(chatJid, maxPerMin = 50) {
    const now = this._now();
    let data = this.outgoingCounts.get(chatJid);
    if (!data || now - data.windowStart > 60000) {
      data = { count: 1, windowStart: now };
    } else {
      data.count++;
    }
    this.outgoingCounts.set(chatJid, data);
    return data.count <= maxPerMin;
  }

  getStatus(userJid) {
    const blocked = this._isBlocked(userJid);
    const warns = this.warnedUsers.get(userJid) || 0;
    const userData = this.userMessageCounts.get(userJid);
    return { blocked, warns, messagesThisMin: userData?.count || 0 };
  }
}

export const spamFilter = new SpamFilter();
