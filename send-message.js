import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

// Usage: node send-message.js <country_code_and_number> "<message>"
// Example: node send-message.js 919876543210 "Hello! This is an automated message."

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('\n❌ Usage: node send-message.js <phone_number_with_country_code> "<message>"');
  console.log('   Example: node send-message.js 919876543210 "Hello from Antigravity!"\n');
  process.exit(1);
}

const rawNumber = args[0].replace(/[^0-9]/g, '');
const messageText = args.slice(1).join(' ');
const recipientJid = `${rawNumber}@s.whatsapp.net`;

async function sendMessage() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n⚠️ WhatsApp session not logged in yet.');
      console.log('   Please run "npm start" first and scan the QR code to log in.\n');
      process.exit(1);
    }

    if (connection === 'open') {
      console.log(`\n📤 Sending message to +${rawNumber}...`);
      try {
        await sock.sendMessage(recipientJid, { text: messageText });
        console.log(`✅ Message successfully delivered to +${rawNumber}!\n`);
      } catch (err) {
        console.error('❌ Failed to send message:', err.message);
      } finally {
        // Wait a second for network packet flush then close gracefully
        setTimeout(() => {
          sock.end();
          process.exit(0);
        }, 1500);
      }
    } else if (connection === 'close') {
      const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      if (isLoggedOut) {
        console.log('❌ Session logged out. Please re-run "npm start" to scan QR code.');
        process.exit(1);
      }
    }
  });
}

sendMessage().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
