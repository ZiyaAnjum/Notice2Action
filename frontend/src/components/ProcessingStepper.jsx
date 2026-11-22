import {
  UploadCloud,
  FileSearch,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

const STAGES = [
  { key: "uploading", label: "Uploading", icon: UploadCloud, description: "Receiving document file" },
  { key: "reading_text", label: "Reading text", icon: FileSearch, description: "Extracting digital text & OCR" },
  { key: "understanding", label: "Understanding", icon: Sparkles, description: "Extracting dates, actions & amounts" },
  { key: "checking", label: "Checking", icon: ShieldCheck, description: "Verifying quotes & grounded claims" },
];

export function ProcessingStepper({ stage = "uploading", progress = 10, onRefresh = null }) {
  // Map current stage to index
  const stageKeys = ["uploading", "reading_text", "understanding", "checking", "done"];
  const currentIndex = Math.max(0, stageKeys.indexOf(stage));

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-6" aria-live="polite">
      {/* Active Processing Card with Stepper */}
      <section className="bg-white border-2 border-purple-200 rounded-3xl p-6 sm:p-10 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-purple-100 text-purple-900">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" aria-hidden="true" />
            <span>Processing your notice</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-navy-950">
            Extracting Action Plan & Deadlines
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto font-medium">
            Our pipeline is extracting text, computing payment dates, and verifying every requirement against the source document.
          </p>
        </div>

        {/* 4-Step Stepper */}
        <div className="pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative">
            {STAGES.map((s, idx) => {
              const isPast = currentIndex > idx;
              const isCurrent = currentIndex === idx;
              const isFuture = currentIndex < idx;

              return (
                <div
                  key={s.key}
                  className={`flex flex-col items-center text-center p-3.5 rounded-2xl border transition-all ${
                    isCurrent
                      ? "bg-purple-50/80 border-2 border-purple-600 shadow-xs ring-4 ring-purple-100"
                      : isPast
                      ? "bg-emerald-50/50 border-emerald-200 text-emerald-950"
                      : "bg-slate-50 border-slate-200 opacity-60 text-slate-400"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${
                      isCurrent
                        ? "bg-purple-600 text-white shadow-sm"
                        : isPast
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <s.icon className="w-5 h-5" aria-hidden="true" />
                    )}
                  </div>

                  <p
                    className={`text-xs font-black tracking-tight ${
                      isCurrent
                        ? "text-purple-950"
                        : isPast
                        ? "text-emerald-950"
                        : "text-slate-500"
                    }`}
                  >
                    {s.label}
                  </p>
                  <span className="text-[10px] text-slate-500 mt-0.5 hidden sm:block">
                    {s.description}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {onRefresh && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-hidden focus:ring-2 focus:ring-purple-600 min-h-[36px]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Status</span>
            </button>
          </div>
        )}
      </section>

      {/* Skeleton Placeholders so screen is never blank */}
      <div className="space-y-6 opacity-75 pointer-events-none" aria-hidden="true">
        {/* Decision Card Skeleton */}
        <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 sm:p-8 space-y-4 animate-pulse">
          <div className="flex gap-2">
            <div className="h-6 w-28 bg-slate-200 rounded-full" />
            <div className="h-6 w-44 bg-slate-200 rounded-full" />
          </div>
          <div className="h-10 w-3/4 bg-slate-200 rounded-xl" />
          <div className="flex gap-4 pt-2">
            <div className="h-12 w-40 bg-slate-200 rounded-xl" />
            <div className="h-8 w-32 bg-slate-200 rounded-full" />
          </div>
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <div className="h-10 w-32 bg-slate-200 rounded-xl" />
            <div className="h-10 w-36 bg-slate-200 rounded-xl" />
            <div className="h-10 w-24 bg-slate-200 rounded-xl" />
          </div>
        </div>

        {/* Action Checklist Skeleton */}
        <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 sm:p-8 space-y-4 animate-pulse">
          <div className="h-7 w-32 bg-slate-200 rounded-lg" />
          <div className="space-y-3">
            <div className="h-16 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-16 bg-slate-100 rounded-2xl border border-slate-200" />
          </div>
        </div>

        {/* Timeline Skeleton */}
        <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 sm:p-8 space-y-4 animate-pulse">
          <div className="h-7 w-48 bg-slate-200 rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
}

