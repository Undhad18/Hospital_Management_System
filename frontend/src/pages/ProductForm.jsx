import { useState } from "react";

const ProductForm = () => {
    const [formData, setFormData] = useState({
        name: "",
        category_id: "",
        price: "",
        discount_price: "",
        stock: "",
        sku: "",
        brand: "",
        status: "1"
    });

    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState("");

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value
        }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];

        if (!file) {
            return;
        }

        // Frontend validation
        const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            setError(
                "Only JPG, JPEG, PNG and WEBP images are allowed"
            );

            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError(
                "Image size must be less than 5MB"
            );

            return;
        }

        setImage(file);
        setError("");

        // Image preview
        setPreview(
            URL.createObjectURL(file)
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setLoading(true);
        setMessage("");
        setError("");

        try {
            const data = new FormData();

            data.append("name", formData.name);
            data.append(
                "category_id",
                formData.category_id
            );
            data.append("price", formData.price);
            data.append(
                "discount_price",
                formData.discount_price
            );
            data.append("stock", formData.stock);
            data.append("sku", formData.sku);
            data.append("brand", formData.brand);
            data.append("status", formData.status);

            if (image) {
                data.append("image", image);
            }

            const response = await fetch(
                "http://localhost:5000/api/products",
                {
                    method: "POST",
                    body: data
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                    "Failed to create product"
                );
            }

            setMessage(
                "Product created successfully"
            );

            // Reset form
            setFormData({
                name: "",
                category_id: "",
                price: "",
                discount_price: "",
                stock: "",
                sku: "",
                brand: "",
                status: "1"
            });

            setImage(null);
            setPreview("");

        } catch (error) {
            console.error(error);

            setError(
                error.message ||
                "Something went wrong"
            );

        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6">

            <h1 className="text-2xl font-bold mb-6">
                Add Product
            </h1>

            {message && (
                <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
                    {message}
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                    {error}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className="space-y-4"
            >

                <input
                    type="text"
                    name="name"
                    placeholder="Product Name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                    required
                />

                <input
                    type="number"
                    name="category_id"
                    placeholder="Category ID"
                    value={formData.category_id}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                />

                <input
                    type="number"
                    name="price"
                    placeholder="Price"
                    value={formData.price}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                    required
                />

                <input
                    type="number"
                    name="discount_price"
                    placeholder="Discount Price"
                    value={formData.discount_price}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                />

                <input
                    type="number"
                    name="stock"
                    placeholder="Stock"
                    value={formData.stock}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                />

                <input
                    type="text"
                    name="sku"
                    placeholder="SKU"
                    value={formData.sku}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                />

                <input
                    type="text"
                    name="brand"
                    placeholder="Brand"
                    value={formData.brand}
                    onChange={handleChange}
                    className="w-full border p-3 rounded"
                />

                {/* Image */}
                <div>
                    <label className="block mb-2 font-medium">
                        Product Image
                    </label>

                    <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="w-full border p-3 rounded"
                    />
                </div>

                {/* Preview */}
                {preview && (
                    <div>
                        <p className="mb-2 font-medium">
                            Preview
                        </p>

                        <img
                            src={preview}
                            alt="Preview"
                            className="w-48 h-48 object-cover rounded border"
                        />
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-black text-white p-3 rounded"
                >
                    {loading
                        ? "Creating..."
                        : "Create Product"}
                </button>

            </form>
        </div>
    );
};

export default ProductForm;