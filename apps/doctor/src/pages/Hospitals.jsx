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
          setHospitals(data);
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
    <div className="w-full space-y-5 font-sans">
      {/* ======================= COMPACT KPI TILES ======================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        <div className="ent-kpi">
          <p className="ent-kpi-title">Total Network Facilities</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-900">
              {loading ? "..." : hospitals.length}
            </span>
            <span className="text-xs font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
              Federated
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Hospitals across network</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Active Facilities</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-emerald-700">
              {loading ? "..." : activeCount}
            </span>
            <span className="ent-chip-active text-[10px]">Operational</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Accepting clinical referrals</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">Inactive Facilities</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="ent-kpi-value text-slate-600">
              {loading ? "..." : inactiveCount}
            </span>
            <span className="ent-chip-inactive text-[10px]">Suspended</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Under maintenance or pending</p>
        </div>

        <div className="ent-kpi">
          <p className="ent-kpi-title">System Mesh Telemetry</p>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-xl font-bold text-slate-900">99.9% Uptime</span>
            <span className="ent-chip-active text-[10px]">Healthy</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Distributed node sync active</p>
        </div>
      </div>

      {/* ======================= ENTERPRISE DATA TABLE ======================= */}
      <div className="ent-card">
        <div className="ent-card-header flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-20">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Hospital Network Directory
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified healthcare facilities and institutional contacts in the HealthMesh network
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search facility name or code..."
                className="ent-input pl-8 text-xs"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="w-36">
              <CustomDropdown
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "active", label: "Active Only" },
                  { value: "inactive", label: "Inactive Only" },
                ]}
              />
            </div>
          </div>
        </div>

        {loading && (
          <div className="py-14 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <svg className="animate-spin h-5 w-5 text-sky-600 mb-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading hospital records...</span>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => {
                if (error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz")) {
                  sessionStorage.removeItem("hms_session");
                  localStorage.removeItem("hms_session");
                  window.location.reload();
                } else {
                  window.location.reload();
                }
              }}
              className="ent-btn-secondary text-xs"
            >
              {error.toLowerCase().includes("token") || error.toLowerCase().includes("authoriz") ? "Sign In Again" : "Retry"}
            </button>
          </div>
        )}

        {!loading && !error && filteredHospitals.length === 0 && (
          <div className="py-12 text-center text-slate-500 text-xs">
            No hospital records match the specified filters.
          </div>
        )}

        {!loading && !error && filteredHospitals.length > 0 && (
          <div className="w-full overflow-x-auto">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Facility Name</th>
                  <th>Hospital Code</th>
                  <th>Contact Details</th>
                  <th>Status</th>
                  <th className="text-right">System ID</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHospitals.map((hospital) => (
                  <tr key={hospital.id}>
                    <td>
                      <div className="font-semibold text-slate-900">
                        {hospital.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Licensed Healthcare Institution
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {hospital.code}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs text-slate-700">
                        {hospital.phone || "No phone listed"}
                      </div>
                      {hospital.email && (
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          {hospital.email}
                        </div>
                      )}
                    </td>
                    <td>
                      {hospital.status === "active" ? (
                        <span className="ent-chip-active">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="ent-chip-inactive">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          <span>Inactive</span>
                        </span>
                      )}
                    </td>
                    <td className="text-right font-mono text-xs text-slate-500">
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
