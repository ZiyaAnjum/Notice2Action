export function Header({ category, onUploadClick }) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-xl shadow-sm">
            N
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Notice to Action</h1>
            <p className="text-xs text-slate-500 font-medium">Team Action4AI • Evidence-Linked Action Plans</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {category && (
            <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-300">
              Category: {category}
            </span>
          )}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs">
            <span>Upload PDF Notice</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={onUploadClick}
            />
          </label>
        </div>
      </div>
    </header>
  );
}
