import { useState, useEffect } from "react";
import { getDigitalTwinFloorplan } from "../services/api";
import { subscribeToEvent } from "../services/socket";

export default function FloorplanHeatmapDigitalTwin({ session }) {
  const token = session?.token;
  const [data, setData] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(0); // 0 = L0, 1 = L1, 2 = L2
  const [viewMode, setViewMode] = useState("blueprint"); // "blueprint" | "heatmap"
  const [selectedZone, setSelectedZone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFloorplan();
  }, [token]);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    const unsub = subscribeToEvent(
      "digital_twin:update",
      () => {
        loadFloorplan(false);
      },
      token
    );
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [token]);

  async function loadFloorplan(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const res = await getDigitalTwinFloorplan(token);
      if (res.success && res.data) {
        setData(res.data);
        setLastUpdated(new Date().toLocaleTimeString());
        // If a zone is selected, update it in-place
        if (selectedZone) {
          const allZones = res.data.floors.flatMap((f) => f.zones);
          const updated = allZones.find((z) => z.id === selectedZone.id);
          if (updated) setSelectedZone(updated);
        }
      }
    } catch (err) {
      setError("Failed to load Spatial Floorplan Digital Twin: " + err.message);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  const currentFloor = data?.floors?.find((f) => f.floor_number === selectedFloor) || data?.floors?.[0];
  const overall = data?.overall_telemetry || {};

  // Helpers for Heatmap colors
  function getHeatColorClass(score) {
    if (score >= 85) return "bg-rose-500 text-white";
    if (score >= 65) return "bg-amber-500 text-white";
    if (score >= 40) return "bg-sky-500 text-white";
    return "bg-emerald-500 text-white";
  }

  function getHeatBgClass(score, isHeatmap) {
    if (!isHeatmap) {
      if (score >= 85) return "bg-rose-50/70 border-rose-300 hover:border-rose-400";
      if (score >= 65) return "bg-amber-50/70 border-amber-300 hover:border-amber-400";
      if (score >= 40) return "bg-sky-50/50 border-sky-300 hover:border-sky-400";
      return "bg-emerald-50/40 border-emerald-300 hover:border-emerald-400";
    }

    // Heatmap thermal glow intensity
    if (score >= 85) return "bg-gradient-to-br from-rose-600/90 to-red-800/95 text-white border-rose-500 shadow-lg shadow-rose-600/30";
    if (score >= 65) return "bg-gradient-to-br from-amber-500/90 to-orange-700/95 text-white border-amber-400 shadow-md shadow-amber-500/20";
    if (score >= 40) return "bg-gradient-to-br from-cyan-600/80 to-blue-800/90 text-white border-cyan-400 shadow-sm";
    return "bg-gradient-to-br from-emerald-600/70 to-teal-800/85 text-white border-emerald-400 shadow-sm";
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs font-mono tracking-widest text-emerald-400 uppercase font-semibold">
                Spatial Floorplan &amp; Heatmap Twin
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hospital Multi-Floor Spatial Twin &amp; Congestion Heatmap
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-2xl leading-relaxed">
              Real-time architectural layout visualization tracking room-by-room patient density,
              clinical staffing rosters, medical equipment status, and congestion bottlenecks.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            {lastUpdated && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded-md border border-slate-700">
                Synced: {lastUpdated}
              </span>
            )}
            <button
              onClick={() => loadFloorplan(true)}
              disabled={loading}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-md transition shadow-sm flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{loading ? "Syncing..." : "Refresh Layout"}</span>
            </button>
          </div>
        </div>

        {/* Global Facility Spatial Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Active Facility Census
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-white">
                {overall.total_headcount || 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">persons tracked</span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Congestion Index
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className={`text-xl font-bold ${
                (overall.average_congestion_index || 0) >= 75
                  ? "text-rose-400"
                  : (overall.average_congestion_index || 0) >= 50
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}>
                {overall.average_congestion_index || 0}%
              </span>
              <span className="text-xs text-slate-400 font-mono capitalize">
                ({overall.status || "optimal"})
              </span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Active Hotspots
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className={`text-xl font-bold ${
                (overall.critical_hotspots_count || 0) > 0 ? "text-rose-400" : "text-emerald-400"
              }`}>
                {overall.critical_hotspots_count || 0}
              </span>
              <span className="text-xs text-slate-400 font-mono">critical zones</span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
              Tracked Spatial Zones
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold text-sky-400">
                {overall.total_zones || 13}
              </span>
              <span className="text-xs text-slate-400 font-mono">across 3 floors</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold text-rose-700 hover:text-rose-900">✕</button>
        </div>
      )}

      {/* Floor & Mode Navigation Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Floor Switcher */}
        <div className="flex items-center space-x-1 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {(data?.floors || [
            { floor_number: 0, floor_label: "Ground Floor (Level 0)" },
            { floor_number: 1, floor_label: "First Floor (Level 1)" },
            { floor_number: 2, floor_label: "Second Floor (Level 2)" },
          ]).map((floor) => (
            <button
              key={floor.floor_number}
              onClick={() => {
                setSelectedFloor(floor.floor_number);
                setSelectedZone(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer flex items-center space-x-2 ${
                selectedFloor === floor.floor_number
                  ? "bg-sky-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>{floor.floor_label}</span>
              {floor.active_headcount !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedFloor === floor.floor_number ? "bg-sky-700 text-sky-100" : "bg-slate-200 text-slate-700"
                }`}>
                  {floor.active_headcount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* View Mode Switcher (Blueprint vs Heatmap) */}
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-lg border border-slate-200 self-end md:self-center">
          <button
            onClick={() => setViewMode("blueprint")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
              viewMode === "blueprint"
                ? "bg-white text-slate-900 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
            <span>Architectural Blueprint</span>
          </button>

          <button
            onClick={() => setViewMode("heatmap")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center space-x-1.5 ${
              viewMode === "heatmap"
                ? "bg-white text-slate-900 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
            </svg>
            <span>Thermal Heatmap</span>
          </button>
        </div>
      </div>

      {/* Active Floor Subtitle & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 px-1 gap-2">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-900">{currentFloor?.floor_label}:</span>
          <span className="text-slate-500">{currentFloor?.subtitle}</span>
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <span className="text-slate-400">Congestion:</span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span>&lt;40% Optimal</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
            <span>40-69% Moderate</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>70-84% High</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span>85%+ Bottleneck</span>
          </span>
        </div>
      </div>

      {/* Main Floor Blueprint / Heatmap Grid Canvas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Spatial Zone Cards Matrix */}
        <div className={`space-y-4 ${selectedZone ? "md:col-span-8" : "md:col-span-12"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            {(currentFloor?.zones || []).map((zone) => {
              const isSelected = selectedZone?.id === zone.id;
              const isHeatmap = viewMode === "heatmap";

              return (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZone(zone)}
                  className={`relative p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer overflow-hidden ${
                    isSelected
                      ? "ring-2 ring-sky-500 ring-offset-2 border-sky-500"
                      : ""
                  } ${getHeatBgClass(zone.heat_score, isHeatmap)}`}
                >
                  {/* Top Bar: Room Code & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                      isHeatmap
                        ? "bg-black/30 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}>
                      {zone.code}
                    </span>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center space-x-1 ${
                      isHeatmap
                        ? "bg-white/20 text-white"
                        : getHeatColorClass(zone.heat_score)
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                      <span>{zone.density_level} Density</span>
                    </span>
                  </div>

                  {/* Room Name & Wing */}
                  <h3 className={`text-sm font-bold leading-tight ${isHeatmap ? "text-white" : "text-slate-900"}`}>
                    {zone.name}
                  </h3>
                  <p className={`text-[11px] mt-0.5 ${isHeatmap ? "text-white/80" : "text-slate-500"}`}>
                    {zone.wing}
                  </p>

                  {/* Telemetry Summary */}
                  <div className={`mt-3 p-2.5 rounded-lg text-xs ${
                    isHeatmap
                      ? "bg-black/25 text-white/95"
                      : "bg-white/80 border border-slate-200 text-slate-700"
                  }`}>
                    <p className="line-clamp-2">{zone.telemetry_summary}</p>
                  </div>

                  {/* Occupancy Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className={isHeatmap ? "text-white/80" : "text-slate-500"}>
                        Occupancy / Headcount
                      </span>
                      <span className={`font-bold ${isHeatmap ? "text-white" : "text-slate-900"}`}>
                        {zone.active_headcount} / {zone.capacity} ({zone.occupancy_pct}%)
                      </span>
                    </div>

                    <div className={`h-2 rounded-full overflow-hidden ${
                      isHeatmap ? "bg-black/30" : "bg-slate-200"
                    }`}>
                      <div
                        className={`h-full transition-all duration-500 ${
                          isHeatmap
                            ? "bg-white"
                            : zone.heat_score >= 85
                            ? "bg-rose-500"
                            : zone.heat_score >= 65
                            ? "bg-amber-500"
                            : "bg-sky-500"
                        }`}
                        style={{ width: `${Math.min(zone.occupancy_pct, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Footer Info */}
                  <div className={`mt-4 pt-3 flex items-center justify-between text-[11px] border-t ${
                    isHeatmap ? "border-white/20 text-white/80" : "border-slate-200 text-slate-500"
                  }`}>
                    <span className="truncate max-w-[180px]">
                      👤 {zone.lead_staff}
                    </span>
                    <span className={`font-semibold underline ${
                      isHeatmap ? "text-white hover:text-white/90" : "text-sky-600 hover:text-sky-800"
                    }`}>
                      Inspect Zone →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Zone Detail Slide-Over / Inspector Panel */}
        {selectedZone && (
          <div className="md:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-lg space-y-5 sticky top-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-mono text-sky-600 bg-sky-50 px-2 py-0.5 rounded font-bold uppercase tracking-wider block mb-1">
                  {selectedZone.code} • Zone Inspector
                </span>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedZone.name}
                </h2>
                <p className="text-xs text-slate-500">{selectedZone.wing}</p>
              </div>

              <button
                onClick={() => setSelectedZone(null)}
                className="text-slate-400 hover:text-slate-600 p-1 text-sm cursor-pointer"
                title="Close Inspector"
              >
                ✕
              </button>
            </div>

            {/* Zone Telemetry Badges */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Active Presence</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {selectedZone.active_headcount} Persons
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Max Capacity</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {selectedZone.capacity} Nominal
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Congestion Score</span>
                <span className={`text-sm font-bold mt-0.5 block ${
                  selectedZone.heat_score >= 80 ? "text-rose-600" : "text-sky-600"
                }`}>
                  {selectedZone.heat_score}% ({selectedZone.density_level})
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-mono uppercase block">Zone Officer</span>
                <span className="text-xs font-semibold text-slate-800 mt-0.5 block truncate">
                  {selectedZone.lead_staff}
                </span>
              </div>
            </div>

            {/* Live In-Zone Entities Roster */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Live Zone Entities &amp; Roster ({selectedZone.entities?.length || 0})
                </h3>
                <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  Live
                </span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(selectedZone.entities || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 text-center bg-slate-50 rounded-lg">
                    No active patients or active orders currently assigned in this zone.
                  </p>
                ) : (
                  selectedZone.entities.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 text-xs transition"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-900 font-semibold truncate">{item.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shrink-0 ml-2">
                          {item.time || item.status || "Active"}
                        </span>
                      </div>
                      {item.details && (
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                          {item.details}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Immediate Zone Operational Actions */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                Operational Dispatch Actions
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => alert(`Operational Alert: Reroute pulse dispatched for ${selectedZone.name}. Incoming patients will be notified.`)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium text-center transition cursor-pointer text-[11px]"
                >
                  ⚡ Reroute Queue
                </button>
                <button
                  type="button"
                  onClick={() => alert(`Sanitation & Turnaround dispatched for ${selectedZone.name}. Porter team alerted.`)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium text-center transition cursor-pointer text-[11px]"
                >
                  🧹 Dispatch Porter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
