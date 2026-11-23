const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const db = require("../config/db");

async function clearAllData() {
  console.log("🧹 Starting complete database and order cleanup...");

  try {
    await db.query("SET FOREIGN_KEY_CHECKS = 0");

    await db.query("TRUNCATE TABLE shipment_tracking_events");
    console.log("✅ Cleared `shipment_tracking_events` table.");

    await db.query("TRUNCATE TABLE shipment_items");
    console.log("✅ Cleared `shipment_items` table.");

    await db.query("TRUNCATE TABLE shipments");
    console.log("✅ Cleared `shipments` table.");

    await db.query("TRUNCATE TABLE order_returns");
    console.log("✅ Cleared `order_returns` table.");

    await db.query("TRUNCATE TABLE order_cancellation_requests");
    console.log("✅ Cleared `order_cancellation_requests` table.");

    await db.query("TRUNCATE TABLE order_refunds");
    console.log("✅ Cleared `order_refunds` table.");

    await db.query("TRUNCATE TABLE order_items");
    console.log("✅ Cleared `order_items` table.");

    await db.query("TRUNCATE TABLE orders");
    console.log("✅ Cleared `orders` table (auto-increment reset to 1).");

    await db.query("TRUNCATE TABLE idempotency_keys");
    console.log("✅ Cleared `idempotency_keys` table.");

    await db.query("SET FOREIGN_KEY_CHECKS = 1");

    // Reset standard stock levels on catalog products
    await db.query(`
      UPDATE products SET stock = CASE 
        WHEN id = 1 THEN 50
        WHEN id = 3 THEN 30
        WHEN id = 4 THEN 20
        WHEN id = 5 THEN 40
        WHEN id = 6 THEN 25
        WHEN id = 8 THEN 35
        ELSE 50
      END
    `);
    console.log("✅ Reset product catalog stock levels to standard available quantities.");

    // Verify
    const [[{ orderCount }]] = await db.query("SELECT COUNT(*) as orderCount FROM orders");
    const [[{ itemCount }]] = await db.query("SELECT COUNT(*) as itemCount FROM order_items");
    const [[{ shipCount }]] = await db.query("SELECT COUNT(*) as shipCount FROM shipments");
    const [[{ returnCount }]] = await db.query("SELECT COUNT(*) as returnCount FROM order_returns");
    const [[{ refundCount }]] = await db.query("SELECT COUNT(*) as refundCount FROM order_refunds");
    const [[{ idemCount }]] = await db.query("SELECT COUNT(*) as idemCount FROM idempotency_keys");

    console.log("\n📊 Verification Summary:");
    console.log(`- Orders in DB: ${orderCount}`);
    console.log(`- Order Items in DB: ${itemCount}`);
    console.log(`- Shipments in DB: ${shipCount}`);
    console.log(`- Return Requests in DB: ${returnCount}`);
    console.log(`- Refunds in DB: ${refundCount}`);
    console.log(`- Idempotency Keys in DB: ${idemCount}`);
    console.log("\n✨ Cleanup finished successfully! Fresh slate ready.");
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    throw err;
  }
}

if (require.main === module) {
  clearAllData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { clearAllData };
