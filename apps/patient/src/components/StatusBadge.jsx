import React from "react";

export default function StatusBadge({ status, className = "" }) {
  if (!status) return null;

  const normalized = String(status).toLowerCase().trim();

  let colorClasses = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-400";

  switch (normalized) {
    case "active":
    case "completed":
    case "paid":
    case "submitted":
    case "final":
    case "dispensed":
      colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-200";
      dotColor = "bg-emerald-500";
      break;

    case "pending":
    case "partially_paid":
    case "partially_dispensed":
    case "requested":
    case "draft":
    case "in_progress":
      colorClasses = "bg-amber-50 text-amber-700 border-amber-200";
      dotColor = "bg-amber-500";
      break;

    case "admitted":
    case "confirmed":
    case "transferred":
    case "follow_up":
      colorClasses = "bg-sky-50 text-sky-700 border-sky-200";
      dotColor = "bg-sky-500";
      break;

    case "inactive":
    case "cancelled":
    case "failed":
    case "refunded":
    case "rejected":
    case "discharged":
      colorClasses = "bg-rose-50 text-rose-700 border-rose-200";
      dotColor = "bg-rose-500";
      break;

    default:
      colorClasses = "bg-slate-100 text-slate-700 border-slate-200";
      dotColor = "bg-slate-400";
      break;
  }

  const formattedLabel = normalized
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${dotColor}`}></span>
      <span>{formattedLabel}</span>
    </span>
  );
}
