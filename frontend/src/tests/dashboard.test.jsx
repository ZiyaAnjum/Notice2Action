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
    expect(
      screen.queryByRole("heading", { name: /What to do/i })
    ).not.toBeInTheDocument();
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
      expect(screen.getByText(/Document Not Yet Classified/i)).toBeInTheDocument();
    });

    // Check that supported categories are listed
    expect(screen.getByText(/Tax & payments/i)).toBeInTheDocument();
    expect(screen.getByText(/Education & student funding/i)).toBeInTheDocument();
    expect(screen.getByText(/Government & public services/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /What to do/i })
    ).not.toBeInTheDocument();
  });

  it("renders fully processed notice with DecisionCard, ActionChecklist, DeadlineTimeline, and plain summary", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-100",
      status: "complete",
      schema_version: "2.0.0",
      headline: {
        one_line_summary: "Pay Rs. 4,860 by 18 Nov to avoid a surcharge",
        notice_type: "Electricity Demand Notice",
        source_organisation: "Bangalore Electricity Supply Company Limited (BESCOM)",
        amount_due: { amount: 4860, currency: "INR" },
        primary_deadline_id: "dl_due",
        urgency: "urgent",
      },
      deadlines: [
        {
          id: "dl_due",
          label: "Due Date (No Surcharge)",
          kind: "due",
          date: "2026-11-18",
          date_type: "exact",
          derived_from: null,
          evidence: { page: 1, quote: "Due date: 18-11-2026", verified: true },
        },
        {
          id: "dl_disc",
          label: "Disconnection Risk",
          kind: "disconnection_risk",
          date: "2026-12-03",
          date_type: "estimated",
          derived_from: { offset_days: 15, relative_to: "due_date" },
          evidence: { page: 1, quote: "Disconnected after 15 days", verified: true },
        },
      ],
      action_steps: [
        {
          order: 1,
          text: "Pay total amount of Rs. 4,860 before due date.",
          evidence: { page: 1, quote: "Pay Rs. 4,860", verified: true },
        },
      ],
      consequences: [
        {
          label: "Late Surcharge",
          value: "2% per month",
          evidence: { page: 1, quote: "2% per month", verified: true },
        },
      ],
      required_documents: [
        { name: "Consumer Account ID", evidence: { page: 1, quote: "Account No", verified: true } },
      ],
      where_to_submit: [
        { channel: "Online Portal", details: "bescom.karnataka.gov.in" },
      ],
      summary_plain: "This is a monthly electricity demand notice from BESCOM for Rs. 4,860.",
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-100"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Pay Rs\. 4,860 by 18 Nov to avoid a surcharge/i)
      ).toBeInTheDocument();
    });

    // Issuing organisation & notice type
    expect(screen.getAllByText(/BESCOM/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Electricity Demand Notice/i).length).toBeGreaterThan(0);

    // Prominent Amount due formatted in INR
    expect(screen.getByText(/₹\s*4,860/i)).toBeInTheDocument();

    // Primary buttons
    expect(screen.getByRole("button", { name: /Remind me/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to Calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share/i })).toBeInTheDocument();

    // Action checklist
    expect(screen.getByRole("heading", { name: /What to do/i })).toBeInTheDocument();
    expect(screen.getByText(/Pay total amount of Rs\. 4,860 before due date\./i)).toBeInTheDocument();
    expect(screen.getByText(/bescom\.karnataka\.gov\.in/i)).toBeInTheDocument();

    // Timeline and consequences
    expect(screen.getByRole("heading", { name: /Timeline of Deadlines/i })).toBeInTheDocument();
    expect(screen.getByText(/Due Date \(No Surcharge\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Disconnection Risk/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated/i)).toBeInTheDocument();
    expect(screen.getByText(/Late Surcharge/i)).toBeInTheDocument();

    // Plain-language summary replacing 5 questions
    expect(screen.getByRole("heading", { name: /Plain-Language Summary/i })).toBeInTheDocument();
    expect(
      screen.getByText(/This is a monthly electricity demand notice from BESCOM for Rs\. 4,860\./i)
    ).toBeInTheDocument();

    // Footer disclaimer
    expect(
      screen.getByText(/Helper, not legal or financial advice\. Check the original notice\./i)
    ).toBeInTheDocument();
  });

  it("renders slim inline warning banner and field-level verification badges on partial status", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-partial",
      status: "partial",
      schema_version: "2.0.0",
      warnings: ["Page 2 table damaged and could not be parsed"],
      headline: {
        one_line_summary: "Property tax assessment notice",
        notice_type: "Property Tax",
        amount_due: { amount: 14200, currency: "INR" },
        urgency: "soon",
      },
      deadlines: [
        {
          id: "dl_tax",
          label: "Assessment Due",
          date: "2026-11-30",
          date_type: "exact",
          evidence: { page: 1, quote: "Due 30 Nov", verified: false },
        },
      ],
      action_steps: [
        {
          order: 1,
          text: "Remit property tax dues",
          evidence: { page: 1, quote: "Remit dues", verified: false },
        },
      ],
      summary_plain: "Property tax assessment requires verification.",
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-partial"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Property tax assessment notice/i)).toBeInTheDocument();
    });

    // Slim inline banner listing the unread sections
    expect(
      screen.getByText(/Partial extraction: Some sections could not be completely read/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Page 2 table damaged and could not be parsed/i)
    ).toBeInTheDocument();

    // Field-level verification badges
    const verifyBadges = screen.getAllByText(/Verify/i);
    expect(verifyBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders technical_notes inside collapsed 'Technical details'", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-tech-notes",
      status: "complete",
      headline: {
        one_line_summary: "Electricity Disconnection Warning",
        notice_type: "Utility Notice",
      },
      deadlines: [],
      action_steps: [],
      result: {
        technical_notes: [
          {
            code: "GROUNDING_UNVERIFIED_QUOTE",
            note: "Grounding warning: Verbatim quote for 'action_step: 1' not found on page 1.",
            severity: "warning",
            source_page: 1,
          },
        ],
      },
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-tech-notes"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Electricity Disconnection Warning/i)).toBeInTheDocument();
    });

    // Technical notes section must be collapsed under "Technical details"
    expect(screen.getByText(/Technical details/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Verbatim quote for 'action_step: 1' not found on page 1\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/\[GROUNDING_UNVERIFIED_QUOTE\]/i)).toBeInTheDocument();
  });

  it("renders ProcessingStepper when notice status is processing", async () => {
    api.getNotice.mockResolvedValueOnce({
      id: "notice-proc",
      status: "processing",
      stage: "understanding",
      progress: 60,
    });

    render(
      <MemoryRouter initialEntries={["/notices/notice-proc"]}>
        <Routes>
          <Route path="/notices/:id" element={<NoticeDashboardPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Extracting Action Plan & Deadlines/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByText("Reading text")).toBeInTheDocument();
    expect(screen.getByText("Understanding")).toBeInTheDocument();
    expect(screen.getByText("Checking")).toBeInTheDocument();
  });
});
