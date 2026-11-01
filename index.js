import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Logger setup (silent for clean output)
const logger = pino({ level: 'silent' });

const PORT = process.env.PORT || 3000;
let botStatus = 'Initializing';
let currentQrDataUrl = null;
let currentRawQr = null;
let sock = null;
let isStarting = false;

// Helper: Clear auth session folder
function clearAuthSession() {
  const authDir = './auth_info';
  if (fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
      console.log('🧹 Cleared auth_info directory.');
    } catch (err) {
      console.error('Error clearing auth directory:', err.message);
    }
  }
}

// HTTP Server: Serves Web UI, Pairing Code API, and Health Checks
http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. Health check endpoint
  if (pathname === '/health' || pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      bot: botStatus,
      hasQr: !!currentQrDataUrl,
      timestamp: new Date().toISOString(),
    }));
  }

  // 2. Pairing Code API: /api/pair?phone=919876543210
  if (pathname === '/api/pair') {
    const phone = urlObj.searchParams.get('phone');
    if (!phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Please provide a phone number with country code (e.g. 919876543210).' }));
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid phone number length. Include country code without "+".' }));
    }

    if (!sock) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bot is still initializing. Please try again in 5 seconds.' }));
    }

    try {
      console.log(`\n🔑 Requesting pairing code for +${cleanPhone}...`);
      const code = await sock.requestPairingCode(cleanPhone);
      console.log(`   ➡️ Pairing code generated: ${code}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, code }));
    } catch (err) {
      console.error('Failed to request pairing code:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message || 'Failed to generate pairing code' }));
    }
  }

  // 3. Reset Session API: /api/reset
  if (pathname === '/api/reset') {
    console.log('🔄 Resetting session on user request...');
    clearAuthSession();
    currentQrDataUrl = null;
    currentRawQr = null;
    botStatus = 'Resetting';
    if (sock) {
      try { sock.end(); } catch (_) {}
      sock = null;
    }
    setTimeout(() => startWhatsAppBot(), 1500);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, message: 'Session reset. Restarting bot in 2 seconds.' }));
  }

  // 4. HTML Web UI
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
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b1329; color: #f8fafc; }
          .card { background: #16203c; padding: 2.5rem; border-radius: 1.25rem; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center; max-width: 440px; width: 90%; border: 1px solid #1e293b; }
          .badge { display: inline-block; background: #10b981; color: white; padding: 0.5rem 1.2rem; border-radius: 9999px; font-weight: bold; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.6rem; color: #38bdf8; }
          p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
          .btn-reset { margin-top: 1.5rem; background: #ef4444; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
          .btn-reset:hover { background: #dc2626; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Active & Ready ✅</div>
          <h1>WhatsApp Connected!</h1>
          <p>Your WhatsApp automation is connected and running 24/7 on the cloud.</p>
          <button class="btn-reset" onclick="resetSession()">Unlink & Reset Session</button>
        </div>
        <script>
          function resetSession() {
            if (confirm('Are you sure you want to unlink and reset?')) {
              fetch('/api/reset').then(() => alert('Session reset. Page will reload in 3 seconds.')).then(() => setTimeout(() => location.reload(), 3000));
            }
          }
        </script>
      </body>
      </html>
    `);
  }

  // Not connected yet: Provide both Pairing Code (Primary) and QR Code
  return res.end(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Link WhatsApp - Antigravity</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b1329; color: #f8fafc; }
        .card { background: #16203c; padding: 2rem; border-radius: 1.25rem; box-shadow: 0 20px 40px rgba(0,0,0,0.5); text-align: center; max-width: 450px; width: 92%; border: 1px solid #1e293b; }
        h1 { margin: 0 0 0.4rem 0; font-size: 1.5rem; color: #38bdf8; }
        p.subtitle { color: #94a3b8; font-size: 0.9rem; margin-top: 0; margin-bottom: 1.5rem; }
        .tabs { display: flex; border-bottom: 1px solid #334155; margin-bottom: 1.5rem; }
        .tab { flex: 1; padding: 0.75rem 0.5rem; cursor: pointer; color: #94a3b8; font-weight: 600; font-size: 0.9rem; border-bottom: 2px solid transparent; }
        .tab.active { color: #38bdf8; border-color: #38bdf8; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .input-group { display: flex; gap: 0.5rem; margin: 1.2rem 0; }
        input[type="text"] { flex: 1; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #334155; background: #0b1329; color: #fff; font-size: 1rem; outline: none; }
        input[type="text"]:focus { border-color: #38bdf8; }
        button.btn-primary { background: #0284c7; color: white; border: none; padding: 0.75rem 1.2rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; }
        button.btn-primary:hover { background: #0369a1; }
        .code-display { font-size: 2rem; font-weight: bold; letter-spacing: 4px; color: #34d399; background: #0b1329; padding: 1rem; border-radius: 0.75rem; margin: 1.2rem 0; border: 1px dashed #059669; }
        .instructions { text-align: left; background: #0b1329; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; font-size: 0.85rem; color: #cbd5e1; }
        .instructions ol { margin: 0; padding-left: 1.2rem; }
        .instructions li { margin-bottom: 0.35rem; }
        .qr-box { background: white; padding: 1rem; border-radius: 0.75rem; display: inline-block; margin: 1rem 0; }
        .qr-box img { display: block; width: 240px; height: 240px; }
        .footer-links { margin-top: 1.5rem; font-size: 0.8rem; color: #64748b; }
        .footer-links a { color: #f87171; text-decoration: none; cursor: pointer; }
        .footer-links a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Link WhatsApp</h1>
        <p class="subtitle">Connect your account to Antigravity Automation</p>

        <div class="tabs">
          <div class="tab active" onclick="switchTab('phone')">📱 Pairing Code (Recommended)</div>
          <div class="tab" onclick="switchTab('qr')">📷 QR Code</div>
        </div>

        <!-- TAB 1: PHONE NUMBER PAIRING (NO SCAN NEEDED) -->
        <div id="tab-phone" class="tab-content active">
          <p style="font-size: 0.9rem; color: #94a3b8; margin: 0;">Enter your WhatsApp number with country code (No + or spaces):</p>
          <div class="input-group">
            <input type="text" id="phoneInput" placeholder="e.g. 919876543210" />
            <button class="btn-primary" onclick="generateCode()">Get Code</button>
          </div>
          <div id="codeArea" style="display: none;">
            <p style="margin: 0; font-size: 0.85rem; color: #94a3b8;">Enter this 8-digit code in your WhatsApp app:</p>
            <div class="code-display" id="codeText">----</div>
          </div>
          <div class="instructions">
            <strong>How to enter the code:</strong>
            <ol>
              <li>Open <b>WhatsApp</b> on your phone</li>
              <li>Go to <b>Settings ➜ Linked Devices ➜ Link a Device</b></li>
              <li>At the bottom, tap <b>"Link with phone number instead"</b> (फ़ोन नंबर से लिंक करें)</li>
              <li>Type the code shown above. Done!</li>
            </ol>
          </div>
        </div>

        <!-- TAB 2: QR CODE SCANNER -->
        <div id="tab-qr" class="tab-content">
          ${
            currentQrDataUrl
              ? `<div class="qr-box"><img src="${currentQrDataUrl}" alt="WhatsApp QR Code" /></div>`
              : `<p style="padding: 2rem 0; color: #94a3b8;">Generating fresh QR code, please wait a moment...</p>`
          }
          <div class="instructions">
            <strong>How to scan:</strong>
            <ol>
              <li>Open <b>WhatsApp</b> on your phone</li>
              <li>Go to <b>Settings ➜ Linked Devices</b></li>
              <li>Tap <b>Link a Device</b> & scan this QR code</li>
            </ol>
          </div>
        </div>

        <div class="footer-links">
          Facing errors? <a onclick="resetSession()">Click here to Reset Session</a>
        </div>
      </div>

      <script>
        function switchTab(type) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          if (type === 'phone') {
            document.querySelectorAll('.tab')[0].classList.add('active');
            document.getElementById('tab-phone').classList.add('active');
          } else {
            document.querySelectorAll('.tab')[1].classList.add('active');
            document.getElementById('tab-qr').classList.add('active');
          }
        }

        async function generateCode() {
          const phone = document.getElementById('phoneInput').value.trim();
          if (!phone) return alert('Please enter your WhatsApp number (e.g. 919876543210).');
          const btn = document.querySelector('.btn-primary');
          btn.disabled = true;
          btn.innerText = 'Generating...';

          try {
            const res = await fetch('/api/pair?phone=' + encodeURIComponent(phone));
            const data = await res.json();
            if (data.code) {
              const formatted = data.code.match(/.{1,4}/g)?.join('-') || data.code;
              document.getElementById('codeText').innerText = formatted;
              document.getElementById('codeArea').style.display = 'block';
            } else {
              alert('Error: ' + (data.error || 'Could not generate code'));
            }
          } catch (e) {
            alert('Failed to connect to server: ' + e.message);
          } finally {
            btn.disabled = false;
            btn.innerText = 'Get Code';
          }
        }

        async function resetSession() {
          if (confirm('Clear current session and restart?')) {
            await fetch('/api/reset');
            alert('Session reset! Reloading in 3 seconds...');
            setTimeout(() => location.reload(), 3000);
          }
        }

        // Auto-check connection status every 4 seconds
        setInterval(async () => {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.bot === 'Connected') {
              location.reload();
            }
          } catch (_) {}
        }, 4000);
      </script>
    </body>
    </html>
  `);
}).listen(PORT, () => {
  console.log(`🌐 Server active on port ${PORT}`);
});

async function startWhatsAppBot() {
  if (isStarting) return;
  isStarting = true;

  console.log('\n========================================');
  console.log('🤖 WhatsApp Automation Bot Starting...');
  console.log('========================================\n');

  try {
    // 1. Fetch the exact latest version required by WhatsApp Web servers
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📡 Using WhatsApp Web Protocol v${version.join('.')}, isLatest: ${isLatest}`);

    // 2. Load auth credentials
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    sock = makeWASocket({
      version,
      auth: state,
      logger: logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'), // Ubuntu Chrome header prevents WhatsApp handshake block
      syncFullHistory: false, // Prevents memory spikes and timeout on cloud
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      emitOwnEvents: true,
      retryRequestDelayMs: 250,
    });

    // Save session credentials
    sock.ev.on('creds.update', saveCreds);

    // Handle connection events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentRawQr = qr;
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { scale: 8, margin: 2 });
        } catch (err) {
          console.error('Failed to create QR DataURL:', err.message);
        }
        qrcodeTerminal.generate(qr, { small: true });
      }

      if (connection === 'close') {
        botStatus = 'Disconnected';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log('\n⚠️ Connection closed:', lastDisconnect?.error?.message || 'unknown error', `(code ${statusCode})`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('❌ Device logged out. Clearing session files...');
          clearAuthSession();
          currentQrDataUrl = null;
        }

        if (shouldReconnect) {
          console.log('🔄 Reconnecting in 3 seconds...');
          isStarting = false;
          setTimeout(() => startWhatsAppBot(), 3000);
        } else {
          isStarting = false;
        }
      } else if (connection === 'open') {
        botStatus = 'Connected';
        currentQrDataUrl = null;
        isStarting = false;
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

        // Auto-reply rules
        if (text.trim().toLowerCase() === '!ping') {
          await sock.sendMessage(from, { text: 'pong! 🏓 (Automated reply from Antigravity Bot)' }, { quoted: msg });
        } else if (text.trim().toLowerCase() === '!info') {
          const infoMsg = `🤖 *WhatsApp Automation Bot*\nStatus: Active ✅\nTime: ${new Date().toLocaleString()}\nPowered by Antigravity`;
          await sock.sendMessage(from, { text: infoMsg }, { quoted: msg });
        } else if (text.trim().toLowerCase().startsWith('!echo ')) {
          const echoText = text.slice(6);
          await sock.sendMessage(from, { text: `📢 ${echoText}` }, { quoted: msg });
        }
      }
    });
  } catch (err) {
    isStarting = false;
    console.error('Error starting WhatsApp bot:', err);
    setTimeout(() => startWhatsAppBot(), 5000);
  }
}

startWhatsAppBot();
