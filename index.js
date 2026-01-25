require("dotenv").config();

console.log("DATABASE_URL =", process.env.DATABASE_URL);
const express = require("express");
const app = express();
const crypto = require("crypto"); 
const { insertIfNotExists } = require("./transactionsRepo");
const { fetchKotakEmails, readEmail } = require("./gmail");
const { parseKotakTransaction } = require("./parseKotak");
const gmailAuthRoutes = require("./gmailOAuth");
const pool = require("./db");

app.use(express.json());

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.json({ message: "Hi this is calwin's instance" });
});

app.get("/transactions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        amount::float AS amount,
        category,
        transaction_date::double precision AS timestamp,
        type,
        note,
        source,
        destination,
        borrower,
        did_pay
      FROM transactions
      WHERE deleted_at IS NULL
      ORDER BY transaction_date DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("GET TRANSACTIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/transactions", async (req, res) => {
  const {id, amount, category, date, type, note, borrower, didPay} = req.body;

  await pool.query(
    `
    INSERT INTO transactions
    (id, amount, category, transaction_date, type, note, borrower, did_pay)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [id, amount, category, date, type, note, borrower ?? null, didPay ?? false]
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
    const {amount, category, date, type, note, borrower, didPay} = req.body;

    const result = await pool.query(
      `
      UPDATE transactions
      SET amount = $1,
          category = $2,
          transaction_date = $3,
          type = $4,
          note = $5,
          borrower = $6,
          did_pay = $7,
          updated_at = NOW()
      WHERE id = $8
        AND deleted_at IS NULL
      RETURNING *
      `,
      [amount, category, date, type, note, borrower ?? null, didPay ?? false, id]
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
      note: result.rows[0].note,
      source: result.rows[0].source,
      destination: result.rows[0].destination,
      borrower: result.rows[0].borrower,
      did_pay: result.rows[0].did_pay
    });
  } catch (err) {
    console.error("UPDATE TRANSACTION ERROR:", err);
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
