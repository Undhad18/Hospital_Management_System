/**
 * Shared Product Category Constants
 * Accessible across React UI dropdowns and Express query validations.
 */
const CATEGORIES = [
  { id: "all", label: "All Categories", value: "all", slug: "all" },
  { id: "1", label: "Laptops & Computers", value: "1", slug: "laptops" },
  { id: "2", label: "Smartphones & Tablets", value: "2", slug: "smartphones" },
  { id: "3", label: "Audio & Headphones", value: "3", slug: "audio" },
  { id: "4", label: "Accessories & Peripherals", value: "4", slug: "accessories" },
];

const CATEGORY_MAP = CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = cat.label;
  return acc;
}, {});

module.exports = {
  CATEGORIES,
  CATEGORY_MAP,
};
