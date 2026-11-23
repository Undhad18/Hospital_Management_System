const db = require("../config/db");

const createProduct = async (data) => {
    const [result] = await db.query(
        "CALL sp_create_product(?, ?, ?, ?)",
        [
            data.name,
            data.price,
            data.stock,
            data.category_id
        ]
    );

    return result;
};

module.exports = {
    createProduct
};