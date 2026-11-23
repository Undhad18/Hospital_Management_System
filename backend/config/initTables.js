const db = require("./db");

async function initTables() {
  try {
    // 1. Create orders table with status supporting placed, confirmed, packed, shipped, delivered, cancelled
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'placed',
        shipping_address TEXT NULL,
        payment_method VARCHAR(50) DEFAULT 'credit_card',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Create order_items table
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order_items_order (order_id),
        INDEX idx_order_items_product (product_id),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Create idempotency_keys table for duplicate order & double payment prevention
    await db.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Verify orders and order_items columns
    const [cols] = await db.query("DESCRIBE orders");
    const colNames = cols.map((c) => c.Field);
    if (!colNames.includes("stripe_payment_intent_id")) {
      await db.query("ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(100) NULL");
    }
    if (!colNames.includes("idempotency_key")) {
      await db.query("ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(100) NULL");
    }
    if (!colNames.includes("payment_status")) {
      await db.query("ALTER TABLE orders ADD COLUMN payment_status VARCHAR(50) DEFAULT 'paid'");
    }
    if (!colNames.includes("fulfillment_status")) {
      await db.query("ALTER TABLE orders ADD COLUMN fulfillment_status VARCHAR(50) DEFAULT 'unfulfilled'");
    }
    if (!colNames.includes("stripe_refund_id")) {
      await db.query("ALTER TABLE orders ADD COLUMN stripe_refund_id VARCHAR(100) NULL");
    }
    if (!colNames.includes("refund_amount")) {
      await db.query("ALTER TABLE orders ADD COLUMN refund_amount DECIMAL(10, 2) DEFAULT 0.00");
    }
    if (!colNames.includes("refund_status")) {
      await db.query("ALTER TABLE orders ADD COLUMN refund_status VARCHAR(50) NULL");
    }
    if (!colNames.includes("refund_reason")) {
      await db.query("ALTER TABLE orders ADD COLUMN refund_reason VARCHAR(255) NULL");
    }
    if (!colNames.includes("refunded_at")) {
      await db.query("ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMP NULL");
    }

    const [itemCols] = await db.query("DESCRIBE order_items");
    const itemColNames = itemCols.map((c) => c.Field);
    if (!itemColNames.includes("fulfilled_quantity")) {
      await db.query("ALTER TABLE order_items ADD COLUMN fulfilled_quantity INT DEFAULT 0");
    }

    // 5. Create shipments table for tracking and shipment processing
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        carrier VARCHAR(100) NOT NULL,
        tracking_number VARCHAR(100) NOT NULL,
        tracking_url VARCHAR(255) NULL,
        shipping_tier VARCHAR(50) DEFAULT 'standard',
        status VARCHAR(50) DEFAULT 'label_created',
        estimated_delivery TIMESTAMP NULL,
        shipped_at TIMESTAMP NULL,
        delivered_at TIMESTAMP NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_shipments_order (order_id),
        INDEX idx_shipments_tracking (tracking_number),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Create shipment_items table for partial fulfillment
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipment_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        order_item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shipment_items_shipment (shipment_id),
        INDEX idx_shipment_items_order_item (order_item_id),
        FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
        FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Create shipment_tracking_events table for checkpoint history
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipment_tracking_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        shipment_id INT NOT NULL,
        status VARCHAR(100) NOT NULL,
        location VARCHAR(255) NULL,
        description TEXT NULL,
        event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tracking_shipment (shipment_id),
        FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Create order_returns table for return requests and admin approval/rejection
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reason VARCHAR(100) NOT NULL,
        customer_notes TEXT NULL,
        admin_notes TEXT NULL,
        refund_amount DECIMAL(10,2) NULL,
        items JSON NULL,
        restock_inventory BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP NULL,
        reviewed_by INT NULL,
        INDEX idx_returns_order (order_id),
        INDEX idx_returns_user (user_id),
        INDEX idx_returns_status (status),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 9. Create order_cancellation_requests table for cancellation requests and admin review
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_cancellation_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        reason VARCHAR(100) NOT NULL,
        customer_notes TEXT NULL,
        admin_notes TEXT NULL,
        previous_order_status VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP NULL,
        reviewed_by INT NULL,
        INDEX idx_cancellations_order (order_id),
        INDEX idx_cancellations_user (user_id),
        INDEX idx_cancellations_status (status),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 10. Create order_refunds table for detailed Stripe refund synchronization
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NULL,
        stripe_refund_id VARCHAR(100) NOT NULL UNIQUE,
        stripe_payment_intent_id VARCHAR(100) NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'usd',
        status VARCHAR(50) DEFAULT 'succeeded',
        reason VARCHAR(255) NULL,
        receipt_url VARCHAR(255) NULL,
        is_mock BOOLEAN DEFAULT FALSE,
        source VARCHAR(50) DEFAULT 'cancellation',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_refunds_order (order_id),
        INDEX idx_order_refunds_stripe (stripe_refund_id),
        INDEX idx_order_refunds_status (status),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 11. Create feature_flags table for progressive delivery & A/B release strategies
    await db.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        flag_key VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        description TEXT NULL,
        is_enabled BOOLEAN DEFAULT TRUE,
        rollout_percentage INT DEFAULT 50,
        target_roles JSON NULL,
        target_user_ids JSON NULL,
        kill_switch BOOLEAN DEFAULT FALSE,
        variant_payload JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_flag_key (flag_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed default feature flags if empty
    const [flagsCount] = await db.query("SELECT COUNT(*) as count FROM feature_flags");
    if (flagsCount[0].count === 0) {
      await db.query(`
        INSERT INTO feature_flags 
        (flag_key, name, description, is_enabled, rollout_percentage, target_roles, target_user_ids, kill_switch, variant_payload)
        VALUES 
        ('new_checkout_v2', 'Next-Gen Express Checkout UI (v2)', 'Modern glassmorphic multi-payment checkout with dynamic promo codes and shipping tiers', TRUE, 50, '["all", "admin", "beta_tester"]', '[]', FALSE, '{"version": "2.0.0", "theme": "glassmorphic", "allowedPaymentMethods": ["stripe_card", "express_wallet", "usdc_crypto"]}'),
        ('express_shipping_perk', '1-Day Priority Express Delivery', 'Complimentary 1-day priority shipping perk for admin & beta testers', TRUE, 100, '["admin", "beta_tester"]', '[]', FALSE, '{"discountRate": 1.0, "deliveryDays": 1}'),
        ('smart_discount_engine', 'AI Coupon & Promo Code Engine', 'Validates real-time promotional codes (e.g. SAVE20, EXCELSIOR50)', TRUE, 100, '["all"]', '[]', FALSE, '{"activeCodes": ["SAVE20", "EXCELSIOR50", "FREESHIP"]}'),
        ('crypto_usdc_settlement', 'Web3 USDC Settlement Gateway', 'Experimental instant blockchain settlement tab for verified customers', FALSE, 10, '["admin"]', '[]', FALSE, '{"network": "Polygon / Base", "stablecoin": "USDC"}')
      `);
      console.log("🚩 Feature flags seeded with default progressive release rules.");
    }

    console.log("Database tables (orders, order_items, idempotency_keys, feature_flags) verified successfully.");
  } catch (error) {
    console.error("Error initializing tables:", error.message);
  }
}

if (require.main === module) {
  initTables().then(() => process.exit(0));
}

module.exports = initTables;

