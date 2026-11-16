import { useEffect, useState } from "react";
import {
  Settings,
  ShieldCheck,
  Server,
  FileCheck,
  CheckCircle2,
  Lock,
  GraduationCap,
} from "lucide-react";
import { API_BASE_URL } from "../api/client";
import { SUPPORTED_CATEGORIES, OUT_OF_SCOPE_CATEGORY } from "../utils/categories";

export function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(true);

  useEffect(() => {
    async function checkBackendHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          setHealth(data);
        } else {
          setHealth({ status: "offline" });
        }
      } catch {
        setHealth({ status: "offline" });
      } finally {
        setCheckingHealth(false);
      }
    }
    checkBackendHealth();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
            <Settings className="w-5 h-5" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
            Institutional Settings &amp; Specifications
          </h1>
        </div>
        <p className="text-stone-600 text-sm mt-1 font-medium">
          Notice to Action (Action4AI) · Alliance Institute of Technology &amp; Management Architecture.
        </p>
      </div>

      {/* Backend Health Diagnostic Card */}
      <section
        className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-4"
        aria-labelledby="backend-status-title"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-charcoal-900 text-teal-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 id="backend-status-title" className="font-extrabold text-base text-stone-950">
                Backend System Status
              </h2>
              <span className="text-xs text-stone-500 font-mono">{API_BASE_URL}</span>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              checkingHealth
                ? "bg-stone-100 text-stone-600"
                : health?.status === "healthy"
                ? "bg-sage-100 text-sage-900 border border-sage-300"
                : "bg-coral-100 text-coral-900 border border-coral-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                health?.status === "healthy" ? "bg-emerald-500" : "bg-coral-500"
              }`}
            />
            {checkingHealth
              ? "Checking..."
              : health?.status === "healthy"
              ? "Operational (Healthy)"
              : "Backend Offline"}
          </span>
        </div>

        {health && health.status === "healthy" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-stone-500 font-bold block">App Version</span>
              <span className="text-stone-900 font-extrabold">{health.version || "1.0.0"}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-stone-500 font-bold block">Database</span>
              <span className="text-stone-900 font-extrabold">{health.database || "Connected"}</span>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200">
              <span className="text-stone-500 font-bold block">Environment</span>
              <span className="text-stone-900 font-extrabold">{health.environment || "Development"}</span>
            </div>
          </div>
        )}
      </section>

      {/* Supported Categories Specification */}
      <section
        className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-4"
        aria-labelledby="categories-spec-title"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 id="categories-spec-title" className="font-extrabold text-base text-stone-950">
              Phase 7a Supported Notice Categories
            </h2>
            <p className="text-xs text-stone-500">
              Strictly grounded taxonomy configured for high-consequence institutional documents.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {SUPPORTED_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-stone-900">{cat.label}</span>
                <span className="text-[10px] font-mono text-stone-400 font-bold bg-white px-1.5 py-0.5 rounded border border-stone-200">
                  {cat.key}
                </span>
              </div>
              <p className="text-[11px] text-stone-600 font-medium leading-relaxed">
                {cat.description}
              </p>
            </div>
          ))}

          {/* Out of scope */}
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-stone-700">{OUT_OF_SCOPE_CATEGORY.label}</span>
              <span className="text-[10px] font-mono text-stone-400 font-bold bg-white px-1.5 py-0.5 rounded border border-stone-200">
                {OUT_OF_SCOPE_CATEGORY.key}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium leading-relaxed">
              {OUT_OF_SCOPE_CATEGORY.description}
            </p>
          </div>
        </div>
      </section>

      {/* Privacy and Technical Policies */}
      <section
        className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-card space-y-4"
        aria-labelledby="privacy-policy-title"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sage-100 text-sage-800">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 id="privacy-policy-title" className="font-extrabold text-base text-stone-950">
              Institutional Guarantees &amp; Security Policy
            </h2>
            <p className="text-xs text-stone-500">Notice2Action engineering and trust principles.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
            <div className="flex items-center gap-1.5 text-stone-900 font-bold">
              <Lock className="w-4 h-4 text-teal-600" />
              <span>10MB Upload Limit</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Document uploads are constrained to official PDF notices up to 10MB to guarantee fast, memory-safe OCR and extraction.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
            <div className="flex items-center gap-1.5 text-stone-900 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Zero Hallucination</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Every extracted deadline, fine amount, and requirement includes an exact citation page and verbatim quote from the uploaded notice.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-1.5">
            <div className="flex items-center gap-1.5 text-stone-900 font-bold">
              <GraduationCap className="w-4 h-4 text-charcoal-800" />
              <span>College Mini-Project</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Notice to Action (Action4AI) · First review milestone prototype developed with React, Vite, and FastAPI.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

