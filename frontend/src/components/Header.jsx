import { Link, NavLink } from "react-router-dom";
import { FileUp, Files, ShieldCheck, GraduationCap } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-navy-900/95 backdrop-blur-md border-b border-navy-800 text-white shadow-elevated">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-3.5 group focus:outline-hidden focus:ring-2 focus:ring-purple-400 rounded-xl p-1 transition-all"
          aria-label="Notice to Action home"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 via-purple-600 to-cyan-400 flex items-center justify-center text-white shadow-glow group-hover:scale-105 transition-transform duration-200">
            <GraduationCap className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-white tracking-tight block leading-tight">
                Notice2Action
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/20 text-cyan-300 border border-purple-500/30">
                AI Action Engine
              </span>
            </div>

            <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Verified Plain-Language Actions
            </span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav
          className="flex items-center gap-2 sm:gap-3"
          aria-label="Main Navigation"
        >
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[42px] focus:outline-hidden focus:ring-2 focus:ring-purple-400 ${
                isActive
                  ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-glow border border-purple-400/40"
                  : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
              }`
            }
          >
            <FileUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Upload Notice</span>
          </NavLink>

          <NavLink
            to="/notices"
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[42px] focus:outline-hidden focus:ring-2 focus:ring-purple-400 ${
                isActive
                  ? "bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-glow border border-purple-400/40"
                  : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
              }`
            }
          >
            <Files className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>All Notices</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
