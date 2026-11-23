const { createRequestHash } =
  require("../utils/requestHash");

const requireIdempotencyKey = (
  req,
  res,
  next
) => {
  const key =
    req.headers["idempotency-key"];

  if (!key) {
    return res.status(400).json({
      success: false,
      message: "Idempotency-Key header is required"
    });
  }

  req.idempotencyKey = key;
  req.requestHash =
    createRequestHash(req.body);

  next();
};

module.exports = {
  requireIdempotencyKey
};