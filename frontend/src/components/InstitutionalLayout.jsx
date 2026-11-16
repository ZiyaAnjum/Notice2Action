import { useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileUp,
  Files,
  Calendar,
  Bell,
  Settings,
  Search,
  Menu,
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
} from "lucide-react";

export function InstitutionalLayout({ children, alertCount = 0 }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/notices?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setMobileMenuOpen(false);
    }
  };

  const navItems = [
    { label: "Dashboard", to: "/", icon: LayoutDashboard, exact: true },
    { label: "Upload Notice", to: "/upload", icon: FileUp },
    { label: "All Notices", to: "/notices", icon: Files },
    { label: "Calendar", to: "/calendar", icon: Calendar },
    { label: "Reminders", to: "/reminders", icon: Bell },
    { label: "Settings", to: "/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-stone-900 flex flex-col font-sans antialiased selection:bg-teal-600 selection:text-white">
      {/* Top Institutional Header Banner */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200/90 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Institute Emblem & Brand */}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 focus:outline-hidden focus:ring-2 focus:ring-teal-600"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link
              to="/"
              className="flex items-center gap-3 focus:outline-hidden focus:ring-2 focus:ring-teal-600 rounded-lg p-1 group"
              aria-label="Notice to Action home"
            >
              {/* Institutional Crest Icon */}
              <div className="w-9 h-9 rounded-xl bg-charcoal-900 text-teal-400 border border-charcoal-800 flex items-center justify-center font-black text-lg shadow-xs group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5 text-teal-400" />
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-stone-900 text-base tracking-tight leading-none">
                    Notice2Action
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200/80 px-1.5 py-0.2 rounded">
                    AITM
                  </span>
                </div>
                <span className="text-[11px] text-stone-500 font-medium block mt-0.5">
                  Read · Understand · Act
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Search notices / keywords */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 max-w-md mx-2 sm:mx-4 hidden md:block"
            role="search"
          >
            <div className="relative">
              <Search
                className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notices, keywords, dates..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white transition-colors"
                aria-label="Search notices"
              />
            </div>
          </form>

          {/* Right: Notifications & User Profile */}
          <div className="flex items-center gap-3">
            {/* Notifications Popover Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="View notifications and alerts"
              >
                <Bell className="w-5 h-5" />
                {alertCount > 0 && (
                  <span className="absolute 1 top-1 right-1 w-4 h-4 bg-coral-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                    {alertCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-stone-200 rounded-2xl shadow-elevated p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <span className="font-extrabold text-sm text-stone-900">Notifications &amp; Alerts</span>
                    <span className="text-xs text-stone-500 font-medium">Auto-tracked</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-900 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Zero-Hallucination Guard Active</p>
                        <p className="text-[11px] text-teal-800">Every deadline is grounded directly against verbatim document text.</p>
                      </div>
                    </div>
                    {alertCount > 0 ? (
                      <div className="p-2.5 rounded-xl bg-coral-50 border border-coral-200/80 text-coral-900 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-coral-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">{alertCount} Notice(s) Need Attention</p>
                          <Link
                            to="/notices"
                            onClick={() => setShowNotifications(false)}
                            className="text-coral-700 underline font-semibold text-[11px] hover:text-coral-900"
                          >
                            Review on All Notices &rarr;
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-sage-50 border border-sage-200/80 text-sage-900 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-sage-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">All Deadlines On Schedule</p>
                          <p className="text-[11px] text-sage-800">No overdue notices or unaddressed action steps.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
              <div
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-700 to-teal-500 text-white font-extrabold text-xs flex items-center justify-center shadow-xs"
                title="Aysha Shaza - Frontend & UX"
              >
                AS
              </div>
              <div className="hidden lg:block text-left">
                <span className="text-xs font-bold text-stone-900 block leading-tight">
                  Aysha Shaza
                </span>
                <span className="text-[10px] text-stone-500 font-medium">Frontend &amp; UX</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        {/* Left Sidebar Navigation (Desktop) */}
        <aside
          className={`w-full lg:w-64 bg-charcoal-900 text-stone-200 rounded-3xl p-5 shadow-elevated flex-shrink-0 border border-charcoal-800 space-y-6 ${
            mobileMenuOpen ? "block" : "hidden lg:block"
          }`}
          aria-label="Institutional Dashboard Navigation"
        >
          {/* Sidebar Header / Brand */}
          <div className="px-2 pt-1 pb-2 border-b border-charcoal-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-600/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-sm text-white tracking-tight block">
                  Institutional Suite
                </span>
                <span className="text-[10px] text-stone-400 font-medium">Notice Management</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-teal-400 ${
                    isActive
                      ? "bg-teal-600 text-white shadow-teal shadow-xs font-extrabold"
                      : "text-stone-300 hover:text-white hover:bg-charcoal-800"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-stone-400"}`} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Institutional Trust & Version Card */}
          <div className="pt-4 border-t border-charcoal-800 text-xs text-stone-400 space-y-2">
            <div className="flex items-center gap-2 text-stone-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Grounding Engine: Active</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Official institutional notices extracted with verbatim evidence and strict date disambiguation.
            </p>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 w-full min-w-0">{children}</div>
      </div>

      {/* Institutional Footer */}
      <footer className="mt-auto border-t border-stone-200/80 bg-white py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-1">
          <p className="font-semibold text-stone-700">
            Notice2Action · Alliance Institute of Technology &amp; Management (AITM)
          </p>
          <p className="text-[11px] text-stone-500">
            Institutional AI Notice Grounding &amp; Actionable Execution Engine · Always cross-check original notice PDF.
          </p>
        </div>
      </footer>
    </div>
  );
}

