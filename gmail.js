const fs = require("fs");
const { google } = require("googleapis");

let gmail = null;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

if (fs.existsSync("tokens.json")) {
  const tokens = JSON.parse(fs.readFileSync("tokens.json"));
  oauth2Client.setCredentials(tokens);
  gmail = google.gmail({ version: "v1", auth: oauth2Client });
  console.log("✅ Gmail client initialized");
} else {
  console.log("⚠️ tokens.json not found. Gmail import disabled.");
}

async function fetchKotakEmails(limit = 20) {
  if (!gmail) {
    throw new Error("Gmail not authenticated. Run /auth/google first.");
  }

  const res = await gmail.users.messages.list({
    userId: "me",
    q: "from:creditcardalerts@kotak.com",
    maxResults: limit
  });

  return res.data.messages || [];
}

async function readEmail(messageId) {
  if (!gmail) {
    throw new Error("Gmail not authenticated.");
  }

  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full"
  });

  function extractBody(payload) {
    if (!payload) return null;

    if (
      payload.mimeType === "text/plain" ||
      payload.mimeType === "text/html"
    ) {
      if (payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const found = extractBody(part);
        if (found) return found;
      }
    }

    return null;
  }

  return extractBody(res.data.payload);
}

module.exports = { fetchKotakEmails, readEmail };

