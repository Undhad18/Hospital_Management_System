const errorHandler = (err, req, res, next) => {
    console.error(err);

    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        type: err.type || "https://api.shopsphere.com/problems/internal-server-error",
        title: err.title || "Internal Server Error",
        status: statusCode,
        detail: err.detail || "An unexpected error occurred.",
        instance: req.originalUrl
    });
};

module.exports = errorHandler;