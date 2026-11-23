/**
 * Shared Sort Options & Database Clauses
 */
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First", sqlClause: "ORDER BY created_at DESC" },
  { value: "price_asc", label: "Price: Low to High", sqlClause: "ORDER BY price ASC" },
  { value: "price_desc", label: "Price: High to Low", sqlClause: "ORDER BY price DESC" },
  { value: "name_asc", label: "Name: A to Z", sqlClause: "ORDER BY name ASC" },
  { value: "name_desc", label: "Name: Z to A", sqlClause: "ORDER BY name DESC" },
  { value: "oldest", label: "Oldest First", sqlClause: "ORDER BY created_at ASC" },
];

const DEFAULT_SORT = "newest";

module.exports = {
  SORT_OPTIONS,
  DEFAULT_SORT,
};
