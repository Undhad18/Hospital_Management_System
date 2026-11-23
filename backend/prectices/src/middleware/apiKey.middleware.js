const crypto = require("crypto");

const API_KEYS = new Map([
  [
    process.env.PARTNER_API_KEY,
    {
      name: "Partner Application",
      scopes: [
        "products:read"
      ]
    }
  ]
]);

const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: "API key is required"
    });
  }

  const keyData = API_KEYS.get(apiKey);

  if (!keyData) {
    return res.status(401).json({
      success: false,
      message: "Invalid API key"
    });
  }

  req.apiClient = keyData;

  next();
};

module.exports = {
  authenticateApiKey
};