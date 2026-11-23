const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";

// Fallback high-tech placeholder for missing or broken product images
export const DEFAULT_PRODUCT_IMAGE =
  "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120' fill='none'%3E%3Crect width='120' height='120' rx='16' fill='%230F172A'/%3E%3Cpath d='M40 75L53 58L65 70L75 55L90 75H40Z' fill='%236366F1' fill-opacity='0.4' stroke='%23818CF8' stroke-width='2' stroke-linejoin='round'/%3E%3Ccircle cx='48' cy='46' r='6' fill='%23818CF8' fill-opacity='0.8'/%3E%3Crect x='1' y='1' width='118' height='118' rx='15' stroke='%23334155' stroke-width='1.5' stroke-dasharray='4 4'/%3E%3C/svg%3E";

export const getImageUrl = (imagePath) => {
  if (!imagePath || typeof imagePath !== "string" || imagePath.trim() === "") {
    return DEFAULT_PRODUCT_IMAGE;
  }

  const cleanPath = imagePath.trim();

  // Return full URLs, data URIs, and blob preview URLs as is
  if (
    cleanPath.startsWith("http://") ||
    cleanPath.startsWith("https://") ||
    cleanPath.startsWith("data:") ||
    cleanPath.startsWith("blob:")
  ) {
    return cleanPath;
  }

  // Ensure proper single leading slash
  const formattedPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${API_URL}${formattedPath}`;
};

export const handleImageError = (e, fallback = DEFAULT_PRODUCT_IMAGE) => {
  if (e && e.target && e.target.src !== fallback) {
    e.target.onerror = null; // Prevent infinite fallback loops
    e.target.src = fallback;
  }
};