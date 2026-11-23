const requireScope = (...requiredScopes) => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        type: "https://api.shopsphere.com/problems/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Authentication required.",
        instance: req.originalUrl
      });
    }

    const userScopes = req.user.scopes || [];

    const hasPermission = requiredScopes.every(
      (scope) => userScopes.includes(scope)
    );

    if (!hasPermission) {
      return res.status(403).json({
        type: "https://api.shopsphere.com/problems/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "You do not have the required permission.",
        instance: req.originalUrl
      });
    }

    next();
  };
};

module.exports = {
  requireScope
};