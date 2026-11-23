import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Key } from "lucide-react";

export default function JwtInspectorTab() {
  const { token } = useAuth();
  const [decodedToken, setDecodedToken] = useState(null);

  useEffect(() => {
    if (token) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const header = JSON.parse(atob(parts[0]));
          const payload = JSON.parse(atob(parts[1]));
          setDecodedToken({ header, payload, signatureSnippet: parts[2].slice(0, 16) + "..." });
        }
      } catch (e) {
        console.warn("Could not decode token for preview:", e);
      }
    }
  }, [token]);

  return (
    <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4 animate-fadeIn max-w-3xl">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
          <Key className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">JWT Token Deep Inspector</h3>
          <p className="text-xs text-slate-400">Decoded Header, Claims, and HS256 Signature</p>
        </div>
      </div>

      {decodedToken ? (
        <div className="space-y-3 font-mono text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-rose-500/20">
            <span className="text-[10px] text-rose-400 font-bold uppercase block mb-1">
              Header (Algorithm & Type)
            </span>
            <pre className="text-rose-300 text-[11px]">
              {JSON.stringify(decodedToken.header, null, 2)}
            </pre>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-violet-500/20">
            <span className="text-[10px] text-violet-400 font-bold uppercase block mb-1">
              Payload (Claims & User Identity)
            </span>
            <pre className="text-violet-300 text-[11px]">
              {JSON.stringify(decodedToken.payload, null, 2)}
            </pre>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-cyan-500/20 text-[10px]">
            <span className="text-cyan-400 font-bold block mb-0.5">HS256 Signature:</span>
            <span className="text-slate-400 truncate block">{decodedToken.signatureSnippet}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No token detected in storage.</p>
      )}
    </div>
  );
}
