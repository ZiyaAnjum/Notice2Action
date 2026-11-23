import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  FileCheck,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Palette,
  Server,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { API_BASE_URL } from "../api/client";
import { SUPPORTED_CATEGORIES, OUT_OF_SCOPE_CATEGORY } from "../utils/categories";
import { useAuth } from "../context/useAuth";
import { useWorkspacePreferences } from "../context/useWorkspacePreferences";
import { PageHeader } from "../components/PageHeader";

export function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const navigate = useNavigate();
  const { endDemoSession } = useAuth();
  const { focusCategories, setFocusCategories } = useWorkspacePreferences();

  useEffect(() => {
    async function checkBackendHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
          setHealth(await response.json());
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

  const handleLogout = () => {
    endDemoSession();
    navigate("/login", { replace: true });
  };

  const toggleFocusCategory = (categoryKey) => {
    const next = focusCategories.includes(categoryKey)
      ? focusCategories.filter((key) => key !== categoryKey)
      : [...focusCategories, categoryKey];
    setFocusCategories(next);
  };

  return (
    <main className="page-shell max-w-5xl space-y-6">
      <PageHeader
        icon={Settings}
        eyebrow="Preferences &amp; System"
        title="Settings &amp; Preferences"
        description="Review workspace configuration, user preferences, institutional affiliation, and connected backend service health."
      />

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        {/* Profile Card */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="profile-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="profile-title" className="text-sm sm:text-base font-extrabold text-navy-950">
                Profile &amp; Session
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                Current active preview session details
              </p>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <dt className="text-xs font-semibold text-slate-500">Session Mode</dt>
              <dd className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                Frontend Demo
              </dd>
            </div>
            <div className="px-3.5 py-2.5">
              <dt className="text-xs font-semibold text-slate-500">Affiliation</dt>
              <dd className="mt-0.5 text-xs font-bold leading-relaxed text-navy-950">
                ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Profile customization and directory sync will become available when live authentication is connected.
          </p>
        </section>

        {/* Notifications Card */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="notifications-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800 border border-cyan-100">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="notifications-title" className="text-sm sm:text-base font-extrabold text-navy-950">
                Notification Delivery
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                Reminder alerts and delivery preferences
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
            <p className="text-xs font-extrabold text-navy-950">In-App Tracking Active</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Deadlines are recorded locally and displayed across the Calendar and Reminders views. External email and SMS delivery are not configured.
            </p>
          </div>
        </section>

        {/* Appearance Card */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="appearance-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="appearance-title" className="text-sm sm:text-base font-extrabold text-navy-950">
                Design System &amp; Theme
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                Production-quality AI SaaS UI Blueprint
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5">
            <div>
              <p className="text-xs font-extrabold text-navy-950">Deep Navy &amp; Royal Purple</p>
              <p className="text-[11px] text-slate-500">Cyan Accents · High-contrast typography</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[10px] font-bold text-purple-800 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              Active System
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Complies with institutional accessibility and reduced-motion standards.
          </p>
        </section>

        {/* Backend Status Card */}
        <section className="surface-card p-5 sm:p-6" aria-labelledby="backend-status-title">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-cyan-300">
                <Server className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="backend-status-title" className="text-sm sm:text-base font-extrabold text-navy-950">
                  Analysis Engine
                </h2>
                <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{API_BASE_URL}</p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${checkingHealth
                ? "bg-slate-100 text-slate-600 border border-slate-200"
                : health?.status === "healthy"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border border-rose-200 bg-rose-50 text-rose-800"
                }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${checkingHealth
                ? "bg-slate-400"
                : health?.status === "healthy"
                  ? "bg-emerald-500"
                  : "bg-rose-500"
                }`} />
              {checkingHealth
                ? "Checking"
                : health?.status === "healthy"
                  ? "Operational"
                  : "Offline"}
            </span>
          </div>
          {health?.status === "healthy" && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ["Version", health.version || "0.1.0"],
                ["Database", health.database || "Ready"],
                ["Environment", health.environment || "Production"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-0.5 break-words text-xs font-bold text-navy-950">{value}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recognized Categories */}
      <section className="surface-card p-5 sm:p-6" aria-labelledby="category-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
            <FileCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="category-title" className="text-sm sm:text-base font-extrabold text-navy-950">
              Supported Notice Categories
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 font-medium leading-relaxed">
              Categories recognized by the current processing service:
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUPPORTED_CATEGORIES.map((category) => (
            <article key={category.key} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-navy-950">{category.label}</h3>
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                  {category.key}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600 font-medium">{category.description}</p>
            </article>
          ))}
          <article className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-navy-950">{OUT_OF_SCOPE_CATEGORY.label}</h3>
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                {OUT_OF_SCOPE_CATEGORY.key}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 font-medium">{OUT_OF_SCOPE_CATEGORY.description}</p>
          </article>
        </div>
      </section>

      {/* Focus Categories Selection */}
      <section className="surface-card p-5 sm:p-6" aria-labelledby="focus-categories-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              <FileCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="focus-categories-title" className="text-sm sm:text-base font-extrabold text-navy-950">
                Your Focus Categories
              </h2>
              <p className="mt-0.5 max-w-2xl text-xs text-slate-500 font-medium leading-relaxed">
                Choose categories to highlight on your dashboard. Stored locally in your browser. This preference does not change how documents are processed.
              </p>
            </div>
          </div>
          {focusCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setFocusCategories([])}
              className="focus-ring self-start rounded-xl px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 transition"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_CATEGORIES.map((category) => (
            <label
              key={category.key}
              className="flex min-h-12 cursor-pointer items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-purple-300 hover:bg-purple-50/30"
            >
              <input
                type="checkbox"
                checked={focusCategories.includes(category.key)}
                onChange={() => toggleFocusCategory(category.key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-extrabold text-navy-950">{category.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{category.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-bold text-slate-400">
          {focusCategories.length
            ? `${focusCategories.length} ${focusCategories.length === 1 ? "category" : "categories"} pinned to your dashboard.`
            : "No focus categories selected."}
        </p>
      </section>

      {/* Review Guidance & Session Controls */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800 border border-cyan-100">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-navy-950">Review &amp; Verification Guidance</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Always review the original notice PDF before acting on extracted deadlines, fees, or documents. Use the Notice Details page to view verbatim quotes with exact page references.
              </p>
            </div>
          </div>
        </div>
        <div className="surface-card flex flex-col justify-between gap-4 p-5 sm:min-w-64 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-950">
              <LockKeyhole className="h-4 w-4 text-purple-700" aria-hidden="true" />
              Demo Session
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Leaving demo mode clears your preview session.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 shadow-xs"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Exit Demo Session
          </button>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-purple-700" aria-hidden="true" />
        <span>
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Settings accurately reflect frontend behavior and institutional preferences.
        </span>
      </p>
    </main>
  );
}
