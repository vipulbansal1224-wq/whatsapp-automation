# 🤖 WhatsApp Automation Bot & MCP Server

यह प्रोजेक्ट आपके पर्सनल WhatsApp को सुरक्षित रूप से automate करने और इसे **Antigravity** के साथ **MCP (Model Context Protocol)** के ज़रिए जोड़ने के लिए तैयार किया गया है।

---

## 📁 प्रोजेक्ट स्ट्रक्चर

- `index.js` — WhatsApp Web Automation Bot (QR कोड लॉगिन, इनकमिंग मैसेज लिसनर और ऑटो-रिप्लाई)
- `send-message.js` — कमांड लाइन से किसी भी नंबर पर डायरेक्ट मैसेज भेजने की स्क्रिप्ट
- `mcp-server.js` — Antigravity और Claude Desktop के लिए WhatsApp MCP Server
- `auth_info/` — आपकी लॉगिन क्रेडेंशियल्स (QR स्कैन के बाद अपने आप बनती है, बार-बार स्कैन नहीं करना पड़ता)

---

## 🚀 कैसे शुरू करें (Step-by-Step)

### Step 1: बॉट स्टार्ट करें और QR Code स्कैन करें
टर्मिनल / PowerShell में प्रोजेक्ट फ़ोल्डर में जाकर रन करें:
```bash
cd C:\Users\adfmin\.gemini\antigravity\scratch\whatsapp-automation
node index.js
```
1. टर्मिनल में एक QR कोड दिखाई देगा।
2. अपने फ़ोन में **WhatsApp खोलें > Settings > Linked Devices > Link a Device** पर टैप करें।
3. टर्मिनल के QR कोड को स्कैन करें।
4. स्कैन होते ही बॉट कनेक्ट हो जाएगा और सेशन `./auth_info` में सुरक्षित सेव हो जाएगा।

---

## ⚡ फ़ीचर्स (Automations)

### 1. ऑटोमैटिक रिप्लाई (Auto-Reply Bot)
जब बॉट चल रहा होगा (`node index.js`), तो अगर कोई आपके WhatsApp पर मैसेज करता है:
- `!ping` ➡️ बॉट तुरंत रिप्लाई करेगा `pong! 🏓`
- `!info` ➡️ बॉट स्टेटस और करंट टाइम भेजेगा
- `!echo <मैसेज>` ➡️ वही मैसेज दोहराएगा

### 2. कमांड लाइन से किसी भी नंबर को मैसेज भेजना
बिना WhatsApp ऐप खोले किसी भी नंबर पर मैसेज भेजें:
```bash
node send-message.js <country_code_number> "<आपका मैसेज>"
```
*उदाहरण:*
```bash
node send-message.js 919876543210 "नमस्ते! यह एक ऑटोमेटेड मैसेज है।"
```

---

## 🔌 Antigravity में MCP Server के रूप में जोड़ना

Antigravity के ग्लोबल कॉन्फ़िगरेशन फ़ाइल (`C:\Users\adfmin\.gemini\config\mcp_config.json`) में यह जोड़ें:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": [
        "C:/Users/adfmin/.gemini/antigravity/scratch/whatsapp-automation/mcp-server.js"
      ]
    }
  }
}
```

इसके बाद Antigravity का AI एजेंट सीधे चैट से आपके लिए:
- WhatsApp स्टेटस चेक कर सकेगा (`check_whatsapp_status`)
- किसी भी कांटेक्ट या नंबर पर मैसेज भेज सकेगा (`send_whatsapp_message`)
