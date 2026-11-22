import { useState, useEffect, useCallback, useMemo } from "react";
import { getUsers, updateUserStatus } from "../services/api";
import CreateDoctorModal from "./CreateDoctorModal";
import DoctorProfileModal from "./DoctorProfileModal";
import CreateStaffModal from "./CreateStaffModal";
import StaffProfileModal from "./StaffProfileModal";
import CredentialDispatchModal from "./CredentialDispatchModal";
import { subscribeToEvent } from "../services/socket";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function UserManagement({ token, currentUserId, hospitalId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDelivery, setFilterDelivery] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [showCreateDoctorModal, setShowCreateDoctorModal] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState(null);
  const [showCreateStaffModal, setShowCreateStaffModal] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [selectedCredentialUser, setSelectedCredentialUser] = useState(null);

  // Confirmation dialog state for sensitive lifecycle actions
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    user: null,
    targetStatus: null,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getUsers(token);
      setUsers(data);
    } catch (err) {
      setError(err.message || "Unable to load hospital users directory.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Real-time synchronization for hospital staff and doctors
  useEffect(() => {
    if (!token) return;

    const unsub = subscribeToEvent(
      "staff:updated",
      () => {
        loadUsers();
      },
      token
    );

    return () => {
      unsub();
    };
  }, [token, loadUsers]);

  async function handleStatusChange(targetUser, newStatus) {
    if (updatingId !== null) return;
    if (targetUser.id === currentUserId) {
      setError("You cannot alter your own administrative session status.");
      return;
    }

    setUpdatingId(targetUser.id);
    setError("");
    setMessage("");

    try {
      await updateUserStatus(token, targetUser.id, newStatus);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, status: newStatus } : u
        )
      );
      setMessage(
        `${targetUser.full_name}'s account has been successfully set to ${newStatus.toUpperCase()}.`
      );
    } catch (err) {
      setError(err.message || "Failed to update account status.");
    } finally {
      setUpdatingId(null);
      setConfirmDialog({ isOpen: false, user: null, targetStatus: null });
    }
  }

  function promptStatusChange(user, targetStatus) {
    if (targetStatus === "active") {
      handleStatusChange(user, targetStatus);
      return;
    }
    setConfirmDialog({
      isOpen: true,
      user,
      targetStatus,
    });
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.employee_id && u.employee_id.toLowerCase().includes(q)) ||
        (u.department_name && u.department_name.toLowerCase().includes(q)) ||
        (u.designation_name && u.designation_name.toLowerCase().includes(q));

      const matchesRole = filterRole === "all" || u.role === filterRole;
      const matchesStatus =
        filterStatus === "all" || u.status === filterStatus;
      const matchesDelivery =
        filterDelivery === "all" ||
        (filterDelivery === "sent" && u.credential_delivery_status === "sent") ||
        (filterDelivery === "not_sent" &&
          (!u.credential_delivery_status ||
            u.credential_delivery_status === "not_sent")) ||
        (filterDelivery === "failed" &&
          u.credential_delivery_status === "failed");

      return matchesSearch && matchesRole && matchesStatus && matchesDelivery;
    });
  }, [users, searchQuery, filterRole, filterStatus, filterDelivery]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedUsers,
    resetPage,
  } = usePagination(filteredUsers, 25);

  useEffect(() => {
    resetPage();
  }, [searchQuery, filterRole, filterStatus, filterDelivery, resetPage]);

  // Key metrics calculation
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.status === "active").length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const inactiveCount = users.filter(
    (u) => u.status === "inactive" || u.status === "suspended"
  ).length;
  const credsSentCount = users.filter(
    (u) => u.credential_delivery_status === "sent"
  ).length;

  // Helper to generate initials
  function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // Helper for role avatar styling
  function getAvatarStyle(role) {
    switch (role) {
      case "doctor":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "staff":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "hospital_admin":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "patient":
        return "bg-cyan-50 text-cyan-700 border-cyan-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            Active
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            Pending
          </span>
        );
      case "suspended":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
            Suspended
          </span>
        );
      case "inactive":
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
            Inactive
          </span>
        );
    }
  }

  function getRoleBadge(role) {
    switch (role) {
      case "doctor":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            Doctor
          </span>
        );
      case "staff":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            Staff
          </span>
        );
      case "hospital_admin":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            Hospital Admin
          </span>
        );
      case "patient":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            Patient
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            {role?.replace("_", " ") || "User"}
          </span>
        );
    }
  }

  function getDeliveryBadge(user) {
    if (user.credential_delivery_status === "sent") {
      return (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
          title={`Dispatched: ${user.credentials_sent_at ? new Date(user.credentials_sent_at).toLocaleString() : "Confirmed"}`}
        >
          Sent
        </span>
      );
    }
    if (user.credential_delivery_status === "failed") {
      return (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap"
          title="Last credential dispatch failed"
        >
          Failed
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200 whitespace-nowrap"
        title="Credentials have not been dispatched yet"
      >
        Not Sent
      </span>
    );
  }

  return (
    <div className="w-full space-y-6 max-w-7xl mx-auto px-1">
      {/* Top Header & Breadcrumb Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Personnel &amp; User Access Management</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Hospital Admin
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authorize healthcare practitioners, operational personnel, credential distribution, and RBAC security policies.
          </p>
        </div>

        {/* Global Onboarding Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateDoctorModal(true)}
            className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-xs cursor-pointer focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Onboard Doctor</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateStaffModal(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-xs cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Onboard Staff</span>
          </button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {/* Card 1: Total Directory */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between hover:border-slate-300 transition">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Personnel
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? (
                <span className="inline-block w-8 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                totalCount
              )}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{credsSentCount}</span> credentials dispatched
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200 shadow-2xs">
            <svg
              className="w-5 h-5 text-slate-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Active Authorized */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between hover:border-emerald-300 transition">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Active Authorized
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? (
                <span className="inline-block w-8 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                activeCount
              )}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Full privileges active
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
            <svg
              className="w-5 h-5 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>

        {/* Card 3: Pending Verification */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between hover:border-amber-300 transition">
          <div>
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Pending Onboarding
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? (
                <span className="inline-block w-8 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                pendingCount
              )}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-amber-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Awaiting verification
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-2xs">
            <svg
              className="w-5 h-5 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        {/* Card 4: Access Revoked */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between hover:border-rose-300 transition">
          <div>
            <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
              Revoked / Suspended
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? (
                <span className="inline-block w-8 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                inactiveCount
              )}
            </p>
            <div className="flex items-center gap-1 mt-1 text-xs text-rose-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Sessions disabled by policy
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center border border-rose-200 shadow-2xs">
            <svg
              className="w-5 h-5 text-rose-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filter & Search Toolbar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-t-xl relative z-20">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, phone, badge ID, department..."
                className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition shadow-2xs"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter by Role */}
            <div className="w-44">
              <CustomDropdown
                value={filterRole}
                onChange={(val) => setFilterRole(val)}
                options={[
                  { value: "all", label: `All Roles (${users.length})` },
                  { value: "doctor", label: `Doctors (${users.filter((u) => u.role === "doctor").length})` },
                  { value: "staff", label: `Staff (${users.filter((u) => u.role === "staff").length})` },
                  { value: "hospital_admin", label: `Hospital Admins (${users.filter((u) => u.role === "hospital_admin").length})` },
                  { value: "patient", label: `Patients (${users.filter((u) => u.role === "patient").length})` },
                ]}
                placeholder="All Roles"
              />
            </div>

            {/* Filter by Status */}
            <div className="w-40">
              <CustomDropdown
                value={filterStatus}
                onChange={(val) => setFilterStatus(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active Only" },
                  { value: "pending", label: "Pending Only" },
                  { value: "inactive", label: "Inactive Only" },
                  { value: "suspended", label: "Suspended Only" },
                ]}
                placeholder="All Statuses"
              />
            </div>

            {/* Filter by Credential Status */}
            <div className="w-44">
              <CustomDropdown
                value={filterDelivery}
                onChange={(val) => setFilterDelivery(val)}
                options={[
                  { value: "all", label: "All Delivery States" },
                  { value: "sent", label: "Credentials Sent" },
                  { value: "not_sent", label: "Not Sent" },
                  { value: "failed", label: "Failed Delivery" },
                ]}
                placeholder="All Delivery States"
              />
            </div>

            {/* Reset Filters */}
            {(searchQuery ||
              filterRole !== "all" ||
              filterStatus !== "all" ||
              filterDelivery !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterRole("all");
                  setFilterStatus("all");
                  setFilterDelivery("all");
                }}
                className="px-2.5 py-1.5 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Refresh Action */}
          <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading || updatingId !== null}
              className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50 cursor-pointer"
              title="Refresh personnel list from server"
            >
              <svg
                className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin text-sky-600" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Notifications */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
            <button
              onClick={() => setError("")}
              className="text-rose-500 hover:text-rose-700 font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="mx-4 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">{message}</span>
            </div>
            <button
              onClick={() => setMessage("")}
              className="text-emerald-500 hover:text-emerald-700 font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Table View */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <svg
              className="animate-spin h-7 w-7 text-sky-600 mb-3"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <span className="font-medium text-slate-700">Loading hospital personnel records...</span>
            <span className="text-slate-400 mt-1">Retrieving verified profiles and credentials</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800 text-sm">No personnel accounts found</p>
            <p className="text-slate-400 text-xs mt-1 max-w-sm">
              We couldn&apos;t find any records matching your current filter criteria. Try adjusting your search term or filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterRole("all");
                setFilterStatus("all");
                setFilterDelivery("all");
              }}
              className="mt-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-xs text-slate-700">
              <colgroup>
                <col className="w-[24%] min-w-[210px]" />
                <col className="w-[10%] min-w-[95px]" />
                <col className="w-[15%] min-w-[140px]" />
                <col className="w-[9%] min-w-[85px]" />
                <col className="w-[9%] min-w-[85px]" />
                <col className="w-[33%] min-w-[380px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                  <th className="py-3 px-4 text-left">
                    User Details
                  </th>
                  <th className="py-3 px-4 text-left">
                    Role
                  </th>
                  <th className="py-3 px-4 text-left">
                    Department &amp; Designation
                  </th>
                  <th className="py-3 px-3 text-center">
                    Status
                  </th>
                  <th className="py-3 px-3 text-center">
                    Credentials
                  </th>
                  <th className="py-3 px-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedUsers.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isUpdating = updatingId === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/70 transition"
                    >
                      {/* 1. User Name & Contact Details */}
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center gap-3">
                          {/* Monogram Avatar */}
                          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-semibold text-xs bg-slate-100 text-slate-700 border border-slate-200/80">
                            {getInitials(user.full_name)}
                          </div>

                          {/* Text Information */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                                {user.full_name}
                              </span>
                              {isSelf && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-400 mt-0.5 truncate" title={user.email}>
                              {user.email} {user.phone && `• ${user.phone}`}
                            </div>

                            {/* Doctor Clinical Metadata */}
                            {user.role === "doctor" && (
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 font-normal">
                                <span className="font-medium text-slate-700">
                                  ₹{user.consultation_fee !== null && user.consultation_fee !== undefined
                                    ? Number(user.consultation_fee).toFixed(0)
                                    : "0"}
                                  /consult
                                </span>
                                {user.experience_years !== null && user.experience_years !== undefined && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span>{user.experience_years}y exp</span>
                                  </>
                                )}
                                {user.specialization && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="capitalize">{user.specialization}</span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Staff Operational Metadata */}
                            {user.role === "staff" && (
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 font-normal">
                                {user.employee_id && <span>Badge: {user.employee_id}</span>}
                                {user.shift_timing && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span>{user.shift_timing}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Role */}
                      <td className="py-3 px-4 align-middle">
                        <div className="flex items-center">
                          {getRoleBadge(user.role)}
                        </div>
                      </td>

                      {/* 3. Department & Designation */}
                      <td className="py-3 px-4 align-middle">
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-800 text-xs truncate" title={user.department_name || "General Unit"}>
                            {user.department_name || "General Unit"}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate" title={user.designation_name || "Standard Role"}>
                            {user.designation_name || "Standard Role"}
                          </div>
                        </div>
                      </td>

                      {/* 4. Account Status */}
                      <td className="py-3 px-3 align-middle text-center">
                        <div className="flex items-center justify-center">
                          {getStatusBadge(user.status)}
                        </div>
                      </td>

                      {/* 5. Credentials Status */}
                      <td className="py-3 px-3 align-middle text-center">
                        <div className="flex items-center justify-center">
                          {getDeliveryBadge(user)}
                        </div>
                      </td>

                      {/* 6. Action Controls (Clean outline buttons matching Image 2 hospital theme) */}
                      <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                        {isSelf ? (
                          <div className="inline-flex items-center justify-end">
                            <span className="inline-flex items-center px-2.5 py-1 text-[11px] font-medium text-slate-400 bg-slate-50 rounded border border-slate-200 whitespace-nowrap">
                              Self Account
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
                            {/* Send Credentials Button */}
                            {(user.role === "doctor" || user.role === "staff") && (
                              <button
                                type="button"
                                onClick={() => setSelectedCredentialUser(user)}
                                className="px-2.5 py-1 text-[11px] font-medium text-sky-700 bg-white hover:bg-sky-50 rounded border border-sky-200 transition cursor-pointer whitespace-nowrap shadow-2xs"
                                title="Dispatch login credentials via email"
                              >
                                {user.credential_delivery_status === "sent"
                                  ? "Resend"
                                  : "Send Creds"}
                              </button>
                            )}

                            {/* Doctor Clinical Profile & Credentials Modal */}
                            {user.role === "doctor" && (
                              <button
                                type="button"
                                onClick={() => setSelectedDoctorId(user.id)}
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 rounded border border-slate-200 transition cursor-pointer whitespace-nowrap shadow-2xs"
                                title="View & edit doctor profile, consultation fees, and qualifications"
                              >
                                Credentials
                              </button>
                            )}

                            {/* Staff Profile & RBAC Permissions Modal */}
                            {user.role === "staff" && (
                              <button
                                type="button"
                                onClick={() => setSelectedStaffId(user.id)}
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 rounded border border-slate-200 transition cursor-pointer whitespace-nowrap shadow-2xs"
                                title="Manage staff duty shifts and granular RBAC permissions"
                              >
                                Permissions
                              </button>
                            )}

                            {/* Activate Button (for pending, inactive, suspended) */}
                            {user.status !== "active" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => promptStatusChange(user, "active")}
                                className="px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-white hover:bg-emerald-50 rounded border border-emerald-200 transition cursor-pointer whitespace-nowrap shadow-2xs disabled:opacity-50"
                                title="Activate user account"
                              >
                                {isUpdating ? "Saving..." : "Activate"}
                              </button>
                            )}

                            {/* Deactivate Button (if active or suspended) */}
                            {user.status !== "inactive" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => promptStatusChange(user, "inactive")}
                                className="px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-white hover:bg-amber-50 rounded border border-amber-200 transition cursor-pointer whitespace-nowrap shadow-2xs disabled:opacity-50"
                                title="Deactivate user account"
                              >
                                {isUpdating ? "Saving..." : "Deactivate"}
                              </button>
                            )}

                            {/* Suspend Button (if active or inactive) */}
                            {user.status !== "suspended" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => promptStatusChange(user, "suspended")}
                                className="px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-white hover:bg-rose-50 rounded border border-rose-200 transition cursor-pointer whitespace-nowrap shadow-2xs disabled:opacity-50"
                                title="Suspend user and revoke active tokens"
                              >
                                {isUpdating ? "Saving..." : "Suspend"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />

            {/* Table Footer Summary */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">
                  Showing {paginatedUsers.length} of {filteredUsers.length} accounts ({users.length} total)
                </span>
                {(filterRole !== "all" ||
                  filterStatus !== "all" ||
                  filterDelivery !== "all" ||
                  searchQuery) && (
                  <span className="text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 font-medium">
                    Filtered
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>Hospital Personnel Management</span>
                <span>•</span>
                <span>RBAC &amp; Session Control Active</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Modal for Sensitive Status Actions */}
      {confirmDialog.isOpen && confirmDialog.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmDialog.targetStatus === "suspended"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-amber-100 text-amber-600"
                }`}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {confirmDialog.targetStatus === "suspended"
                    ? "Suspend Account Access?"
                    : "Deactivate User Account?"}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to transition{" "}
                  <strong className="text-slate-900">
                    {confirmDialog.user.full_name}
                  </strong>{" "}
                  to{" "}
                  <span className="font-semibold uppercase tracking-wider">
                    {confirmDialog.targetStatus}
                  </span>
                  ?
                </p>
                <p className="text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  {confirmDialog.targetStatus === "suspended"
                    ? "This will immediately invalidate all active JWT authorization sessions and block login access across all portals."
                    : "The user will be marked inactive and prevented from signing into hospital services until reactivated by an administrator."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-150">
              <button
                type="button"
                onClick={() =>
                  setConfirmDialog({
                    isOpen: false,
                    user: null,
                    targetStatus: null,
                  })
                }
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingId !== null}
                onClick={() =>
                  handleStatusChange(
                    confirmDialog.user,
                    confirmDialog.targetStatus
                  )
                }
                className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition shadow-xs cursor-pointer disabled:opacity-50 ${
                  confirmDialog.targetStatus === "suspended"
                    ? "bg-rose-600 hover:bg-rose-700 focus:ring-2 focus:ring-rose-500"
                    : "bg-slate-800 hover:bg-slate-900 focus:ring-2 focus:ring-slate-700"
                }`}
              >
                {updatingId !== null
                  ? "Processing..."
                  : confirmDialog.targetStatus === "suspended"
                  ? "Yes, Suspend Account"
                  : "Yes, Deactivate Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Onboarding Modal */}
      <CreateDoctorModal
        token={token}
        hospitalId={hospitalId}
        isOpen={showCreateDoctorModal}
        onClose={() => setShowCreateDoctorModal(false)}
        onSuccess={() => {
          loadUsers();
          setMessage(
            "Doctor account registered successfully with pending approval status."
          );
        }}
      />

      {/* Doctor Clinical Profile & Credentials Modal */}
      <DoctorProfileModal
        token={token}
        doctorId={selectedDoctorId}
        isOpen={selectedDoctorId !== null}
        onClose={() => setSelectedDoctorId(null)}
        onUpdated={() => {
          loadUsers();
          setMessage(
            "Doctor clinical profile and credentials updated successfully."
          );
        }}
      />

      {/* Staff Onboarding Modal */}
      <CreateStaffModal
        token={token}
        hospitalId={hospitalId}
        isOpen={showCreateStaffModal}
        onClose={() => setShowCreateStaffModal(false)}
        onSuccess={() => {
          loadUsers();
          setMessage(
            "Staff account created successfully with pending authorization status."
          );
        }}
      />

      {/* Staff Profile & Granular Permissions Modal */}
      <StaffProfileModal
        token={token}
        staffId={selectedStaffId}
        isOpen={selectedStaffId !== null}
        onClose={() => setSelectedStaffId(null)}
        onUpdated={() => {
          loadUsers();
          setMessage(
            "Staff profile and RBAC permissions updated successfully."
          );
        }}
      />

      {/* Credential Dispatch Modal */}
      <CredentialDispatchModal
        token={token}
        user={selectedCredentialUser}
        isOpen={selectedCredentialUser !== null}
        onClose={() => setSelectedCredentialUser(null)}
        onDispatched={(res) => {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === res.id
                ? {
                    ...u,
                    credential_delivery_status: "sent",
                    credentials_sent_at: res.credentials_sent_at,
                    status: u.status === "pending" ? "active" : u.status,
                  }
                : u
            )
          );
          setMessage(
            `Onboarding credentials successfully dispatched to ${res.email}`
          );
        }}
      />
    </div>
  );
}
