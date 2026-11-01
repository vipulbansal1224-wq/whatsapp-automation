import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authPath = path.join(__dirname, 'auth_info');

let sock = null;
let isConnected = false;

async function getOrCreateSocket() {
  if (sock && isConnected) return sock;

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        isConnected = false;
        resolve({
          needsAuth: true,
          message: 'WhatsApp not linked yet. Please run "npm start" in the project directory to scan QR code.',
        });
      }

      if (connection === 'open') {
        isConnected = true;
        resolve({ needsAuth: false, sock });
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          sock = null;
        }
      }
    });

    // Timeout fallback after 10s
    setTimeout(() => {
      if (!isConnected) {
        resolve({
          needsAuth: true,
          message: 'Connection timed out or waiting for login. Run "npm start" to verify session.',
        });
      }
    }, 10000);
  });
}

// Create MCP Server
const server = new Server(
  {
    name: 'whatsapp-automation-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp message to a specific phone number using your linked WhatsApp account.',
        inputSchema: {
          type: 'object',
          properties: {
            phoneNumber: {
              type: 'string',
              description: 'The phone number with country code (e.g. "919876543210" for India). No "+" or spaces.',
            },
            message: {
              type: 'string',
              description: 'The text message content to send.',
            },
          },
          required: ['phoneNumber', 'message'],
        },
      },
      {
        name: 'check_whatsapp_status',
        description: 'Check if the WhatsApp session is connected and authenticated.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'check_whatsapp_status') {
    const conn = await getOrCreateSocket();
    if (conn.needsAuth) {
      return {
        content: [
          {
            type: 'text',
            text: `Status: Disconnected / Unauthenticated. ${conn.message}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text',
          text: 'Status: Connected and ready to send/receive messages. ✅',
        },
      ],
    };
  }

  if (name === 'send_whatsapp_message') {
    const rawNumber = String(args.phoneNumber).replace(/[^0-9]/g, '');
    const messageText = String(args.message);
    const recipientJid = `${rawNumber}@s.whatsapp.net`;

    const conn = await getOrCreateSocket();
    if (conn.needsAuth) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Cannot send message: ${conn.message}`,
          },
        ],
      };
    }

    try {
      await sock.sendMessage(recipientJid, { text: messageText });
      return {
        content: [
          {
            type: 'text',
            text: `Successfully sent WhatsApp message to +${rawNumber}: "${messageText}"`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to send WhatsApp message: ${err.message}`,
          },
        ],
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal MCP server error:', error);
  process.exit(1);
});
