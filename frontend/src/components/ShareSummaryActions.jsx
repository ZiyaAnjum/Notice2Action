import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Printer, Share2 } from "lucide-react";

const SUMMARY_TITLE = "Notice2Action – Plain Language Summary";

function buildSummaryText(sections) {
  const sectionText = (sections || [])
    .map(({ question, displayContent }) =>
      `${question}\n${displayContent || "Not stated in the notice"}`
    )
    .join("\n\n");

  return `${SUMMARY_TITLE}\n\n${sectionText}`;
}

export function ShareSummaryActions({ sections = [], hasReadableSummary = false }) {
  const [feedback, setFeedback] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("status");
  const printListenerRef = useRef(null);

  const cleanupPrint = useCallback(() => {
    document.body.classList.remove("printing-notice-summary");
    if (printListenerRef.current) {
      window.removeEventListener("afterprint", printListenerRef.current);
      printListenerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupPrint();
  }, [cleanupPrint]);

  const showStatus = (message, kind = "status") => {
    setFeedback(message);
    setFeedbackKind(kind);
  };

  const copySummary = async (successMessage = "Summary copied to clipboard.") => {
    if (!navigator.clipboard?.writeText) {
      showStatus("Copying is not supported by this browser.", "error");
      return false;
    }

    try {
      await navigator.clipboard.writeText(buildSummaryText(sections));
      showStatus(successMessage);
      return true;
    } catch {
      showStatus("Could not copy the summary. Please try again.", "error");
      return false;
    }
  };

  const handleCopy = async () => {
    await copySummary();
  };

  const handleShare = async () => {
    const summaryText = buildSummaryText(sections);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: SUMMARY_TITLE, text: summaryText });
        showStatus("Summary shared.");
      } catch (error) {
        if (error?.name === "AbortError") {
          showStatus("Sharing cancelled.");
        } else {
          showStatus("Could not share the summary. Please try again.", "error");
        }
      }
      return;
    }

    await copySummary("Summary copied to clipboard for sharing.");
  };

  const handlePrint = () => {
    if (typeof window.print !== "function") {
      showStatus("Printing is not supported by this browser.", "error");
      return;
    }

    cleanupPrint();

    const handleAfterPrint = () => {
      cleanupPrint();
      showStatus("Print dialog closed.");
    };

    printListenerRef.current = handleAfterPrint;
    window.addEventListener("afterprint", handleAfterPrint);
    document.body.classList.add("printing-notice-summary");

    try {
      window.print();
    } catch {
      cleanupPrint();
      showStatus("Could not open the print dialog. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-3" aria-label="Share notice summary actions">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasReadableSummary}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-300 bg-white px-3.5 text-xs font-bold text-teal-800 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Copy notice summary"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          <span>Copy Summary</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          disabled={!hasReadableSummary}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-300 bg-white px-3.5 text-xs font-bold text-teal-800 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Share notice summary"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span>Share Summary</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          disabled={!hasReadableSummary}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Print notice summary"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          <span>Print Summary</span>
        </button>
      </div>

      {feedback && (
        <p
          role={feedbackKind === "error" ? "alert" : "status"}
          aria-live={feedbackKind === "error" ? "assertive" : "polite"}
          className={`text-xs font-medium ${feedbackKind === "error" ? "text-rose-700" : "text-slate-600"}`}
        >
          {feedback}
        </p>
      )}

      <div className="share-summary-print-only" aria-hidden="true">
        <h1>{SUMMARY_TITLE}</h1>
        {(sections || []).map(({ key, question, displayContent }) => (
          <section key={key}>
            <h2>{question}</h2>
            <p>{displayContent || "Not stated in the notice"}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
