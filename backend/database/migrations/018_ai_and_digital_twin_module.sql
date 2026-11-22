-- ============================================================================
-- Migration 018: AI Hospital Intelligence and Digital Twin Additive Schema
-- HealthMesh Enterprise Healthcare Platform
-- Safe, additive-only migration: does not alter or drop existing tables
-- ============================================================================

USE hospital_management;

-- 1. AI Chat Conversations
CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospital_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'New Consultation',
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_conv_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_conv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_conv_user (user_id),
  INDEX idx_ai_conv_hospital (hospital_id),
  INDEX idx_ai_conv_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. AI Chat Messages
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender ENUM('user', 'assistant', 'system') NOT NULL,
  message LONGTEXT NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_msg_conv FOREIGN KEY (conversation_id) REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
  INDEX idx_ai_msg_conv (conversation_id),
  INDEX idx_ai_msg_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. AI Generated Reports
CREATE TABLE IF NOT EXISTS ai_generated_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_number VARCHAR(50) NOT NULL UNIQUE,
  hospital_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  report_type ENUM(
    'daily_operational',
    'weekly_executive',
    'monthly_financial',
    'bed_occupancy',
    'inventory_forecast',
    'lab_workload',
    'doctor_performance',
    'custom_nl'
  ) NOT NULL,
  title VARCHAR(200) NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  summary LONGTEXT NOT NULL,
  metrics_snapshot JSON NOT NULL,
  recommendations JSON NULL,
  generated_by_role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_rep_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_rep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_ai_rep_hospital (hospital_id),
  INDEX idx_ai_rep_type (report_type),
  INDEX idx_ai_rep_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. AI Automation & Workflow Notification Rules
CREATE TABLE IF NOT EXISTS ai_automation_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospital_id BIGINT UNSIGNED NOT NULL,
  rule_type ENUM(
    'low_stock_alert',
    'expiry_warning',
    'bed_capacity_surge',
    'long_wait_queue',
    'pending_lab_delay',
    'unpaid_bill_aging'
  ) NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  threshold_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  config JSON NULL,
  last_triggered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_rule_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ai_hospital_rule (hospital_id, rule_type),
  INDEX idx_ai_rule_hospital (hospital_id),
  INDEX idx_ai_rule_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Digital Twin Isolated Simulations
CREATE TABLE IF NOT EXISTS digital_twin_simulations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  simulation_code VARCHAR(50) NOT NULL UNIQUE,
  hospital_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  scenario_type ENUM(
    'patient_surge',
    'bed_capacity_loss',
    'doctor_shortage',
    'medicine_demand_spike',
    'lab_surge',
    'custom'
  ) NOT NULL,
  scenario_name VARCHAR(150) NOT NULL,
  parameters JSON NOT NULL,
  baseline_metrics JSON NOT NULL,
  simulated_metrics JSON NOT NULL,
  impact_summary LONGTEXT NOT NULL,
  is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dt_sim_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  CONSTRAINT fk_dt_sim_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_dt_sim_hospital (hospital_id),
  INDEX idx_dt_sim_type (scenario_type),
  INDEX idx_dt_sim_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. AI & Digital Twin Security Audit Logs
CREATE TABLE IF NOT EXISTS ai_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hospital_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  feature VARCHAR(100) NOT NULL,
  query_text TEXT NULL,
  model_used VARCHAR(100) NOT NULL,
  execution_time_ms INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('success', 'failed', 'blocked') NOT NULL DEFAULT 'success',
  error_message VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_audit_hospital (hospital_id),
  INDEX idx_ai_audit_user (user_id),
  INDEX idx_ai_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
