const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        type: "https://api.shopsphere.com/problems/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Authorization header is required.",
        instance: req.originalUrl
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        type: "https://api.shopsphere.com/problems/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Use Authorization: Bearer <token>.",
        instance: req.originalUrl
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      type: "https://api.shopsphere.com/problems/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Invalid or expired token.",
      instance: req.originalUrl
    });
  }
};

module.exports = {
  authenticate
};