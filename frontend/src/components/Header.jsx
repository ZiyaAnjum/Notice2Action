import { Link, NavLink } from "react-router-dom";
import { FileUp, Files, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/80 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <Link
          to="/"
          className="flex items-center gap-3.5 group focus:outline-hidden focus:ring-2 focus:ring-cyan-400 rounded-xl p-1 transition-all"
          aria-label="Notice to Action home"
        >
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-royal-700 via-royal-600 to-cyan-400 flex items-center justify-center text-white shadow-glow group-hover:scale-105 transition-transform duration-200">
            <span className="font-black text-xl tracking-tighter">N</span>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full border-2 border-navy-950" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold text-white tracking-tight block leading-tight">
                Notice to Action
              </span>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                AI Action Engine
              </span>
            </div>

            <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
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
              `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-cyan-400 ${
                isActive
                  ? "bg-gradient-to-r from-royal-600 to-royal-700 text-white shadow-glow border border-royal-400/40"
                  : "text-slate-300 hover:text-white hover:bg-navy-900 border border-transparent"
              }`
            }
          >
            <FileUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Upload Notice</span>
          </NavLink>

          <NavLink
            to="/notices"
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px] focus:outline-hidden focus:ring-2 focus:ring-cyan-400 ${
                isActive
                  ? "bg-gradient-to-r from-royal-600 to-royal-700 text-white shadow-glow border border-royal-400/40"
                  : "text-slate-300 hover:text-white hover:bg-navy-900 border border-transparent"
              }`
            }
          >
            <Files className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Past Notices</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}