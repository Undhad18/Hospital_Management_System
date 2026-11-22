import { useEffect, useState, useMemo } from "react";
import {
  getCountries,
  createCountry,
  updateCountry,
  getStates,
  createState,
  updateState,
  getCities,
  createCity,
  updateCity,
} from "../services/api";
import CustomDropdown from "../components/CustomDropdown";
import Pagination, { usePagination } from "../components/Pagination";

export default function Locations({ token }) {
  const [activeTab, setActiveTab] = useState("countries"); // 'countries' | 'states' | 'cities'

  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Country modal
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countryForm, setCountryForm] = useState({ name: "", code: "", phone_code: "" });
  const [selectedCountry, setSelectedCountry] = useState(null);

  // State modal
  const [showStateModal, setShowStateModal] = useState(false);
  const [stateForm, setStateForm] = useState({ country_id: "", name: "", code: "" });
  const [selectedState, setSelectedState] = useState(null);

  // City modal
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityForm, setCityForm] = useState({ country_id: "", state_id: "", name: "" });
  const [selectedCity, setSelectedCity] = useState(null);

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  useEffect(() => {
    loadAllData();
  }, [token]);

  async function loadAllData() {
    setLoading(true);
    setError("");
    try {
      const [cData, sData, ciData] = await Promise.all([
        getCountries(token),
        getStates(token),
        getCities(token),
      ]);
      setCountries(cData);
      setStates(sData);
      setCities(ciData);
    } catch (err) {
      setError(err.message || "Failed to load geographic master records.");
    } finally {
      setLoading(false);
    }
  }

  // Filtered lists
  const filteredCountries = useMemo(() => {
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [countries, search]);

  const filteredStates = useMemo(() => {
    return states.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.code && s.code.toLowerCase().includes(search.toLowerCase())) ||
        s.country_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [states, search]);

  const filteredCities = useMemo(() => {
    return cities.filter(
      (ci) =>
        ci.name.toLowerCase().includes(search.toLowerCase()) ||
        ci.state_name.toLowerCase().includes(search.toLowerCase()) ||
        ci.country_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [cities, search]);

  const {
    currentPage: countryPage,
    setCurrentPage: setCountryPage,
    pageSize: countryPageSize,
    setPageSize: setCountryPageSize,
    totalPages: countryTotalPages,
    totalRecords: countryTotalRecords,
    paginatedItems: paginatedCountries,
    resetPage: resetCountryPage,
  } = usePagination(filteredCountries, 25);

  const {
    currentPage: statePage,
    setCurrentPage: setStatePage,
    pageSize: statePageSize,
    setPageSize: setStatePageSize,
    totalPages: stateTotalPages,
    totalRecords: stateTotalRecords,
    paginatedItems: paginatedStates,
    resetPage: resetStatePage,
  } = usePagination(filteredStates, 25);

  const {
    currentPage: cityPage,
    setCurrentPage: setCityPage,
    pageSize: cityPageSize,
    setPageSize: setCityPageSize,
    totalPages: cityTotalPages,
    totalRecords: cityTotalRecords,
    paginatedItems: paginatedCities,
    resetPage: resetCityPage,
  } = usePagination(filteredCities, 25);

  useEffect(() => {
    resetCountryPage();
    resetStatePage();
    resetCityPage();
  }, [search, activeTab, resetCountryPage, resetStatePage, resetCityPage]);

  // Handle Country Submit
  async function handleCountrySubmit(e) {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");
    setSaving(true);
    try {
      if (selectedCountry) {
        await updateCountry(token, selectedCountry.id, countryForm);
        setActionSuccess("Country record updated!");
      } else {
        await createCountry(token, countryForm);
        setActionSuccess("New country master record created!");
      }
      setShowCountryModal(false);
      setSelectedCountry(null);
      await loadAllData();
    } catch (err) {
      setActionError(err.message || "Failed to save country.");
    } finally {
      setSaving(false);
    }
  }

  // Handle State Submit
  async function handleStateSubmit(e) {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");
    setSaving(true);
    try {
      if (selectedState) {
        await updateState(token, selectedState.id, {
          name: stateForm.name,
          code: stateForm.code,
          country_id: stateForm.country_id,
        });
        setActionSuccess("State record updated!");
      } else {
        await createState(token, stateForm);
        setActionSuccess("New state master record created!");
      }
      setShowStateModal(false);
      setSelectedState(null);
      await loadAllData();
    } catch (err) {
      setActionError(err.message || "Failed to save state.");
    } finally {
      setSaving(false);
    }
  }

  // Handle City Submit
  async function handleCitySubmit(e) {
    e.preventDefault();
    setActionError("");
    setActionSuccess("");
    setSaving(true);
    try {
      if (selectedCity) {
        await updateCity(token, selectedCity.id, {
          country_id: cityForm.country_id,
          state_id: cityForm.state_id,
          name: cityForm.name,
        });
        setActionSuccess("City record updated!");
      } else {
        await createCity(token, cityForm);
        setActionSuccess("New city master record created!");
      }
      setShowCityModal(false);
      setSelectedCity(null);
      await loadAllData();
    } catch (err) {
      setActionError(err.message || "Failed to save city.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCountryStatus(country) {
    const newStatus = country.status === "active" ? "inactive" : "active";
    try {
      await updateCountry(token, country.id, { status: newStatus });
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStateStatus(state) {
    const newStatus = state.status === "active" ? "inactive" : "active";
    try {
      await updateState(token, state.id, { status: newStatus });
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleCityStatus(city) {
    const newStatus = city.status === "active" ? "inactive" : "active";
    try {
      await updateCity(token, city.id, { status: newStatus });
      await loadAllData();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Countries Master</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "..." : countries.length}</p>
            <span className="text-xs text-slate-500 mt-1 inline-block">Global jurisdictions</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200">
            <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">States &amp; Provinces</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "..." : states.length}</p>
            <span className="text-xs text-slate-500 mt-1 inline-block">Regional territories</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cities &amp; Municipalities</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "..." : cities.length}</p>
            <span className="text-xs text-slate-500 mt-1 inline-block">Local healthcare zones</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden w-full">
        {/* Header with Search and Action Buttons */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Geographic Master Taxonomy</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage countries, states, and cities with cascading relational integrity</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search locations..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {activeTab === "countries" && (
              <button
                onClick={() => {
                  setSelectedCountry(null);
                  setCountryForm({ name: "", code: "", phone_code: "" });
                  setShowCountryModal(true);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md shadow-xs transition"
              >
                + Add Country
              </button>
            )}

            {activeTab === "states" && (
              <button
                onClick={() => {
                  setSelectedState(null);
                  setStateForm({ country_id: countries[0]?.id || "", name: "", code: "" });
                  setShowStateModal(true);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md shadow-xs transition"
              >
                + Add State
              </button>
            )}

            {activeTab === "cities" && (
              <button
                onClick={() => {
                  setSelectedCity(null);
                  const firstCountryId = countries[0]?.id || "";
                  const matchingStates = states.filter((s) => s.country_id === Number(firstCountryId));
                  setCityForm({
                    country_id: firstCountryId,
                    state_id: matchingStates[0]?.id || "",
                    name: "",
                  });
                  setShowCityModal(true);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-md shadow-xs transition"
              >
                + Add City
              </button>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-5 border-b border-slate-200 flex space-x-6 text-xs font-medium bg-white">
          <button
            onClick={() => setActiveTab("countries")}
            className={`py-3 border-b-2 transition ${
              activeTab === "countries"
                ? "border-sky-600 text-sky-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Countries ({countries.length})
          </button>
          <button
            onClick={() => setActiveTab("states")}
            className={`py-3 border-b-2 transition ${
              activeTab === "states"
                ? "border-sky-600 text-sky-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            States &amp; Provinces ({states.length})
          </button>
          <button
            onClick={() => setActiveTab("cities")}
            className={`py-3 border-b-2 transition ${
              activeTab === "cities"
                ? "border-sky-600 text-sky-700 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Cities ({cities.length})
          </button>
        </div>

        {/* Error / Success Toast */}
        {actionError && (
          <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-md flex justify-between items-center">
            <span>{actionError}</span>
            <button onClick={() => setActionError("")} className="text-rose-500 font-bold">&times;</button>
          </div>
        )}
        {actionSuccess && (
          <div className="m-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-md flex justify-between items-center">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess("")} className="text-emerald-500 font-bold">&times;</button>
          </div>
        )}

        {/* --- 1. COUNTRIES TABLE --- */}
        {activeTab === "countries" && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Country Name</th>
                  <th className="px-4 py-3 text-left">ISO Code</th>
                  <th className="px-4 py-3 text-left">Dial Code</th>
                  <th className="px-4 py-3 text-left">State Count</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedCountries.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 text-[11px] font-semibold">{c.code}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone_code || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] border border-slate-200">
                        {c.state_count} states
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleCountryStatus(c)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition ${
                          c.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {c.status}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedCountry(c);
                          setCountryForm({ name: c.name, code: c.code, phone_code: c.phone_code || "" });
                          setShowCountryModal(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-xs font-medium rounded border border-slate-300 text-slate-700 transition shadow-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={countryPage}
              totalPages={countryTotalPages}
              totalRecords={countryTotalRecords}
              pageSize={countryPageSize}
              onPageChange={setCountryPage}
              onPageSizeChange={setCountryPageSize}
            />
          </div>
        )}

        {/* --- 2. STATES TABLE --- */}
        {activeTab === "states" && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">State / Province</th>
                  <th className="px-4 py-3 text-left">State Code</th>
                  <th className="px-4 py-3 text-left">Country</th>
                  <th className="px-4 py-3 text-left">Cities</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedStates.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 text-[11px] font-semibold">{s.code || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] border border-slate-200">
                        {s.country_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] border border-slate-200">
                        {s.city_count} cities
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleStateStatus(s)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition ${
                          s.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {s.status}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedState(s);
                          setStateForm({ country_id: s.country_id, name: s.name, code: s.code || "" });
                          setShowStateModal(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-xs font-medium rounded border border-slate-300 text-slate-700 transition shadow-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={statePage}
              totalPages={stateTotalPages}
              totalRecords={stateTotalRecords}
              pageSize={statePageSize}
              onPageChange={setStatePage}
              onPageSizeChange={setStatePageSize}
            />
          </div>
        )}

        {/* --- 3. CITIES TABLE --- */}
        {activeTab === "cities" && (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">City Name</th>
                  <th className="px-4 py-3 text-left">State / Province</th>
                  <th className="px-4 py-3 text-left">Country</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedCities.map((ci) => (
                  <tr key={ci.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{ci.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] border border-slate-200">
                        {ci.state_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{ci.country_name}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleCityStatus(ci)}
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium transition ${
                          ci.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {ci.status}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedCity(ci);
                          setCityForm({ country_id: ci.country_id, state_id: ci.state_id, name: ci.name });
                          setShowCityModal(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-xs font-medium rounded border border-slate-300 text-slate-700 transition shadow-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <Pagination
              currentPage={cityPage}
              totalPages={cityTotalPages}
              totalRecords={cityTotalRecords}
              pageSize={cityPageSize}
              onPageChange={setCityPage}
              onPageSizeChange={setCityPageSize}
            />
          </div>
        )}
      </div>

      {/* --- COUNTRY MODAL --- */}
      {showCountryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedCountry ? "Edit Country Master" : "Register New Country"}
            </h3>
            <form onSubmit={handleCountrySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country Name *</label>
                <input
                  type="text"
                  required
                  value={countryForm.name}
                  onChange={(e) => setCountryForm({ ...countryForm, name: e.target.value })}
                  placeholder="e.g. Canada"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ISO Code *</label>
                  <input
                    type="text"
                    required
                    value={countryForm.code}
                    onChange={(e) => setCountryForm({ ...countryForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CA"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Dial Code</label>
                  <input
                    type="text"
                    value={countryForm.phone_code}
                    onChange={(e) => setCountryForm({ ...countryForm, phone_code: e.target.value })}
                    placeholder="+1"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCountryModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs"
                >
                  {saving ? "Saving..." : "Save Country"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- STATE MODAL --- */}
      {showStateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedState ? "Edit State / Province" : "Register New State"}
            </h3>
            <form onSubmit={handleStateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Parent Country *</label>
                <CustomDropdown
                  value={stateForm.country_id}
                  onChange={(val) => setStateForm({ ...stateForm, country_id: val })}
                  options={countries.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.code})`,
                  }))}
                  placeholder="Select Country"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">State Name *</label>
                  <input
                    type="text"
                    required
                    value={stateForm.name}
                    onChange={(e) => setStateForm({ ...stateForm, name: e.target.value })}
                    placeholder="e.g. Ontario"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Code</label>
                  <input
                    type="text"
                    value={stateForm.code}
                    onChange={(e) => setStateForm({ ...stateForm, code: e.target.value.toUpperCase() })}
                    placeholder="ON"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 font-mono uppercase"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowStateModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs"
                >
                  {saving ? "Saving..." : "Save State"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CITY MODAL --- */}
      {showCityModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedCity ? "Edit City Master" : "Register New City"}
            </h3>
            <form onSubmit={handleCitySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country *</label>
                <CustomDropdown
                  value={cityForm.country_id}
                  onChange={(cId) => {
                    const matching = states.filter((s) => s.country_id === Number(cId));
                    setCityForm({ ...cityForm, country_id: cId, state_id: matching[0]?.id || "" });
                  }}
                  options={countries.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  placeholder="Select Country"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State / Province *</label>
                <CustomDropdown
                  value={cityForm.state_id}
                  onChange={(val) => setCityForm({ ...cityForm, state_id: val })}
                  options={states
                    .filter((s) => !cityForm.country_id || s.country_id === Number(cityForm.country_id))
                    .map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.code || s.country_name})`,
                    }))}
                  placeholder="Select State / Province"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City Name *</label>
                <input
                  type="text"
                  required
                  value={cityForm.name}
                  onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })}
                  placeholder="e.g. Toronto"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCityModal(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-xs"
                >
                  {saving ? "Saving..." : "Save City"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
