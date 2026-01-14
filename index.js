require("dotenv").config();

console.log("DATABASE_URL =", process.env.DATABASE_URL);
const express = require("express");
const app = express();
const session = require("express-session");
const crypto = require("crypto"); 
const { insertIfNotExists } = require("./transactionsRepo");
const { fetchKotakEmails, readEmail } = require("./gmail");
const { parseKotakTransaction } = require("./parseKotak");

app.use(
  session({
    secret: "xpenses-secret",
    resave: false,
    saveUninitialized: true
  })
);

const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Hi this is calwin's instance" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const pool = require("./db");

app.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id,
              amount::float AS amount,
              category,
              transaction_date AS date,
              type,
              note
       FROM transactions
       WHERE deleted_at IS NULL
       ORDER BY transaction_date DESC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/transactions", async (req, res) => {
  try {
    const { id, amount, category, date, type, note } = req.body;

    await pool.query(
      `INSERT INTO transactions
       (id, amount, category, transaction_date, type, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, amount, category, date, type, note]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE transactions
       SET deleted_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/transactions/import", async (req, res) => {
  try {
    const {
      fingerprint,
      amount,
      merchant,
      date,
      source,
      rawText
    } = req.body;

    // Prevent duplicates
    const existing = await pool.query(
      "SELECT 1 FROM transactions WHERE fingerprint = $1",
      [fingerprint]
    );

    if (existing.rowCount > 0) {
      return res.status(200).json({ skipped: true });
    }

    await pool.query(
      `
      INSERT INTO transactions
      (id, amount, category, transaction_date, type, note, fingerprint, source)
      VALUES
      (gen_random_uuid(), $1, $2, $3, 'Debit', $4, $5, $6)
      `,
      [
        amount,
        "Uncategorized",
        date,
        merchant,
        fingerprint,
        source
      ]
    );

    res.status(201).json({ imported: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/gmail/import", async (req, res) => {
  let imported = 0;
  let skipped = 0;

  try {
    const messages = await fetchKotakEmails(20);
    console.log("GMAIL MESSAGES:", messages.length);

    for (const msg of messages) {
      const body = await readEmail(msg.id);

      if (!body) {
        skipped++;
        continue;
      }

      const txn = parseKotakTransaction(body);
      if (!txn) {
        skipped++;
        continue;
      }

      const fingerprint = crypto
        .createHash("sha256")
        .update(txn.rawText)
        .digest("hex");

      const result = await insertIfNotExists(txn, fingerprint);

      if (result === "inserted") imported++;
      else skipped++;
    }

    res.json({ imported, skipped });
  } catch (err) {
    console.error("GMAIL IMPORT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

