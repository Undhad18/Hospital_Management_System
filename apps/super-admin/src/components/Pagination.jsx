import React, { useState, useEffect, useMemo, useCallback } from "react";

/**
 * Reusable Custom Hook for Client-Side Pagination
 * Automatically manages currentPage, pageSize (default: 25), and slices the input list.
 */
export function usePagination(items = [], initialPageSize = 25) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalRecords = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  // Auto-correct currentPage if it ever exceeds totalPages (e.g. after filter change)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems,
    resetPage,
  };
}

/**
 * Standardized Pagination Component
 * Matches the reference design:
 * "Page X of Y (Z total items)" on the left, with Rows per page selector (10, 25, 50, 100),
 * and [Previous] [1, 2, 3...] [Next] buttons on the right.
 */
export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalRecords = 0,
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className = "",
}) {
  // If no records, or fewer records than smallest page size and only 1 page, no pagination needed
  if (totalRecords === 0) return null;
  if (totalRecords <= pageSize && totalPages <= 1 && totalRecords <= 10) return null;

  // Build smart page numbers array
  const pageNumbers = useMemo(() => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
      }
    }
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div
      className={`px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-sans select-none ${className}`}
    >
      {/* Left side: Page stats & Page Size selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Page <strong className="text-slate-800 font-semibold">{currentPage}</strong> of{" "}
          <strong className="text-slate-800 font-semibold">{Math.max(1, totalPages)}</strong> ({totalRecords} total items)
        </span>

        {onPageSizeChange && (
          <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-200">
            <label htmlFor="pagination-page-size" className="text-slate-500">
              Rows:
            </label>
            <select
              id="pagination-page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-700 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <span className="text-slate-400">/ page</span>
          </div>
        )}
      </div>

      {/* Right side: Navigation Controls */}
      <div className="flex items-center space-x-1.5">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange && onPageChange(currentPage - 1)}
          className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
        >
          Previous
        </button>

        {pageNumbers.map((p, idx) =>
          p === "..." ? (
            <span key={`dots-${idx}`} className="px-1.5 py-1 text-slate-400 font-medium">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange && onPageChange(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${p === currentPage
                ? "bg-slate-800 text-white font-bold"
                : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange && onPageChange(currentPage + 1)}
          className="px-2.5 py-1 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}
