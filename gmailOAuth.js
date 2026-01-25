const express = require("express");
const fs = require("fs");
const { google } = require("googleapis");

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get("/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"]
  });

  res.redirect(authUrl);
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code } = req.query;

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));

    res.send("✅ Gmail connected successfully. You can close this tab.");
  } catch (err) {
    console.error("OAuth Error:", err);
    res.status(500).send("OAuth failed");
  }
});

module.exports = router;

