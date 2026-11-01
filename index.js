import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import http from 'http';

// Logger setup (silent for clean terminal UI)
const logger = pino({ level: 'silent' });

// Global state
const PORT = process.env.PORT || 3000;
let botStatus = 'Initializing';
let currentQrDataUrl = null;
let lastQrTimestamp = null;

// HTTP Server: Serves an HTML page with the QR Code and Health check
http.createServer(async (req, res) => {
  // JSON Health check endpoint
  if (req.url === '/health' || req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      bot: botStatus,
      hasQr: !!currentQrDataUrl,
      timestamp: new Date().toISOString()
    }));
  }

  // HTML Web Page for easy scanning on any screen
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  
  if (botStatus === 'Connected') {
    return res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot - Connected</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 420px; width: 90%; }
          .badge { display: inline-block; background: #10b981; color: white; padding: 0.5rem 1.2rem; border-radius: 9999px; font-weight: bold; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Connected ✅</div>
          <h1>WhatsApp Connected!</h1>
          <p>Your WhatsApp automation bot is running 24/7 on Render.</p>
          <p style="margin-top: 1.5rem; font-size: 0.85rem; color: #64748b;">Antigravity WhatsApp Automation</p>
        </div>
      </body>
      </html>
    `);
  }

  // If QR code is available, show the QR image
  if (currentQrDataUrl) {
    return res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="5">
        <title>Scan WhatsApp QR Code</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 420px; width: 90%; }
          .qr-box { background: white; padding: 1rem; border-radius: 0.75rem; display: inline-block; margin: 1.2rem 0; }
          .qr-box img { display: block; width: 260px; height: 260px; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.4rem; color: #38bdf8; }
          p { color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; margin: 0.4rem 0; }
          .steps { text-align: left; background: #0f172a; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; font-size: 0.85rem; color: #94a3b8; }
          .steps ol { margin: 0; padding-left: 1.2rem; }
          .steps li { margin-bottom: 0.3rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>📲 Scan WhatsApp QR</h1>
          <p>Scan this QR code with your WhatsApp app:</p>
          <div class="qr-box">
            <img src="${currentQrDataUrl}" alt="WhatsApp QR Code" />
          </div>
          <div class="steps">
            <strong>How to scan:</strong>
            <ol>
              <li>Open WhatsApp on your phone</li>
              <li>Tap <b>Settings</b> / Menu ➜ <b>Linked Devices</b></li>
              <li>Tap <b>Link a Device</b> & scan this screen</li>
            </ol>
          </div>
          <p style="font-size: 0.75rem; color: #64748b; margin-top: 1rem;">Page auto-refreshes every 5 seconds</p>
        </div>
      </body>
      </html>
    `);
  }

  // Fallback: Connecting / Waiting for QR
  return res.end(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="3">
      <title>Loading WhatsApp QR...</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
        .spinner { border: 4px solid rgba(255,255,255,0.1); border-left-color: #38bdf8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1rem auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div>
        <div class="spinner"></div>
        <h2>Starting WhatsApp Session...</h2>
        <p style="color: #94a3b8;">Generating QR code, please wait a moment.</p>
      </div>
    </body>
    </html>
  `);
}).listen(PORT, () => {
  console.log(`🌐 Web interface and health check running on port ${PORT}`);
});

async function startWhatsAppBot() {
  console.log('\n========================================');
  console.log('🤖 WhatsApp Automation Bot Starting...');
  console.log('========================================\n');

  // Load or create authentication credentials
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: logger,
    printQRInTerminal: false,
  });

  // Save session credentials on updates
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📲 QR Code received! Generating visual QR for web...');
      try {
        currentQrDataUrl = await QRCode.toDataURL(qr, { scale: 8, margin: 2 });
        lastQrTimestamp = Date.now();
      } catch (err) {
        console.error('Failed to generate QR data URL:', err);
      }
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      botStatus = 'Disconnected';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('\n⚠️ Connection closed due to:', lastDisconnect?.error?.message || 'unknown error');

      if (shouldReconnect) {
        console.log('🔄 Reconnecting in 3 seconds...');
        setTimeout(() => startWhatsAppBot(), 3000);
      } else {
        currentQrDataUrl = null;
        console.log('❌ Logged out. Delete the ./auth_info folder to scan QR again.');
      }
    } else if (connection === 'open') {
      botStatus = 'Connected';
      currentQrDataUrl = null;
      console.log('\n✅ WhatsApp connected successfully!');
      console.log('🎉 Automation is now active.\n');
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      const pushName = msg.pushName || 'Unknown';
      console.log(`📩 [${new Date().toLocaleTimeString()}] From: ${pushName} (${from}) | Text: "${text}"`);

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
