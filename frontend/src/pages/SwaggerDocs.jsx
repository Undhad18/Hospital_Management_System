import React, { useState } from "react";
import Navbar from "../components/Navbar";
import {
  ExternalLink,
  Code2,
  FileCode,
  Globe,
  Copy,
  Check,
} from "lucide-react";

export default function SwaggerDocs() {
  const [copied, setCopied] = useState(false);

  const swaggerUrl = "http://localhost:5000/api-docs/";
  const openApiJsonUrl = "http://localhost:5000/api/docs/openapi.json";

  const handleCopyEndpoint = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100 font-sans pb-16 radial-mesh">
      <Navbar />

      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-8 space-y-6 relative z-10">
        {/* Header Hero */}
        <div className="relative rounded-3xl bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-slate-900/80 border border-indigo-500/20 p-6 sm:p-8 overflow-hidden shadow-2xl backdrop-blur-2xl">
          <div className="absolute right-0 top-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                <Code2 className="w-3.5 h-3.5" />
                <span>OpenAPI 3.0.3 Admin Console</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
                Swagger API Specification
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                Explore, test, and validate all authenticated backend endpoints. Includes OpenAPI contract schemas for Auth, Products, and ACID Order Checkouts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={swaggerUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                <span>Open in Fullscreen Tab</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <button
                type="button"
                onClick={() => handleCopyEndpoint(swaggerUrl)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copied ? "Copied!" : "Copy URL"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Spec & Client Generation Meta Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl">
            <span className="text-xs font-medium text-slate-400">Spec Version</span>
            <p className="text-lg font-bold text-cyan-400 mt-1">OpenAPI 3.0.3</p>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">/backend/docs/openapi.json</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl">
            <span className="text-xs font-medium text-slate-400">Code Generator</span>
            <p className="text-lg font-bold text-indigo-400 mt-1">Typed SDK Client</p>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">npm run generate:api</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl">
            <span className="text-xs font-medium text-slate-400">Security Scheme</span>
            <p className="text-lg font-bold text-emerald-400 mt-1">BearerAuth (JWT)</p>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">HTTP Authorization Header</p>
          </div>
        </div>

        {/* Interactive Viewer Frame */}
        <div className="rounded-3xl bg-slate-900/90 border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/10 bg-slate-950/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="text-xs font-mono text-slate-400 ml-2">
                http://localhost:5000/api-docs
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={openApiJsonUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-[11px] font-mono text-slate-300 flex items-center gap-1.5 transition"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                <span>Raw JSON Spec</span>
              </a>
            </div>
          </div>

          {/* Embedded Swagger UI Iframe */}
          <div className="w-full h-[750px] bg-white">
            <iframe
              src={swaggerUrl}
              title="Swagger UI API Documentation"
              className="w-full h-full border-none"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
