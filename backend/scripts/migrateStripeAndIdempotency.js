const pool = require("../config/db");

async function migrate() {
  console.log("Starting Stripe & Idempotency MySQL Migration...");
  try {
    // 1. Create idempotency_keys table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idempotency_key VARCHAR(120) NOT NULL UNIQUE,
        user_id INT NULL,
        request_path VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
        response_code INT NULL,
        response_body JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_idempotency_key (idempotency_key),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB;
    `);
    console.log("✓ Created or verified `idempotency_keys` table.");

    // 2. Add columns to orders
    const [cols] = await pool.query("DESCRIBE orders");
    const colNames = cols.map((c) => c.Field);

    if (!colNames.includes("stripe_payment_intent_id")) {
      await pool.query(
        "ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(100) NULL"
      );
      console.log("✓ Added `stripe_payment_intent_id` to orders table.");
    }

    if (!colNames.includes("idempotency_key")) {
      await pool.query(
        "ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(100) NULL"
      );
      console.log("✓ Added `idempotency_key` to orders table.");
    }

    if (!colNames.includes("payment_status")) {
      await pool.query(
        "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50) DEFAULT 'paid'"
      );
      console.log("✓ Added `payment_status` to orders table.");
    }

    console.log("🎉 All database migrations applied cleanly!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
