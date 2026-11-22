import { useCallback, useEffect, useState, useMemo } from "react";
import { getPendingApprovals, approveUser } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function PendingApprovals({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const loadPendingApprovals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPendingApprovals(token);
      setUsers(data);
    } catch (err) {
      setError(err.message || "Unable to load pending approvals.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPendingApprovals();
  }, [loadPendingApprovals]);

  async function handleApprove(user) {
    if (approvingId !== null) return;

    setApprovingId(user.id);
    setError("");
    setMessage("");

    try {
      await approveUser(token, user.id);
      setUsers((currentUsers) =>
        currentUsers.filter((item) => item.id !== user.id)
      );
      setMessage(`${user.full_name} (${user.role}) was approved successfully.`);
    } catch (err) {
      setError(err.message || "Unable to approve this account.");
    } finally {
      setApprovingId(null);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.phone && u.phone.includes(searchQuery));

      const matchesRole = roleFilter === "all" || u.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

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
  }, [searchQuery, roleFilter, resetPage]);

  const doctorCount = users.filter((u) => u.role === "doctor").length;
  const staffCount = users.filter((u) => u.role === "staff").length;

  return (
    <div className="w-full space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pending Total
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : users.length}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Awaiting credential verification
            </span>
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
              Physicians &amp; Doctors
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : doctorCount}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Clinical practitioners
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Clinical Staff
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {loading ? "..." : staffCount}
            </p>
            <span className="text-xs text-slate-500 mt-1 inline-block">
              Nurses &amp; administrative desk
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs w-full">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white rounded-t-lg relative z-20">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
              Pending Staff &amp; Doctor Approvals
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review credential submissions and authorize hospital clinical access
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search applicants..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="w-36">
              <CustomDropdown
                value={roleFilter}
                onChange={(val) => setRoleFilter(val)}
                options={[
                  { value: "all", label: "All Roles" },
                  { value: "doctor", label: "Doctors Only" },
                  { value: "staff", label: "Staff Only" },
                ]}
                placeholder="All Roles"
              />
            </div>

            <button
              type="button"
              onClick={loadPendingApprovals}
              disabled={loading || approvingId !== null}
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
            <span>Loading applicant records...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            No pending approval requests match your criteria.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Applicant Information</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Verification Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition duration-150">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900 text-xs">
                        {user.full_name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{user.email}</div>
                      {user.phone && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {user.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                          user.role === "doctor"
                            ? "bg-teal-50 text-teal-700 border border-teal-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {user.department_name || (
                        <span className="text-slate-400 italic">Not Assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                        Pending Review
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={approvingId !== null}
                        onClick={() => handleApprove(user)}
                        className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md shadow-xs transition disabled:opacity-50 inline-flex items-center space-x-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{approvingId === user.id ? "Approving..." : "Approve Account"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
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
              <span>Showing {paginatedUsers.length} of {filteredUsers.length} matching applications ({users.length} total)</span>
              <span>Hospital Staff Governance</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
