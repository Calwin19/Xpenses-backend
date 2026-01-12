require("dotenv").config();

console.log("DATABASE_URL =", process.env.DATABASE_URL);
const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running 🚀" });
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

