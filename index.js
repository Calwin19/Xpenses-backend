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
      `
      SELECT
        id,
        amount::float AS amount,
        category,
        transaction_date::double precision AS timestamp,
        type,
        note
      FROM transactions
      WHERE deleted_at IS NULL
      ORDER BY transaction_date DESC
      `
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/transactions", async (req, res) => {
  const { id, amount, category, timestamp, type, note } = req.body;

  await pool.query(
    `
    INSERT INTO transactions
    (id, amount, category, transaction_date, type, note)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, amount, category, timestamp, type, note]
  );

  res.json({ success: true });
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

app.put("/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, date, type, note } = req.body;

    const result = await pool.query(
      `
      UPDATE transactions
      SET amount = $1,
          category = $2,
          transaction_date = $3,
          type = $4,
          note = $5,
          updated_at = NOW()
      WHERE id = $6
        AND deleted_at IS NULL
      RETURNING *
      `,
      [amount, category, date, type, note, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({
      id: result.rows[0].id,
      amount: Number(result.rows[0].amount),
      category: result.rows[0].category,
      timestamp: Number(result.rows[0].transaction_date),
      type: result.rows[0].type,
      note: result.rows[0].note
    });
  } catch (err) {
    console.error("UPDATE TRANSACTION ERROR:", err);
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

    const existing = await pool.query(
      "SELECT 1 FROM transactions WHERE fingerprint = $1",
      [fingerprint]
    );

    if (existing.rowCount > 0) {
      return res.status(200).json({ skipped: true });
    }

    const learned = await pool.query(
      `
      SELECT category, note
      FROM transactions
      WHERE destination = $1
        AND category IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [merchant]
    );

    const category = learned.rows[0]?.category ?? "Uncategorized";
    const note = learned.rows[0]?.note ?? null;

    await pool.query(
      `
      INSERT INTO transactions
      (id, amount, category, note, transaction_date, type, source, destination, fingerprint)
      VALUES
      (gen_random_uuid(), $1, $2, $3, $4, 'Debit', $5, $6, $7)
      `,
      [
        amount,
        category,
        note,
        date,                
        source,             
        merchant,          
        fingerprint
      ]
    );

    res.status(201).json({ imported: true });
  } catch (err) {
    console.error("IMPORT ERROR:", err);
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

