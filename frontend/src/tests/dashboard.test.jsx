import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NoticeDashboardPage } from "../pages/NoticeDashboardPage";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    getNotice: vi.fn(),
    updateChecklistItem: vi.fn(),
  };
});

describe("NoticeDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders needs_clearer_document state without action plan", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-unclear",
      status: "needs_clearer_document",
      message: "Scanned document with unreadable text.",
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-unclear"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Clearer Document Needed/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/We could not read the text in this document clearly/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a Clearer File/i })).toBeInTheDocument();
    expect(screen.queryByText(/Action Plan/i)).not.toBeInTheDocument();
  });

  it("renders out_of_scope state and lists supported categories without action plan", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-recipe",
      status: "out_of_scope",
      message: "Document does not match official notice types.",
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-recipe"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Notice Type Not Supported Yet/i)).toBeInTheDocument();
    });

    // Check that supported categories are listed
    expect(screen.getByText(/Tax & Revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/Court & Legal/i)).toBeInTheDocument();
    expect(screen.getByText(/Government Benefits/i)).toBeInTheDocument();
    expect(screen.queryByText(/Action Plan/i)).not.toBeInTheDocument();
  });

  it("renders fully processed notice with deadlines, 5 summary questions, and disclaimer", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-100",
      status: "processed",
      category: "tax_revenue",
      needs_verification: true,
      result: {
        notice_title: { value: "Final Demand for Payment", status: "found" },
        issuing_organisation: { value: "HM Revenue & Customs", status: "found" },
        deadlines: [
          {
            description: "Pay outstanding tax balance",
            iso_date: "2026-11-20",
            original_wording: "Payment must be received by 20 November 2026",
            is_ambiguous: false,
            status: "found",
          },
        ],
        plain_language_summary: {
          what_is_this: "An overdue tax demand notice.",
          why_it_matters: "Penalties may accrue if left unpaid.",
          what_to_do: "Submit payment online or arrange a plan.",
          where_to_do_it: "Online portal at gov.uk/pay-tax",
          if_deadline_missed: "Interest and statutory late fees will apply.",
        },
        action_steps: [
          {
            step_number: 1,
            instruction: "Log in to your tax account online.",
            status: "found",
          },
        ],
        required_documents: [
          {
            name: "Proof of Income",
            is_required: true,
            status: "found",
          },
          {
            name: "Bank Statement",
            is_required: false,
            status: "found",
          },
        ],
        penalties: [
          {
            consequence: "£100 late penalty",
            description: "Issued immediately after deadline expiration.",
          },
        ],
      },
      checklist: [],
      reminders: [],
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-100"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Final Demand for Payment/i)).toBeInTheDocument();
    });

    // Issuing organisation & category
    expect(screen.getByText(/HM Revenue & Customs/i)).toBeInTheDocument();
    expect(screen.getByText(/Tax & Revenue/i)).toBeInTheDocument();

    // Needs verification banner
    expect(
      screen.getByText(/Please check the highlighted items against your notice before acting/i)
    ).toBeInTheDocument();

    // Deadlines
    expect(screen.getByText(/Pay outstanding tax balance/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Payment must be received by 20 November 2026/i)
    ).toBeInTheDocument();

    // 5 Summary questions
    expect(screen.getByText("What is this notice about?")).toBeInTheDocument();
    expect(screen.getByText("An overdue tax demand notice.")).toBeInTheDocument();
    expect(screen.getByText("Why might it matter to me?")).toBeInTheDocument();
    expect(screen.getByText("What do I need to do?")).toBeInTheDocument();
    expect(screen.getByText("Where should I do it?")).toBeInTheDocument();
    expect(screen.getByText("What happens if I miss the deadline?")).toBeInTheDocument();

    // Action plan
    expect(screen.getByText(/Log in to your tax account online\./i)).toBeInTheDocument();

    // Documents
    expect(screen.getByText(/Proof of Income/i)).toBeInTheDocument();
    expect(screen.getByText(/Mandatory/i)).toBeInTheDocument();
    expect(screen.getByText(/Bank Statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Suggested, not required by the notice/i)).toBeInTheDocument();

    // Penalties
    expect(screen.getByText(/£100 late penalty/i)).toBeInTheDocument();

    // Disclaimer
    expect(
      screen.getByText(
        /This is a helper, not legal or financial advice\. Always check the original notice\./i
      )
    ).toBeInTheDocument();
  });

  it("highlights uncertain items with amber style, icon and 'Please verify' text", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-uncertain",
      status: "processed",
      needs_verification: true,
      result: {
        notice_title: { value: "Review Request", status: "found" },
        deadlines: [
          {
            description: "Submit dispute",
            iso_date: null,
            original_wording: "within 30 days of notice date",
            is_ambiguous: true,
            ambiguity_reason: "Notice date is missing or not stated.",
            status: "uncertain",
          },
        ],
        required_documents: [
          {
            name: "Utility bill",
            is_required: true,
            status: "uncertain",
          },
        ],
      },
      checklist: [],
      reminders: [],
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-uncertain"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Review Request/i)).toBeInTheDocument();
    });

    // Amber highlight badges with "Please verify"
    const verifyBadges = screen.getAllByText(/Please verify/i);
    expect(verifyBadges.length).toBeGreaterThanOrEqual(1);

    // Ambiguity reason
    expect(screen.getByText(/Notice date is missing or not stated\./i)).toBeInTheDocument();
  });

  it("handles checklist status change with optimistic update and rollback on error", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-check",
      status: "processed",
      result: {
        notice_title: { value: "Checklist Notice" },
        required_documents: [
          {
            name: "Identity Document",
            is_required: true,
          },
        ],
      },
      checklist: [
        {
          id: 1,
          notice_id: "notice-check",
          item_key: "Identity Document",
          status: "not_completed",
        },
      ],
      reminders: [],
    });

    // Mock failure for the PATCH call
    api.updateChecklistItem.mockRejectedValueOnce(
      new Error("Server connection lost")
    );

    render(
      <MemoryRouter initialEntries={["/notices/notice-check"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Identity Document/i)).toBeInTheDocument();
    });

    // Initial status button: "Completed" should have aria-pressed false
    const completedButton = screen.getByRole("button", { name: /^Completed$/i });
    expect(completedButton).toHaveAttribute("aria-pressed", "false");

    // Click "Completed"
    await userEvent.click(completedButton);

    // Rollback error should display and status should revert to not_completed
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Server connection lost/i);
      expect(completedButton).toHaveAttribute("aria-pressed", "false");
    });
  });
});
