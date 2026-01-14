const pool = require("./db");

/**
 * Inserts transaction only if fingerprint does not exist
 */
async function insertIfNotExists(txn, fingerprint) {
  const result = await pool.query(
    `
    INSERT INTO transactions
      (id, amount, category, transaction_date, type, note, fingerprint, source)
    VALUES
      (gen_random_uuid(), $1, NULL, $2, $3, NULL, $4, $5)
    ON CONFLICT (fingerprint) DO NOTHING
    RETURNING id
    `,
    [
      txn.amount,
      txn.date,
      txn.type,
      fingerprint,
      txn.source
    ]
  );

  return result.rowCount === 1 ? "inserted" : "skipped";
}

module.exports = {
  insertIfNotExists
};

