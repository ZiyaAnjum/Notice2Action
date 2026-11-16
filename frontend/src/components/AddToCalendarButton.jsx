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
    if (!icsContent) return;
    const filename = `${title || "notice-deadline"}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .slice(0, 40);
    triggerIcsDownload(`${filename}.ics`, icsContent);
    setIsOpen(false);
  };

  const handleGoogleCalendar = () => {
    if (!googleUrl) return;
    window.open(googleUrl, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Add to Calendar"
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-600 shadow-xs min-h-[40px] w-full sm:w-auto transition-colors"
      >
        <CalendarPlus className="w-4 h-4 text-teal-700" aria-hidden="true" />
        <span>Add to Calendar</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-56 rounded-2xl bg-white border border-stone-200 shadow-elevated py-1.5 z-30 focus:outline-hidden animate-in fade-in duration-100"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleDownloadIcs}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm font-bold text-stone-700 hover:bg-teal-50 hover:text-teal-900 text-left transition-colors min-h-[40px]"
          >
            <Download className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <span>Download .ics File</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleGoogleCalendar}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs sm:text-sm font-bold text-stone-700 hover:bg-teal-50 hover:text-teal-900 text-left transition-colors min-h-[40px]"
          >
            <ExternalLink className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <span>Google Calendar</span>
          </button>
        </div>
      )}
    </div>
  );
}
