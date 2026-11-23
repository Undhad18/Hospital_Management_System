import React from "react";
import { BookOpen, Globe, ExternalLink } from "lucide-react";

export default function SwaggerDocsTab() {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            OpenAPI 3.0 Interactive Documentation
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Swagger UI for Auth, Products, and ACID Order Checkouts.
          </p>
        </div>
        <a
          href="http://localhost:5000/api-docs/"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 transition"
        >
          <Globe className="w-4 h-4" />
          <span>Open Swagger Tab</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </a>
      </div>

      <div className="h-[600px] rounded-3xl overflow-hidden border border-white/10 bg-slate-950 shadow-2xl">
        <iframe
          src="http://localhost:5000/api-docs/"
          title="Swagger UI"
          className="w-full h-full border-none"
        />
      </div>
    </div>
  );
}
