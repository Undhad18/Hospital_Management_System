const crypto = require("crypto");

const requestId = (
  req,
  res,
  next
) => {

  const id =
    req.get("X-Request-ID") ||
    `req_${crypto.randomUUID()}`;

  req.requestId = id;

  res.setHeader(
    "X-Request-ID",
    id
  );

  next();
};

module.exports = {
  requestId
};