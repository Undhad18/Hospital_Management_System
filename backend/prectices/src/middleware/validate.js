const validate = (schema, source = "body") => {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message
            }));

            return res.status(422).json({
                type: "https://api.shopsphere.com/problems/validation-error",
                title: "Validation Error",
                status: 422,
                detail: "One or more fields are invalid.",
                instance: req.originalUrl,
                errors
            });
        }

        req[source] = result.data;

        next();
    };
};

module.exports = validate;