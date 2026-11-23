const crypto = require("crypto");

const createRequestHash = (body) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
};

module.exports = {
  createRequestHash
};