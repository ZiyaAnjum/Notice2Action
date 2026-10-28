import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { SourceViewerModal } from "../components/SourceViewerModal";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    getNoticePage: vi.fn(),
    getNoticeFileUrl: vi.fn((id) => `http://localhost:8000/api/notices/${id}/file`),
  };
});

describe("SourceViewerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads page text and highlights quote using whitespace-normalized matching", async () => {
    api.getNoticePage.mockResolvedValueOnce({
      page_number: 1,
      text: "This is official text. You MUST pay within 30 days of this notice. Failure to comply will lead to enforcement.",
      char_count: 110,
    });

    // Evidence quote with different line/whitespace formatting
    const evidenceQuote = "You   MUST pay\nwithin 30 days of this notice.";

    const { container } = render(
      <SourceViewerModal
        noticeId="notice-123"
        page={1}
        quote={evidenceQuote}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Notice Evidence • Page 1/i)).toBeInTheDocument();
    });

    // Highlight mark element should be present
    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveTextContent("You MUST pay within 30 days of this notice.");

    // Link to original PDF
    const pdfLink = screen.getByRole("link", { name: /Original PDF/i });
    expect(pdfLink).toHaveAttribute(
      "href",
      "http://localhost:8000/api/notices/notice-123/file"
    );
  });

  it("handles quote-not-found case gracefully with explanatory warning", async () => {
    api.getNoticePage.mockResolvedValueOnce({
      page_number: 2,
      text: "General instructions about filing inquiries and appeals.",
      char_count: 57,
    });

    const missingQuote = "A completely different clause that was not on page 2.";

    render(
      <SourceViewerModal
        noticeId="notice-123"
        page={2}
        quote={missingQuote}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Quote not located precisely/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/The exact quote was not found on this page\. Showing full page text\./i)
    ).toBeInTheDocument();

    // Full text should still be rendered safely without crashing
    expect(
      screen.getByText(/General instructions about filing inquiries and appeals\./i)
    ).toBeInTheDocument();
  });
});
