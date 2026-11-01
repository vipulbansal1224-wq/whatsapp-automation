import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import readline from 'readline';

// Logger setup (silent for clean terminal UI)
const logger = pino({ level: 'silent' });

async function startWhatsAppBot() {
  console.log('\n========================================');
  console.log('🤖 WhatsApp Automation Bot Starting...');
  console.log('========================================\n');

  // Load or create authentication credentials
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: logger,
    printQRInTerminal: false, // We use custom qrcode-terminal for clean output
  });

  // Save session credentials on updates
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📲 QR Code ready! Please scan with your WhatsApp:');
      console.log('   (WhatsApp Settings -> Linked Devices -> Link a Device)\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('\n⚠️ Connection closed due to:', lastDisconnect?.error?.message || 'unknown error');

      if (shouldReconnect) {
        console.log('🔄 Reconnecting in 3 seconds...');
        setTimeout(() => startWhatsAppBot(), 3000);
      } else {
        console.log('❌ Logged out. Delete the ./auth_info folder to scan QR again.');
      }
    } else if (connection === 'open') {
      console.log('\n✅ WhatsApp connected successfully!');
      console.log('🎉 Automation is now active.\n');
      console.log('Commands supported in chat:');
      console.log('  - "!ping" -> Replies with "pong! 🏓"');
      console.log('  - "!info" -> Replies with bot status and timestamp');
      console.log('  - "!echo <text>" -> Echoes back your text');
      console.log('----------------------------------------\n');
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      // Ignore broadcast messages or status updates
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      const pushName = msg.pushName || 'Unknown';

      // Log message
      console.log(`📩 [${new Date().toLocaleTimeString()}] From: ${pushName} (${from}) | Text: "${text}"`);

      // Avoid replying to messages sent by the bot itself (unless tested directly)
      if (isFromMe) continue;

      // Automated Rules / Responses:
      if (text.trim().toLowerCase() === '!ping') {
        await sock.sendMessage(from, { text: 'pong! 🏓 (Automated reply from Antigravity WhatsApp Bot)' }, { quoted: msg });
        console.log(`   ➡️ Sent automated reply "!pong" to ${from}`);
      } else if (text.trim().toLowerCase() === '!info') {
        const infoMsg = `🤖 *WhatsApp Automation Bot*\nStatus: Active ✅\nTime: ${new Date().toLocaleString()}\nPowered by Antigravity`;
        await sock.sendMessage(from, { text: infoMsg }, { quoted: msg });
        console.log(`   ➡️ Sent info to ${from}`);
      } else if (text.trim().toLowerCase().startsWith('!echo ')) {
        const echoText = text.slice(6);
        await sock.sendMessage(from, { text: `📢 ${echoText}` }, { quoted: msg });
      }
    }
  });

  return sock;
}

startWhatsAppBot().catch((err) => {
  console.error('Fatal error starting WhatsApp Bot:', err);
});
