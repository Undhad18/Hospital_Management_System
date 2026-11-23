const addDeprecationHeaders = (
  sunsetDate
) => {
  return (req, res, next) => {

    res.setHeader(
      "Deprecation",
      "true"
    );

    if (sunsetDate) {
      res.setHeader(
        "Sunset",
        sunsetDate
      );
    }

    next();
  };
};

module.exports = {
  addDeprecationHeaders
};