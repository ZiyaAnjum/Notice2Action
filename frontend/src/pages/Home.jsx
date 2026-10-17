import { useState, useEffect } from "react";
import { Header } from "../components/Header";
import { DeadlineCard } from "../components/DeadlineCard";
import { DocumentChecklist } from "../components/DocumentChecklist";
import { ActionStepList } from "../components/ActionStepList";
import { WarningsList } from "../components/WarningsList";
import { EvidenceBadge } from "../components/EvidenceBadge";
import { fetchSampleNotice, uploadNoticePdf } from "../api/client";
import sampleNotice from "../mocks/sample_notice.json";

export function Home() {
  const [notice, setNotice] = useState(sampleNotice);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Viewing baseline sample mock notice");

  useEffect(() => {
    // Attempt fetching sample notice from live backend API, fallback is automatic
    fetchSampleNotice()
      .then((data) => {
        if (data) setNotice(data);
      })
      .catch((err) => {
        console.warn("Using bundled mock sample:", err);
      });
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      alert("Invalid file: Notice to Action accepts PDF documents only.");
      return;
    }

    setIsLoading(true);
    setStatusMessage(`Processing uploaded notice: ${file.name}...`);
    try {
      const extracted = await uploadNoticePdf(file);
      setNotice(extracted);
      setStatusMessage(`Extracted action plan for "${file.name}"`);
    } catch (err) {
      console.error(err);
      setStatusMessage(`Error processing notice: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
      <Header category={notice.category} onUploadClick={handleFileUpload} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-6">
        {/* Banner notification */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm text-emerald-900">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${isLoading ? "bg-amber-500 animate-spin" : "bg-emerald-500 animate-pulse"}`}
            ></span>
            <span>{isLoading ? "Processing PDF notice..." : statusMessage}</span>
          </div>
          <span className="font-mono text-xs text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
            Notice ID: {notice.notice_id} (Schema v{notice.schema_version})
          </span>
        </div>

        {/* Notice Subject and Meta Header */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                {notice.category}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Confidence: {Math.round((notice.category_confidence || 0) * 100)}%
              </span>
            </div>
            <EvidenceBadge evidence={notice.title?.evidence} status={notice.title?.status} />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight leading-snug">
            {notice.title?.value || "Official Notice"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Issuing Authority
              </span>
              <p className="font-medium text-slate-800 mt-0.5">
                {notice.issuer?.value || "Not specified in notice"}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Target Beneficiary / Affected Party
              </span>
              <p className="font-medium text-slate-800 mt-0.5">
                {notice.affected_party?.value || "Not specified"}
              </p>
            </div>
          </div>

          {notice.summary_plain?.value && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-900 block mb-1">Plain-Language Summary:</span>
              {notice.summary_plain.value}
            </div>
          )}
        </div>

        {/* Most Prominent Element: Deadline Card */}
        <DeadlineCard deadlines={notice.deadlines} />

        {/* Warnings & Ambiguity Alerts */}
        <WarningsList warnings={notice.warnings} documentQuality={notice.document_quality} />

        {/* Two-column layout for Action Steps and Document Checklist */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActionStepList
            steps={notice.action_steps}
            submissionChannel={notice.submission_channel}
          />
          <DocumentChecklist documents={notice.required_documents} />
        </div>

        {/* Fees / Penalties Section */}
        {notice.fees_penalties && notice.fees_penalties.length > 0 && (
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              Penalties, Late Fees & Consequences
            </h3>
            <div className="space-y-3">
              {notice.fees_penalties.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                      {item.amount || "Consequence"}
                    </span>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">{item.description}</p>
                  </div>
                  <EvidenceBadge evidence={item.evidence} status={item.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          <p className="font-semibold text-slate-700">Notice to Action • Team Action4AI</p>
          <p className="mt-1">
            Zero-hallucination AI notice analysis. Verifiable evidence links for all critical claims.
          </p>
        </div>
      </footer>
    </div>
  );
}
