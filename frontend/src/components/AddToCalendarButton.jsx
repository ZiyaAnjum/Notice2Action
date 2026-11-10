import { useState, useRef, useEffect } from "react";
import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { generateIcsContent, getGoogleCalendarUrl, triggerIcsDownload } from "../utils/calendar";

export function AddToCalendarButton({ title, description, dateStr, noticeId, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const icsContent = dateStr
    ? generateIcsContent({ title, description, dateStr, noticeId })
    : null;
  const googleUrl = dateStr
    ? getGoogleCalendarUrl({ title, description, dateStr })
    : null;

  if (!icsContent && !googleUrl) {
    return null;
  }

  const handleDownloadIcs = () => {
    triggerIcsDownload("notice-deadline.ics", icsContent);
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white text-indigo-700 hover:bg-indigo-50 border-2 border-indigo-200 hover:border-indigo-400 shadow-xs transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-600 min-h-[44px]"
      >
        <CalendarPlus className="w-4 h-4 text-indigo-600 flex-shrink-0" aria-hidden="true" />
        <span>Add to Calendar</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 sm:right-auto sm:left-0 z-30 mt-2 w-64 rounded-xl bg-white border-2 border-slate-200 shadow-xl p-1.5 space-y-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadIcs}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 transition-colors focus:outline-hidden focus:bg-indigo-50"
          >
            <Download className="w-4 h-4 text-indigo-600 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">Download .ics File</p>
              <p className="text-[11px] font-normal text-slate-500">Apple Calendar, Outlook, Android</p>
            </div>
          </button>

          {googleUrl && (
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 transition-colors focus:outline-hidden focus:bg-indigo-50"
            >
              <ExternalLink className="w-4 h-4 text-indigo-600 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Google Calendar</p>
                <p className="text-[11px] font-normal text-slate-500">Opens in a new browser tab</p>
              </div>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
