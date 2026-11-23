import React, { useState, useEffect } from "react";
import {
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Zap,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  Sliders,
  Check,
  Copy,
  Eye,
  Play,
  RotateCcw,
  CreditCard,
  Truck,
  Percent,
  Lock,
  Cpu,
} from "lucide-react";
import { useFeatureFlags } from "../context/FeatureFlagContext";
import { useAuth } from "../context/AuthContext";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";

export default function FeatureFlagManager() {
  const { user } = useAuth();
  const { flags: evaluatedFlags, reloadFlags, setOverride, clearOverrides, localOverrides } = useFeatureFlags();

  const [flagsList, setFlagsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingKey, setUpdatingKey] = useState(null);
  const [activeTab, setActiveTab] = useState("flags"); // 'flags', 'ab-tester', 'simulator'
  const [simUserId, setSimUserId] = useState("1");
  const [simRole, setSimRole] = useState("admin");
  const [simResult, setSimResult] = useState(null);
  const [audienceSim, setAudienceSim] = useState(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Fetch full flags definition from backend
  const loadFullFlags = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feature-flags`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFlagsList(data.data || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch feature flags:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFullFlags();
  }, []);

  // Update a flag property on backend
  const handleUpdateFlag = async (flagKey, updates) => {
    setUpdatingKey(flagKey);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feature-flags/${flagKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        await loadFullFlags();
        await reloadFlags();
      }
    } catch (err) {
      console.error("Failed to update feature flag:", err);
    } finally {
      setUpdatingKey(null);
    }
  };

  // Run user evaluation test
  const handleEvaluateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/feature-flags/evaluate?userId=${simUserId}&role=${simRole}`
      );
      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
      }
    } catch (err) {
      console.error("Evaluation error:", err);
    }
  };

  // Run population audience simulation
  const handleRunAudienceSim = async (flagKey) => {
    setAudienceLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/feature-flags/${flagKey}/simulate?sampleCount=50`);
      if (res.ok) {
        const data = await res.json();
        setAudienceSim(data.data);
      }
    } catch (err) {
      console.error("Audience sim error:", err);
    } finally {
      setAudienceLoading(false);
    }
  };

  const activeFlagsCount = flagsList.filter((f) => f.is_enabled && !f.kill_switch).length;
  const killSwitchCount = flagsList.filter((f) => f.kill_switch).length;

  return (
    <div className="space-y-6 animate-fadeIn font-sans text-slate-100">
      {/* ========================================================= */}
      {/* 1. Feature Flag & Progressive Delivery Banner             */}
      {/* ========================================================= */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-violet-950/80 via-slate-900/90 to-indigo-950/80 border border-violet-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-mono font-bold border border-violet-500/30 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                TASK 5: FEATURE FLAGS & PROGRESSIVE DELIVERY
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                Deterministic Hashing (0-99)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-500/30">
                Dual API / UI Backward Compatibility
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Progressive Release & Compatibility Engine
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Dynamically roll out the Next-Gen Express Checkout UI (v2) to targeted percentage cohorts or specific user roles while seamlessly preserving the stable legacy checkout flow (v1) without breaking API contracts.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                loadFullFlags();
                reloadFlags();
              }}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 hover:border-violet-500/40 text-violet-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-violet-400" : ""}`} />
              <span>Sync Rules</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Top Metric Cards                                       */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Active Feature Flags</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">
            {activeFlagsCount} / {flagsList.length}
          </p>
          <p className="text-[10px] text-slate-400 font-mono">Real-Time Evaluation</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Primary A/B Flag</span>
            <Layers className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">new_checkout_v2</p>
          <p className="text-[10px] text-indigo-300 font-mono">50% Deterministic Split</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Targeting Strategy</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-indigo-300 font-mono">Role + Hash</p>
          <p className="text-[10px] text-slate-400 font-mono">Admin & Beta Whitelist</p>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Kill-Switches Triggered</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-black text-white font-mono">{killSwitchCount}</p>
          <p className="text-[10px] text-emerald-400 font-mono">Zero Cutoffs Active</p>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Navigation Tabs                                        */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-2 rounded-2xl bg-slate-900/70 border border-white/10">
        <div className="flex items-center gap-1.5">
          {[
            { id: "flags", label: "Feature Flags Manager", icon: SlidersHorizontal },
            { id: "ab-tester", label: "A/B Checkout Dual Flow Preview", icon: Eye },
            { id: "simulator", label: "User Bucketing Simulator", icon: Cpu },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-600/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {Object.keys(localOverrides).length > 0 && (
          <button
            onClick={clearOverrides}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer hover:bg-amber-500/30"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset {Object.keys(localOverrides).length} Local QA Overrides</span>
          </button>
        )}
      </div>

      {/* ========================================================= */}
      {/* 4. TAB 1: FEATURE FLAGS LIST & CONTROLS                   */}
      {/* ========================================================= */}
      {activeTab === "flags" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {flagsList.map((flag) => {
              const isUpdating = updatingKey === flag.flag_key;
              const isKillSwitch = flag.kill_switch;
              const isEnabled = flag.is_enabled && !isKillSwitch;
              const currentRollout = flag.rollout_percentage || 0;
              const localOverride = localOverrides[flag.flag_key];

              return (
                <div
                  key={flag.id || flag.flag_key}
                  className={`p-6 rounded-3xl border transition-all duration-300 shadow-xl ${
                    isKillSwitch
                      ? "bg-rose-950/30 border-rose-500/30"
                      : isEnabled
                      ? "bg-slate-900/80 border-white/10 hover:border-violet-500/40"
                      : "bg-slate-950/60 border-white/5 opacity-75"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Flag Header & Details */}
                    <div className="space-y-2 max-w-xl">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <code className="px-2.5 py-1 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono font-black text-violet-300">
                          {flag.flag_key}
                        </code>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                            isKillSwitch
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              : isEnabled
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              : "bg-slate-800 text-slate-400 border-white/10"
                          }`}
                        >
                          {isKillSwitch ? "KILL-SWITCH ACTIVE" : isEnabled ? "ENABLED" : "DISABLED"}
                        </span>

                        {localOverride !== undefined && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/30">
                            QA OVERRIDE: {localOverride ? "TRUE" : "FALSE"}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-white tracking-tight">{flag.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{flag.description}</p>

                      {/* Targeting Rules Summary */}
                      <div className="flex items-center gap-3 text-xs font-mono pt-1 text-slate-400 flex-wrap">
                        <span>
                          Target Roles:{" "}
                          <strong className="text-indigo-300">
                            {Array.isArray(flag.target_roles) ? flag.target_roles.join(", ") : "all"}
                          </strong>
                        </span>
                        <span>&bull;</span>
                        <span>
                          Rollout: <strong className="text-emerald-400">{currentRollout}%</strong>
                        </span>
                      </div>
                    </div>

                    {/* Flag Controls & Percentage Slider */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-950/80 p-4 rounded-2xl border border-white/5">
                      {/* Rollout Slider */}
                      <div className="space-y-1.5 sm:w-48">
                        <div className="flex justify-between text-[11px] font-mono text-slate-400">
                          <span>Rollout</span>
                          <span className="text-emerald-400 font-bold">{currentRollout}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={currentRollout}
                          disabled={isUpdating || isKillSwitch}
                          onChange={(e) =>
                            handleUpdateFlag(flag.flag_key, {
                              rollout_percentage: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full accent-violet-500 cursor-pointer"
                        />
                      </div>

                      {/* Enable Toggle Button */}
                      <button
                        onClick={() =>
                          handleUpdateFlag(flag.flag_key, { is_enabled: !flag.is_enabled })
                        }
                        disabled={isUpdating || isKillSwitch}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          flag.is_enabled
                            ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30"
                            : "bg-slate-800 text-slate-400 border border-white/10 hover:text-white"
                        }`}
                      >
                        {flag.is_enabled ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-400" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-slate-500" />
                            <span>Inactive</span>
                          </>
                        )}
                      </button>

                      {/* Emergency Kill-Switch Toggle */}
                      <button
                        onClick={() =>
                          handleUpdateFlag(flag.flag_key, { kill_switch: !flag.kill_switch })
                        }
                        disabled={isUpdating}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                          isKillSwitch
                            ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30 animate-pulse"
                            : "bg-slate-900 border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
                        }`}
                        title="Emergency Cutoff: Immediately halts feature execution for 100% of users"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span>{isKillSwitch ? "Disarm Cutoff" : "Kill Switch"}</span>
                      </button>

                      {/* Local QA Preview Override */}
                      <button
                        onClick={() =>
                          setOverride(flag.flag_key, localOverride === undefined ? !isEnabled : !localOverride)
                        }
                        className="p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                        title="Toggle local QA override in your browser without altering production DB"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 2: A/B CHECKOUT DUAL FLOW COMPARISON               */}
      {/* ========================================================= */}
      {activeTab === "ab-tester" && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-violet-400" />
                Live Side-by-Side Dual Flow Architecture
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Both Variant A (Legacy Stable v1) and Variant B (Next-Gen v2) submit to the same backward-compatible backend API endpoint.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Current User Variant:</span>
              <span
                className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
                  evaluatedFlags["new_checkout_v2"]?.enabled
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "bg-slate-800 text-slate-300 border-white/10"
                }`}
              >
                {evaluatedFlags["new_checkout_v2"]?.enabled ? "Variant B (v2 Express)" : "Variant A (v1 Legacy)"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* VARIANT A: LEGACY STABLE FLOW */}
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4 relative">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono font-bold border border-white/10">
                    VARIANT A (CONTROL)
                  </span>
                  <h4 className="text-sm font-bold text-white">Legacy Stable Checkout (v1)</h4>
                </div>
                <span className="text-xs font-mono text-slate-500">100% Stable SLA</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                  <span className="text-slate-400 font-bold block text-[11px]">1. Delivery Address</span>
                  <p className="text-slate-300 text-[11px]">Single text field input (Default Address)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                  <span className="text-slate-400 font-bold block text-[11px]">2. Payment Method</span>
                  <p className="text-slate-300 text-[11px]">Standard Stripe Test Card or Cash on Delivery</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                  <span className="text-slate-400 font-bold block text-[11px]">3. Shipping Speed</span>
                  <p className="text-slate-300 text-[11px]">Fixed standard courier fulfillment (3-5 Days)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-1.5">
                  <span className="text-slate-400 font-bold block text-[11px]">4. Promo Codes</span>
                  <p className="text-slate-500 text-[11px]">Not supported in v1 flow</p>
                </div>
              </div>

              <button
                onClick={() => setOverride("new_checkout_v2", false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Preview Variant A in Cart Drawer
              </button>
            </div>

            {/* VARIANT B: NEXT-GEN EXPRESS FLOW */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-violet-950/60 via-slate-900/80 to-indigo-950/60 border border-violet-500/30 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-mono font-bold border border-violet-500/40">
                    VARIANT B (TREATMENT)
                  </span>
                  <h4 className="text-sm font-bold text-white">Next-Gen Express Checkout (v2)</h4>
                </div>
                <span className="text-xs font-mono text-emerald-400">Feature Flagged</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-violet-500/20 space-y-1.5">
                  <span className="text-violet-300 font-bold block text-[11px]">1. 1-Click Multi-Payment Selector</span>
                  <p className="text-slate-300 text-[11px]">Stripe Elements, Express Wallet, Web3 USDC Instant Settlement</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-violet-500/20 space-y-1.5">
                  <span className="text-emerald-400 font-bold block text-[11px]">2. AI Promo Code Validation</span>
                  <p className="text-slate-300 text-[11px]">Live discounts (<code className="text-emerald-300">SAVE20</code>, <code className="text-emerald-300">EXCELSIOR50</code>)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-violet-500/20 space-y-1.5">
                  <span className="text-indigo-300 font-bold block text-[11px]">3. Dynamic Shipping Tiers</span>
                  <p className="text-slate-300 text-[11px]">Standard (FREE) vs 1-Day Express (₹15) vs Hyper Drone (₹25)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-violet-500/20 space-y-1.5">
                  <span className="text-amber-300 font-bold block text-[11px]">4. Real-Time ACID Telemetry</span>
                  <p className="text-slate-300 text-[11px]">Live Idempotency & Distributed Trace link in receipt</p>
                </div>
              </div>

              <button
                onClick={() => setOverride("new_checkout_v2", true)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-violet-600/20"
              >
                Preview Variant B in Cart Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. TAB 3: USER BUCKETING SIMULATOR                        */}
      {/* ========================================================= */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          {/* User Evaluation Form */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              Deterministic User Bucketing & Targeting Inspector
            </h3>
            <p className="text-xs text-slate-400">
              Input any User ID and Role to simulate exact deterministic hash assignment (Bucket 0-99) and evaluate active feature flags.
            </p>

            <form onSubmit={handleEvaluateUser} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">User ID</label>
                <input
                  type="text"
                  value={simUserId}
                  onChange={(e) => setSimUserId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1">User Role</label>
                <select
                  value={simRole}
                  onChange={(e) => setSimRole(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="admin">admin</option>
                  <option value="beta_tester">beta_tester</option>
                  <option value="vip">vip</option>
                  <option value="customer">customer</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-violet-600/25"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Evaluate Targeting</span>
                </button>
              </div>
            </form>

            {simResult && (
              <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-white/10 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-white/5">
                  <span>Targeting Result for User #{simResult.userContext.userId} ({simResult.userContext.role})</span>
                  <span className="text-emerald-400 font-bold">Evaluation 200 OK</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(simResult.flags).map(([key, f]) => (
                    <div
                      key={key}
                      className={`p-3 rounded-xl border ${
                        f.enabled ? "bg-emerald-950/30 border-emerald-500/30" : "bg-slate-900 border-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{key}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            f.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {f.enabled ? "ENABLED" : "EXCLUDED"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{f.reason}</p>
                      {f.bucket !== null && (
                        <p className="text-[10px] text-indigo-300 mt-0.5">Bucket Hash: {f.bucket} / 100</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Population Distribution Simulator */}
          <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Audience Population Dispersion Simulator
                </h3>
                <p className="text-xs text-slate-400">
                  Run a 50-user population test on <code>new_checkout_v2</code> to verify deterministic percentage distribution.
                </p>
              </div>

              <button
                onClick={() => handleRunAudienceSim("new_checkout_v2")}
                disabled={audienceLoading}
                className="px-4 py-2 rounded-xl bg-slate-950 border border-white/10 hover:border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Play className={`w-3.5 h-3.5 fill-current ${audienceLoading ? "animate-spin" : ""}`} />
                <span>Simulate 50 Users</span>
              </button>
            </div>

            {audienceSim && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-white/5">
                  <span>Target Rollout: <strong className="text-violet-300">{audienceSim.rolloutPercentage}%</strong></span>
                  <span>Actual Split: <strong className="text-emerald-400">{audienceSim.actualPercentage}% ({audienceSim.enabledCount}/{audienceSim.totalSampled} Users)</strong></span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-48 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-white/5">
                  {audienceSim.samples.map((s) => (
                    <div
                      key={s.userId}
                      className={`p-1.5 rounded text-center text-[10px] font-bold border ${
                        s.enabled
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-900 text-slate-500 border-white/5"
                      }`}
                      title={`User #${s.userId} (Bucket: ${s.bucket}) -> ${s.enabled ? "Variant B" : "Variant A"}`}
                    >
                      #{s.userId}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
