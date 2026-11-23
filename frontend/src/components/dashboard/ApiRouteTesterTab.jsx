import React, { useState } from "react";
import { fetchDashboardData, getMyProfile } from "../../services/authService";
import { getMyOrders } from "../../services/orderService";
import { Terminal } from "lucide-react";

export default function ApiRouteTesterTab() {
  const [apiLoading, setApiLoading] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);

  const testGetDashboardData = async () => {
    setApiLoading(true);
    try {
      const res = await fetchDashboardData();
      setApiResponse({
        endpoint: "GET /api/auth/dashboard-data",
        status: 200,
        ok: true,
        data: res,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setApiResponse({
        endpoint: "GET /api/auth/dashboard-data",
        status: err.status || 500,
        ok: false,
        data: err.data || { error: err.message },
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setApiLoading(false);
    }
  };

  const testGetMe = async () => {
    setApiLoading(true);
    try {
      const res = await getMyProfile();
      setApiResponse({
        endpoint: "GET /api/auth/profile",
        status: 200,
        ok: true,
        data: res,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setApiResponse({
        endpoint: "GET /api/auth/profile",
        status: err.status || 500,
        ok: false,
        data: err.data || { error: err.message },
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setApiLoading(false);
    }
  };

  const testGetMyOrders = async () => {
    setApiLoading(true);
    try {
      const res = await getMyOrders();
      setApiResponse({
        endpoint: "GET /api/orders/my-orders",
        status: 200,
        ok: true,
        data: res,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setApiResponse({
        endpoint: "GET /api/orders/my-orders",
        status: err.status || 500,
        ok: false,
        data: err.data || { error: err.message },
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setApiLoading(false);
    }
  };

  const testUnauthenticated = async () => {
    setApiLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/auth/dashboard-data", {
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setApiResponse({
        endpoint: "GET /api/auth/dashboard-data (UNAUTHENTICATED)",
        status: res.status,
        ok: res.ok,
        data,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setApiResponse({
        endpoint: "GET /api/auth/dashboard-data (UNAUTHENTICATED)",
        status: 500,
        ok: false,
        data: { error: err.message },
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
      <div className="lg:col-span-6 p-6 rounded-3xl bg-slate-900/80 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            Execute Protected Requests
          </h3>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-mono border border-emerald-500/20">
            Bearer Token Attached
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Execute live requests to protected Express routes with JWT Authorization headers.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={testGetDashboardData}
            disabled={apiLoading}
            className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer text-left shadow-lg shadow-indigo-600/20"
          >
            GET /dashboard-data
          </button>
          <button
            onClick={testGetMe}
            disabled={apiLoading}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer text-left border border-white/10"
          >
            GET /api/auth/profile
          </button>
          <button
            onClick={testGetMyOrders}
            disabled={apiLoading}
            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold transition cursor-pointer text-left border border-white/10"
          >
            GET /api/orders/my-orders
          </button>
          <button
            onClick={testUnauthenticated}
            disabled={apiLoading}
            className="p-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition cursor-pointer text-left border border-rose-500/20"
          >
            Test 401 (No Token)
          </button>
        </div>
      </div>

      {/* Console Output */}
      <div className="lg:col-span-6 p-6 rounded-3xl bg-slate-950 border border-white/10 font-mono text-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 text-slate-400 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Console: {apiResponse?.endpoint || "Idle"}</span>
            </div>
            {apiResponse && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  apiResponse.status >= 200 && apiResponse.status < 300
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}
              >
                HTTP {apiResponse.status}
              </span>
            )}
          </div>
          <pre className="text-slate-300 max-h-96 overflow-y-auto leading-relaxed text-[11px] custom-scrollbar">
            {apiResponse
              ? JSON.stringify(apiResponse.data, null, 2)
              : "Click any endpoint button on the left to inspect live API output..."}
          </pre>
        </div>
      </div>
    </div>
  );
}
