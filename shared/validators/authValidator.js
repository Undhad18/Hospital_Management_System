/**
 * Shared Authentication Validators
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(data = {}) {
  const errors = [];

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Full name is required." });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Name must be at least 2 characters long." });
  }

  if (!data.email || typeof data.email !== "string" || !data.email.trim()) {
    errors.push({ field: "email", message: "Email is required." });
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.push({ field: "email", message: "Please provide a valid email address." });
  }

  if (!data.password || typeof data.password !== "string") {
    errors.push({ field: "password", message: "Password is required." });
  } else if (data.password.length < 6) {
    errors.push({ field: "password", message: "Password must be at least 6 characters long." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateLogin(data = {}) {
  const errors = [];

  if (!data.email || typeof data.email !== "string" || !data.email.trim()) {
    errors.push({ field: "email", message: "Email is required." });
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.push({ field: "email", message: "Please provide a valid email address." });
  }

  if (!data.password || typeof data.password !== "string" || !data.password) {
    errors.push({ field: "password", message: "Password is required." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  EMAIL_REGEX,
  validateRegistration,
  validateLogin,
};
