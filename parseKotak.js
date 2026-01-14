const crypto = require("crypto");
function parseKotakTransaction(text) {
  const amountMatch = text.match(/INR\s+(\d+)/i);
  const merchantMatch = text.match(/at\s+UPI-[^-]+-([A-Z\s]+)/i);
  const dateMatch = text.match(/on\s+(\d{2}-[A-Za-z]{3}-\d{4})/);

  if (!amountMatch || !merchantMatch || !dateMatch) return null;

  return {
    amount: Number(amountMatch[1]),
    merchant: merchantMatch[1].trim(),
    date: new Date(dateMatch[1]),
    type: "Debit",
    source: "Kotak Credit Card",
    rawText: text
  };
}

module.exports = { parseKotakTransaction };

