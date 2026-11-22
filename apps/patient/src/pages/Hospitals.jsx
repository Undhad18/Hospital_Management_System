import { useEffect, useState, useMemo } from "react";
import { getHospitals } from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function Hospitals({ token }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function loadHospitals() {
      try {
        const data = await getHospitals(token);
        if (!cancelled) {
          setHospitals(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load hospitals.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHospitals();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredHospitals = useMemo(() => {
    return hospitals.filter((hospital) => {
      const matchesSearch =
        hospital.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hospital.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (hospital.phone && hospital.phone.includes(searchQuery));

      const matchesStatus =
        statusFilter === "all" || hospital.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [hospitals, searchQuery, statusFilter]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedHospitals,
    resetPage,
  } = usePagination(filteredHospitals, 25);

  useEffect(() => {
    resetPage();
  }, [searchQuery, statusFilter, resetPage]);

  const activeCount = hospitals.filter((h) => h.status === "active").length;
  const inactiveCount = hospitals.filter((h) => h.status === "inactive").length;

  return (
    <div className="w-full space-y-6 font-sans">
      {/* Top Metric Cards - Professional Light Theme */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {/* Total Facilities */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Facilities
            </p>
            <p className="text-3xl font-black text-slate-900 mt-1">
              {loading ? "..." : hospitals.length}
            </p>
            <span className="text-[11px] font-semibold text-sky-600 mt-0.5 inline-block">
              Accredited Centers
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>

        {/* Active Facilities */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Facilities
            </p>
            <p className="text-3xl font-black text-emerald-600 mt-1">
              {loading ? "..." : activeCount}
            </p>
            <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 inline-block">
              Operational Now
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Inactive Facilities */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Inactive Facilities
            </p>
            <p className="text-3xl font-black text-slate-400 mt-1">
              {loading ? "..." : inactiveCount}
            </p>
            <span className="text-[11px] font-semibold text-slate-400 mt-0.5 inline-block">
              Pending / Archived
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-200 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Network Status
            </p>
            <p className="text-3xl font-black text-sky-600 mt-1">
              99.9%
            </p>
            <span className="text-[11px] font-semibold text-sky-600 mt-0.5 inline-block">
              All Systems Operational
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Full-Width Table Card - Light Theme */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 w-full overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Hospital Directory &amp; Network Facilities
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive list of accredited medical centers and clinical locations
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Live Search Input */}
            <div className="relative min-w-[260px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by facility name or code..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 focus:bg-white transition"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filter by Status */}
            <div className="w-40">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active Only" },
                  { value: "inactive", label: "Inactive Only" },
                ]}
                placeholder="All Statuses"
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="py-20 text-center text-slate-500 text-sm flex flex-col items-center justify-center">
            <svg className="animate-spin h-7 w-7 text-sky-600 mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading hospital records...</span>
          </div>
        )}

        {error && (
          <div className="m-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && filteredHospitals.length === 0 && (
          <div className="py-20 text-center text-slate-500 text-sm">
            No hospital records matched your search filters.
          </div>
        )}

        {!loading && !error && filteredHospitals.length > 0 && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Facility Name</th>
                  <th className="px-6 py-3.5">Hospital Code</th>
                  <th className="px-6 py-3.5">Contact Details</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">System ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedHospitals.map((hospital) => (
                  <tr
                    key={hospital.id}
                    className="hover:bg-slate-50/80 transition duration-150"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {hospital.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {hospital.address ? `${hospital.address}, ${hospital.city || ""}` : "Authorized Healthcare Facility"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200">
                        {hospital.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-1.5 text-slate-700 font-medium text-xs">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span>{hospital.phone || "Available 24/7"}</span>
                      </div>
                      {hospital.email && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {hospital.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          hospital.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            hospital.status === "active"
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        ></span>
                        <span className="capitalize">{hospital.status}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">
                      #{hospital.id}
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
          </div>
        )}
      </div>
    </div>
  );
}
