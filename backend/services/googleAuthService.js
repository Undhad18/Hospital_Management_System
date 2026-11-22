const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verify Google ID Token
 * @param {string} idToken
 * @returns {Promise<{ sub: string, email: string, email_verified: boolean, name: string }>}
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    const error = new Error("Google ID token credential is required.");
    error.statusCode = 400;
    throw error;
  }

  const trimmedToken = idToken.trim();

  // Support controlled test tokens in non-production environments for automated testing
  if (process.env.NODE_ENV !== "production" && trimmedToken.startsWith("test_google_token:")) {
    try {
      const rawPayload = trimmedToken.slice("test_google_token:".length);
      const parsed = JSON.parse(rawPayload);

      if (parsed.expired) {
        const err = new Error("Token used too late (token has expired).");
        err.statusCode = 401;
        throw err;
      }

      if (parsed.wrongAudience) {
        const err = new Error("Token audience mismatch (wrong OAuth client ID).");
        err.statusCode = 401;
        throw err;
      }

      if (parsed.invalidSignature) {
        const err = new Error("Invalid Google token signature.");
        err.statusCode = 401;
        throw err;
      }

      if (!parsed.email || !parsed.sub) {
        const err = new Error("Invalid token claims: missing sub or email.");
        err.statusCode = 400;
        throw err;
      }

      return {
        sub: parsed.sub,
        email: parsed.email.trim().toLowerCase(),
        email_verified: parsed.email_verified !== false,
        name: parsed.name || "Google User",
      };
    } catch (parseErr) {
      if (parseErr.statusCode) throw parseErr;
      const err = new Error("Malformed test Google token: " + parseErr.message);
      err.statusCode = 400;
      throw err;
    }
  }

  // Production / Real Google Verification
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const err = new Error(
      "Google Sign-In is not configured on this server. GOOGLE_CLIENT_ID environment variable is missing."
    );
    err.statusCode = 503;
    throw err;
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: trimmedToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      const err = new Error("Invalid Google token payload.");
      err.statusCode = 401;
      throw err;
    }

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      email_verified: Boolean(payload.email_verified),
      name: payload.name || payload.given_name || "Google Patient",
    };
  } catch (verifyErr) {
    const err = new Error("Google authentication failed: " + (verifyErr.message || "Invalid token"));
    err.statusCode = 401;
    throw err;
  }
}

module.exports = {
  verifyGoogleIdToken,
};
