import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  FileUp,
  Files,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../context/useTranslation";

const navItems = [
  { label: "nav.dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "nav.upload", to: "/upload", icon: FileUp },
  { label: "nav.notices", to: "/notices", icon: Files },
  { label: "nav.calendar", to: "/calendar", icon: CalendarDays },
  { label: "nav.reminders", to: "/reminders", icon: Bell },
  { label: "nav.settings", to: "/settings", icon: Settings },
];

export function InstitutionalLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { endDemoSession } = useAuth();
  const t = useTranslation();

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      navigate(`/notices?q=${encodeURIComponent(query)}`);
      setSearchQuery("");
      setSearchOpen(false);
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    endDemoSession();
    navigate("/login", { replace: true });
  };

  const searchForm = (
    <form onSubmit={handleSearchSubmit} role="search" className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder={t("search.placeholder")}
        className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-300 focus:bg-white"
        aria-label={t("search.label")}
      />
    </form>
  );

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-xs backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label={mobileMenuOpen ? t("menu.close") : t("menu.open")}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              to="/dashboard"
              className="focus-ring flex min-w-0 items-center gap-3 rounded-xl"
              aria-label="Notice2Action dashboard"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 to-purple-700 text-white shadow-glow">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-extrabold tracking-tight text-navy-950">
                  Notice2Action
                </span>
                <span className="block max-w-[16rem] truncate text-[10px] font-medium text-slate-500">
                  Anjuman Institute of Technology and Management, Bhatkal
                </span>
              </span>
            </Link>
          </div>

          <form
            onSubmit={handleSearchSubmit}
            role="search"
            className="relative mx-4 hidden w-full max-w-md md:block"
          >
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("search.placeholder")}
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-300 focus:bg-white"
              aria-label={t("search.label")}
            />
          </form>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Toggle notice search"
              aria-expanded={searchOpen}
            >
              <Search className="h-5 w-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((visible) => !visible)}
                className="focus-ring relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                aria-label="View notifications"
                aria-expanded={showNotifications}
              >
                <Bell className="h-5 w-5" />
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-elevated">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy-950">Deadline reminders</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Review your saved reminder dates and status in the reminders view.
                      </p>
                      <Link
                        to="/reminders"
                        onClick={() => setShowNotifications(false)}
                        className="mt-2 inline-flex text-xs font-bold text-purple-700 hover:text-purple-900"
                      >
                        Open reminders
                      </Link>
                      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-500">
                        Push notifications are not configured in this frontend.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-xs font-extrabold text-purple-800">
                P
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-xs font-bold text-navy-950">Preview session</span>
                <span className="block text-[10px] text-slate-500">Frontend preview</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-navy-950 sm:px-3"
              aria-label="Exit demo session"
              title="Exit demo session"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Exit demo</span>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="border-t border-slate-100 px-4 py-3 md:hidden">{searchForm}</div>
        )}
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-screen-2xl grid-cols-1 items-start gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-7 lg:px-8">
        {mobileMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-navy-950/30 lg:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <aside
          className={`${
            mobileMenuOpen ? "block" : "hidden"
          } relative z-30 rounded-2xl border border-navy-800/70 bg-navy-950 p-4 text-white shadow-elevated lg:sticky lg:top-[92px] lg:block`}
          aria-label="Notice2Action workspace navigation"
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-cyan-200">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold">Notice intelligence</span>
              <span className="mt-0.5 block text-[11px] text-slate-300">Across your documents</span>
            </span>
          </div>

          <nav className="mt-4 space-y-1.5" aria-label={t("nav.label")}>
            {navItems.map(({ label, to, icon: Icon }) => {
              const isActive =
                location.pathname === to ||
                (to === "/notices" && location.pathname.startsWith("/notices/"));
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/dashboard"}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive: navActive }) =>
                    `focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                      isActive || navActive
                        ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-glow"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span>{t(label)}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
              <span className="h-2 w-2 rounded-full bg-cyan-300" />
              Frontend demo
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-300">
              Account verification and secure authentication require backend integration.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring mt-4 flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Exit demo session
          </button>
        </aside>

        <div className="min-w-0">
          {children ?? <Outlet />}
        </div>
      </div>

      <footer className="border-t border-slate-200/80 bg-white/85 py-5 text-center">
        <p className="px-4 text-xs font-semibold text-slate-700">
          Notice2Action · ANJUMAN INSTITUTE OF TECHNOLOGY AND MANAGEMENT, BHATKAL
        </p>
        <p className="mt-1 px-4 text-[11px] leading-5 text-slate-500">
          Review original notice documents to confirm extracted information and deadlines.
        </p>
      </footer>
    </div>
  );
}
