require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const pool = require("../db");

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log("=== Running Migration 018: AI & Digital Twin Additive Tables ===");
    const sqlPath = path.join(__dirname, "..", "database", "migrations", "018_ai_and_digital_twin_module.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Remove comments and split into individual SQL statements
    const cleaned = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    const statements = cleaned
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.toLowerCase().startsWith("use "));

    for (const stmt of statements) {
      console.log("Executing:", stmt.slice(0, 60).replace(/\n/g, " ") + "...");
      await connection.query(stmt);
    }

    console.log("=== Migration 018 Completed Successfully! ===");

    const [aiTables] = await connection.query("SHOW TABLES LIKE 'ai_%'");
    console.log("AI Tables:", aiTables.map((r) => Object.values(r)[0]));

    const [dtTables] = await connection.query("SHOW TABLES LIKE 'digital_%'");
    console.log("Digital Twin Tables:", dtTables.map((r) => Object.values(r)[0]));
  } finally {
    connection.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration 018 error:", err);
    process.exit(1);
  });
