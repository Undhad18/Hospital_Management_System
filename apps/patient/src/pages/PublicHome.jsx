import React, { useState, useEffect } from "react";
import { getHospitals } from "../services/api";
import Pagination, { usePagination } from "../components/Pagination";

export default function PublicHome({ onNavigateLogin, onNavigateRegister }) {
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchHospitals() {
      try {
        const data = await getHospitals();
        if (!cancelled) {
          setHospitals(Array.isArray(data) ? data.filter((h) => h.status === "active") : []);
        }
      } catch (err) {
        if (!cancelled) setHospitals([]);
      } finally {
        if (!cancelled) setLoadingHospitals(false);
      }
    }
    fetchHospitals();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalRecords,
    paginatedItems: paginatedHospitals,
  } = usePagination(hospitals, 25);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between">
      {/* Public Header / Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo */}
            <div className="flex items-center space-x-3 cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-600/20 font-black text-xl">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 block leading-tight">
                  Health<span className="text-sky-600">Mesh</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block">
                  Public Healthcare Network
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={onNavigateLogin}
                className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-700 hover:text-sky-600 hover:bg-slate-100 transition"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={onNavigateRegister}
                className="px-4 py-2 rounded-lg text-xs sm:text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs shadow-sky-600/30 transition flex items-center space-x-1.5"
              >
                <span>Register as Patient</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-12 sm:py-20 lg:py-24 bg-gradient-to-b from-sky-50/60 to-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-5">
            <span className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold uppercase tracking-wider">
              <span>●</span>
              <span>24/7 Verified Healthcare Network</span>
            </span>

            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Modern Patient Care, Accessible to Everyone.
            </h1>

            <p className="text-sm sm:text-lg text-slate-600 leading-relaxed">
              Book consultations, access your laboratory investigations, manage digital prescriptions, and track health records across our accredited network of hospitals and clinical departments.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={onNavigateLogin}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/25 transition flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Book Doctor Appointment</span>
              </button>

              <button
                type="button"
                onClick={onNavigateRegister}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 shadow-xs transition flex items-center justify-center space-x-2"
              >
                <span>Create Patient Account</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Network Facilities & Hospitals */}
      <section className="py-12 sm:py-16 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Our Network Hospitals & Facilities
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              Browse accredited multi-specialty hospitals and healthcare centers operating within the HealthMesh network.
            </p>
          </div>

          {loadingHospitals ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-xs font-semibold text-slate-500">Loading network hospitals...</span>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 max-w-lg mx-auto">
              <p className="text-sm font-semibold text-slate-600">No active network facilities registered yet.</p>
              <p className="text-xs text-slate-400 mt-1">Please check back soon as facilities are onboarded.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedHospitals.map((h) => (
                  <div
                    key={h.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md hover:border-sky-300 transition flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm border border-sky-100">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active Facility
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-base text-slate-900">{h.name}</h3>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">Code: {h.code || "HOSP"}</p>
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2">
                        {h.address ? `${h.address}, ${h.city || ""}` : "Accredited Multi-Specialty Facility"}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">
                        📞 {h.phone || "Available 24/7"}
                      </span>
                      <button
                        type="button"
                        onClick={onNavigateLogin}
                        className="text-xs font-bold text-sky-600 hover:text-sky-800 transition flex items-center space-x-1"
                      >
                        <span>Book at Facility</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Public Website Hospital Pagination */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalRecords={totalRecords}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Patient Features Grid */}
      <section className="py-12 sm:py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Patient Services & Digital Healthcare
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-2">
              Everything you need to manage your personal and family medical journey.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                📅
              </div>
              <h3 className="font-bold text-sm text-slate-900">OPD Appointments</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Schedule consultations with specialists, select available time slots, and receive instant booking confirmations.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                📋
              </div>
              <h3 className="font-bold text-sm text-slate-900">Medical Records</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Review consultation clinical summaries, treatment diagnoses, and verified laboratory investigation reports securely.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                💊
              </div>
              <h3 className="font-bold text-sm text-slate-900">E-Prescriptions</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Access digital medicine prescriptions with dosage schedules and instructions directly from your licensed doctor.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                💳
              </div>
              <h3 className="font-bold text-sm text-slate-900">Bills & Receipts</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                View itemized invoices for consultation fees and medicine formulary purchases with statutory 12% GST breakdown.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Public Footer */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700">HealthMesh HMS</span>
            <span>•</span>
            <span>Public Healthcare Patient Portal</span>
          </div>
          <div>
            <span>Emergency Helpline: 108 / 112 • Available 24/7/365</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

