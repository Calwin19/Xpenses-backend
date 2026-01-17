const pool = require("./db");

async function insertIfNotExists(txn, fingerprint) {
  const existing = await pool.query(
    "SELECT 1 FROM transactions WHERE fingerprint = $1",
    [fingerprint]
  );

  if (existing.rowCount > 0) {
    return "skipped";
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
    [txn.merchant]
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
      txn.amount,
      category,
      note,
      txn.date,
      txn.source,
      txn.merchant,
      fingerprint
    ]
  );

  return "inserted";
}

module.exports = {
  insertIfNotExists
};

