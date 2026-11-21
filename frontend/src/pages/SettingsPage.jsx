import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  FileCheck,
  LifeBuoy,
  Languages,
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
import { useLanguage } from "../context/useLanguage";
import { useTranslation } from "../context/useTranslation";
import { SUPPORTED_LANGUAGES } from "../utils/languages";

export function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(true);
  const navigate = useNavigate();
  const { endDemoSession } = useAuth();
  const { focusCategories, setFocusCategories } = useWorkspacePreferences();
  const { language, setLanguage } = useLanguage();
  const t = useTranslation();

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
        eyebrow="Workspace preferences"
        title="Settings"
        description="Review the current frontend session, appearance, support information, and connected service status."
      />

      <section className="surface-card p-5 sm:p-6" aria-labelledby="language-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
            <Languages className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="language-title" className="text-base font-extrabold text-navy-950">
              {t("language.section")}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {t("language.description")}
            </p>
            <div className="mt-4 max-w-md">
              <label
                htmlFor="interface-language"
                className="mb-1.5 block text-xs font-bold text-slate-700"
              >
                {t("language.label")}
              </label>
              <select
                id="interface-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-describedby="language-help"
                className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-purple-300"
              >
                {SUPPORTED_LANGUAGES.map(({ code, name, locale }) => (
                  <option key={code} value={code} lang={locale}>
                    {name}
                  </option>
                ))}
              </select>
              <p id="language-help" className="mt-1.5 text-[11px] leading-5 text-slate-500">
                {t("language.help")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="profile-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="profile-title" className="text-base font-extrabold text-navy-950">
                Profile & account
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Account identity is not connected to an authentication service.
              </p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <dt className="text-xs font-medium text-slate-500">Session</dt>
              <dd className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                Frontend demo
              </dd>
            </div>
            <div className="px-3.5 py-3">
              <dt className="text-xs font-medium text-slate-500">Project affiliation</dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-slate-800">
                ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Profile editing and account verification will be available after backend authentication is integrated.
          </p>
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="notifications-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">
              <Bell className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="notifications-title" className="text-base font-extrabold text-navy-950">
                Notification preferences
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Reminder delivery preferences are not connected to a notification service.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">Reminder tracking is available</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Saved reminders can be reviewed and managed from the Calendar and Reminders pages. In-app reminder links work; email and push delivery are not configured.
            </p>
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="appearance-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <Palette className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="appearance-title" className="text-base font-extrabold text-navy-950">
                Appearance
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The current application theme is applied consistently across the workspace.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-bold text-slate-800">Navy & violet</p>
              <p className="mt-1 text-xs text-slate-500">Light workspace theme</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-800">
              <span className="h-2 w-2 rounded-full bg-purple-600" />
              Active theme
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Theme switching is not enabled; no appearance preference is saved.
          </p>
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="backend-status-title">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-cyan-200">
                <Server className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="backend-status-title" className="text-base font-extrabold text-navy-950">
                  Connected service
                </h2>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{API_BASE_URL}</p>
              </div>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                checkingHealth
                  ? "bg-slate-100 text-slate-600"
                  : health?.status === "healthy"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                checkingHealth
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
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ["Version", health.version || "Not reported"],
                ["Database", health.database || "Not reported"],
                ["Environment", health.environment || "Not reported"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="category-title">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
            <FileCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="category-title" className="text-base font-extrabold text-navy-950">
              Categories recognised by the current processor
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Notice2Action is designed for communications from different organisations. These are the categories currently returned by the connected processing service; broader classification support requires backend integration.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUPPORTED_CATEGORIES.map((category) => (
            <article key={category.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-slate-900">{category.label}</h3>
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                  {category.key}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{category.description}</p>
            </article>
          ))}
          <article className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-900">{OUT_OF_SCOPE_CATEGORY.label}</h3>
              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                {OUT_OF_SCOPE_CATEGORY.key}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{OUT_OF_SCOPE_CATEGORY.description}</p>
          </article>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="focus-categories-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <FileCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="focus-categories-title" className="text-base font-extrabold text-navy-950">
                Your focus categories
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                Choose categories to pin to the dashboard. This preference is saved only in this browser and does not change how documents are processed.
              </p>
            </div>
          </div>
          {focusCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setFocusCategories([])}
              className="focus-ring self-start rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              Clear selection
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_CATEGORIES.map((category) => (
            <label
              key={category.key}
              className="flex min-h-12 cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition hover:border-purple-200 hover:bg-purple-50/40"
            >
              <input
                type="checkbox"
                checked={focusCategories.includes(category.key)}
                onChange={() => toggleFocusCategory(category.key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-purple-700 focus:ring-purple-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">{category.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{category.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-[11px] font-medium text-slate-500">
          {focusCategories.length
            ? `${focusCategories.length} ${focusCategories.length === 1 ? "category" : "categories"} saved locally.`
            : "No focus categories selected."}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-navy-950">Help & review guidance</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Check the original notice PDF before acting on extracted dates, amounts, or requirements. Use the notice details page to review available source information.
              </p>
            </div>
          </div>
        </div>
        <div className="surface-card flex flex-col justify-between gap-4 p-5 sm:min-w-64 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-950">
              <LockKeyhole className="h-4 w-4 text-purple-700" aria-hidden="true" />
              Demo session controls
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Leaving this demo clears its local preview session.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Exit demo
          </button>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs leading-5 text-slate-500">
        <ShieldCheck className="h-4 w-4 shrink-0 text-purple-700" aria-hidden="true" />
        <span>
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
          These settings describe current frontend behavior; no unsupported preference changes are presented as saved.
        </span>
      </p>
    </main>
  );
}
