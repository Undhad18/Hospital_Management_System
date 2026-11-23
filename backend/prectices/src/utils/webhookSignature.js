const crypto = require("crypto");

const verifyWebhookSignature = (
  payload,
  signature,
  secret
) => {
  const expectedSignature =
    crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
};

module.exports = {
  verifyWebhookSignature
};