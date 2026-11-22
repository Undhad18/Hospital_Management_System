import { useState, useEffect, useCallback, useMemo } from "react";
import { getUsers, updateUserStatus } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function UserManagement({ token, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getUsers(token);
      setUsers(data);
    } catch (err) {
      setError(err.message || "Unable to load hospital users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleStatusChange(targetUser, newStatus) {
    if (updatingId !== null) return;
    if (targetUser.id === currentUserId) {
      setError("You cannot change your own account status.");
      return;
    }

    setUpdatingId(targetUser.id);
    setError("");
    setMessage("");

    try {
      await updateUserStatus(token, targetUser.id, newStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, status: newStatus } : u))
      );
      setMessage(
        `${targetUser.full_name}'s account has been updated to ${newStatus}.`
      );
    } catch (err) {
      setError(err.message || "Failed to update account status.");
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.phone && u.phone.includes(searchQuery));

      const matchesRole = filterRole === "all" || u.role === filterRole;
      const matchesStatus = filterStatus === "all" || u.status === filterStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, filterRole, filterStatus]);

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
  }, [searchQuery, filterRole, filterStatus, resetPage]);

  // Metrics
  const activeCount = users.filter((u) => u.status === "active").length;
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const inactiveCount = users.filter((u) => u.status === "inactive" || u.status === "suspended").length;

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
      case "super_admin":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-white">
            Super Admin
          </span>
        );
      case "hospital_admin":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
            Hospital Admin
          </span>
        );
      case "doctor":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-200">
            Doctor
          </span>
        );
      case "staff":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            Staff
          </span>
        );
      case "patient":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
            Patient
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {role?.replace("_", " ") || "User"}
          </span>
        );
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Accounts
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : users.length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Hospital personnel &amp; users
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Active Users
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : activeCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span>
                Authorized
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pending Verification
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : pendingCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                Awaiting Approval
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Deactivated / Suspended
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : inactiveCount}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Access Revoked
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white rounded-t-lg relative z-20">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
              User Accounts &amp; Access Governance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Activate, deactivate, or suspend system accounts with automatic JWT session revocation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Live Search Input */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter by Role */}
            <div className="w-44">
              <CustomDropdown
                value={filterRole}
                onChange={(val) => setFilterRole(val)}
                options={[
                  { value: "all", label: "All Roles" },
                  { value: "hospital_admin", label: "Hospital Admin" },
                  { value: "doctor", label: "Doctors" },
                  { value: "staff", label: "Staff" },
                  { value: "patient", label: "Patients" },
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
                  { value: "active", label: "Active" },
                  { value: "pending", label: "Pending" },
                  { value: "inactive", label: "Inactive" },
                  { value: "suspended", label: "Suspended" },
                ]}
                placeholder="All Statuses"
              />
            </div>

            <button
              type="button"
              onClick={loadUsers}
              disabled={loading || updatingId !== null}
              className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-md text-xs font-medium text-slate-700 disabled:opacity-50 transition shadow-xs"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
            <span className="font-medium">{error}</span>
            <button onClick={() => setError("")} className="font-bold text-rose-500">×</button>
          </div>
        )}

        {message && (
          <div className="m-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
            <span className="font-medium">{message}</span>
            <button onClick={() => setMessage("")} className="font-bold text-emerald-500">×</button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <svg className="animate-spin h-6 w-6 text-sky-600 mb-2.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Retrieving user accounts...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            No user accounts found matching your selected filters.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-left text-xs text-slate-700 border-collapse">
              <colgroup>
                <col className="w-[32%] min-w-[240px]" />
                <col className="w-[14%] min-w-[120px]" />
                <col className="w-[20%] min-w-[160px]" />
                <col className="w-[14%] min-w-[110px]" />
                <col className="w-[20%] min-w-[220px]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">User Information</th>
                  <th className="px-4 py-3 text-left">Assigned Role</th>
                  <th className="px-4 py-3 text-left">Hospital / Dept</th>
                  <th className="px-4 py-3 text-center">Account Status</th>
                  <th className="px-5 py-3 text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {paginatedUsers.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const isUpdating = updatingId === user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900 text-xs flex items-center space-x-2">
                          <span>{user.full_name}</span>
                          {isSelf && (
                            <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                              Current User
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{user.email}</div>
                        {user.phone && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {user.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 text-xs truncate">
                          {user.hospital_name || (user.hospital_id ? `Hospital #${user.hospital_id}` : "System Wide")}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {user.department_name || "General"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(user.status)}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {isSelf ? (
                          <div className="inline-flex items-center justify-end">
                            <span className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-50 text-slate-400 border border-slate-200 whitespace-nowrap shadow-2xs cursor-not-allowed">
                              Self Account
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
                            {user.status !== "active" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(user, "active")}
                                className="px-2.5 py-1 text-[11px] font-medium rounded text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 disabled:opacity-50 transition cursor-pointer whitespace-nowrap shadow-2xs"
                              >
                                {isUpdating ? "Saving..." : "Activate"}
                              </button>
                            )}

                            {user.status !== "inactive" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(user, "inactive")}
                                className="px-2.5 py-1 text-[11px] font-medium rounded text-amber-700 bg-white hover:bg-amber-50 border border-amber-200 disabled:opacity-50 transition cursor-pointer whitespace-nowrap shadow-2xs"
                              >
                                {isUpdating ? "Saving..." : "Deactivate"}
                              </button>
                            )}

                            {user.status !== "suspended" && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handleStatusChange(user, "suspended")}
                                className="px-2.5 py-1 text-[11px] font-medium rounded text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 disabled:opacity-50 transition cursor-pointer whitespace-nowrap shadow-2xs"
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

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalRecords}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />

            <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {paginatedUsers.length} of {filteredUsers.length} matching accounts ({users.length} total)</span>
              <span>Identity Provider Synced</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
