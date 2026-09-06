// ─── UPDATE SYSTEM IMPORT ───
import {
  getGitInfo,
  checkRemote,
  gitPull,
  restartProcess
} from './lib/updater.js';


// ─── LOGOUT ───
if (cmd === 'logout') {
  if (!isOwner(m.key.participant || jid)) {
    return send(jid, { text: '❌ Owner only.' });
  }

  if (currentSession().id === 'master') {
    return send(jid, {
      text: '❌ The master session cannot be logged out with this command.'
    });
  }

  try {
    await sock.logout();
  } catch {}

  sessions.delete(currentSession().id);
  saveSessionRegistry();

  return send(jid, {
    text: '✅ Your VOYAGE-MD session has been logged out. Pair again when needed.'
  });
}


// ─── UPDATE SYSTEM (OWNER ONLY) ───
if (cmd === 'checkupdate') {
  if (!isOwner(m.key.participant || jid)) {
    return send(jid, { text: '❌ Owner only.' });
  }

  const info = getGitInfo();
  const remote = checkRemote();

  let txt = `╭━━━〔 🔄 UPDATE CHECK 〕━━━╮\n┃\n`;

  if (info.ok) {
    txt += `┃ 📌 Commit: ${info.hash}\n`;
    txt += `┃ 🌿 Branch: ${info.branch}\n`;
    txt += `┃ 📝 ${info.msg}\n`;
    txt += `┃ 👤 ${info.author}\n`;
    txt += `┃ 📅 ${info.date}\n┃\n`;
  } else {
    txt += `┃ ⚠️ Git info unavailable\n┃\n`;
  }

  if (remote.ok) {
    if (remote.behind) {
      txt += `┃ 🔴 ${remote.count} update(s) behind\n`;
      txt += `┃ 📥 Run ${getPrefix()}update to pull\n`;
    } else {
      txt += `┃ 🟢 Already up to date\n`;
    }
  } else {
    txt += `┃ ⚠️ Remote check failed\n`;
    txt += `┃ ${remote.error}\n`;
  }

  txt += `┃\n╰━━━━━━━━━━━━━━━━━━━━━━╯`;

  return send(jid, { text: txt });
}


// ─── UPDATE ───
if (cmd === 'update') {
  if (!isOwner(m.key.participant || jid)) {
    return send(jid, { text: '❌ Owner only.' });
  }

  await send(jid, {
    text:
      '🔄 *Updating VOYAGE-MD...*\n' +
      '⬇️ Pulling latest code from origin...'
  });

  const result = gitPull();

  if (!result.ok) {
    return send(jid, {
      text: `❌ *Update Failed*\n\n\`\`\`\n${result.error}\n\`\`\``
    });
  }

  await send(jid, {
    text:
      `✅ *Update Successful*\n\n` +
      `\`\`\`\n${result.output}\n\`\`\`\n\n` +
      `🔄 Restarting now... All sessions will reconnect automatically.`
  });

  setTimeout(() => restartProcess(), 2000);

  return;
}


// ─── PRIVATE MODE ───
if (
  (settings.mode || config.mode) === 'private' &&
  !isPrivileged(m.key.participant || jid)
) {
  return;
}
