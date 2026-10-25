import { Link, NavLink } from "react-router-dom";
import { FileUp, Files, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="bg-white border-b-2 border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 rounded-lg p-1"
          aria-label="Notice to Action home"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm font-black text-xl">
            N
          </div>
          <div>
            <span className="text-xl font-extrabold text-slate-950 tracking-tight block leading-tight">
              Notice to Action
            </span>
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Verified Plain-Language Actions
            </span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main Navigation">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-indigo-600 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 border-2 border-indigo-200"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-transparent"
              }`
            }
          >
            <FileUp className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <span>Upload Notice</span>
          </NavLink>

          <NavLink
            to="/notices"
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-indigo-600 ${
                isActive
                  ? "bg-indigo-50 text-indigo-700 border-2 border-indigo-200"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-transparent"
              }`
            }
          >
            <Files className="w-4 h-4 text-indigo-600" aria-hidden="true" />
            <span>Past Notices</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
