const { Pool } = require("pg");

const isLocal = process.env.NODE_ENV !== "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

module.exports = pool;
