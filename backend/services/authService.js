const bcrypt = require("bcryptjs");
const pool = require("../config/db");

/**
 * Find user by email address
 */
const findUserByEmail = async (email) => {
  const [rows] = await pool.query(
    "SELECT id, name, email, password, role, status, created_at, updated_at FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
};

/**
 * Find user by ID (excluding password by default for security)
 */
const findUserById = async (id, includePassword = false) => {
  const selectCols = includePassword
    ? "id, name, email, password, role, status, created_at, updated_at"
    : "id, name, email, role, status, created_at, updated_at";
  const [rows] = await pool.query(
    `SELECT ${selectCols} FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Create a new user with hashed password
 */
const createUser = async ({ name, email, password, role = "user" }) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const [result] = await pool.query(
    "INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, 1)",
    [name, email, hashedPassword, role]
  );

  return {
    id: result.insertId,
    name,
    email,
    role,
    status: 1,
  };
};

/**
 * Compare plain text password with hashed password
 */
const comparePasswords = async (enteredPassword, hashedPassword) => {
  return await bcrypt.compare(enteredPassword, hashedPassword);
};

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  comparePasswords,
};
