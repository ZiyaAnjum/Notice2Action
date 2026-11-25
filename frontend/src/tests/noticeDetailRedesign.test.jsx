import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { DecisionCard } from "../components/DecisionCard";
import { ActionChecklist } from "../components/ActionChecklist";
import { DeadlineTimeline } from "../components/DeadlineTimeline";
import { ConsequenceList } from "../components/ConsequenceList";
import { EvidencePanel } from "../components/EvidencePanel";
import { ProcessingStepper } from "../components/ProcessingStepper";
import { LanguageToggle } from "../components/LanguageToggle";
import * as api from "../api/client";
import { LanguageProvider } from "../context/LanguageContext";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    getNoticePage: vi.fn(),
    getNoticeFileUrl: vi.fn((id) => `http://mock.test/api/notices/${id}/file`),
  };
});

describe("Notice Detail Redesign Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("DecisionCard", () => {
    it("renders headline, amount due, source org, and countdown badge", () => {
      const primaryDeadline = {
        id: "dl_1",
        label: "Payment Due",
        date: "2026-11-20",
      };

      render(
        <MemoryRouter>
          <DecisionCard
            headline={{
              one_line_summary: "Pay Rs. 4,860 by 18 Nov to avoid surcharge",
              notice_type: "Electricity Bill",
              source_organisation: "BESCOM Bangalore",
              amount_due: { amount: 4860, currency: "INR" },
              urgency: "urgent",
            }}
            primaryDeadline={primaryDeadline}
            pdfUrl="http://mock.test/notice.pdf"
            noticeId="notice-123"
            onRemind={vi.fn()}
          />
        </MemoryRouter>
      );

      expect(screen.getByText(/Pay Rs\. 4,860 by 18 Nov to avoid surcharge/i)).toBeInTheDocument();
      expect(screen.getByText(/Electricity Bill/i)).toBeInTheDocument();
      expect(screen.getByText(/BESCOM Bangalore/i)).toBeInTheDocument();
      expect(screen.getByText(/₹\s*4,860/i)).toBeInTheDocument();

      // Primary buttons
      expect(screen.getByRole("button", { name: /Remind me/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add to Calendar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Share/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /View original PDF/i })).toBeInTheDocument();
    });

    it("triggers remind callback and clipboard copy on share", async () => {
      const onRemindMock = vi.fn();
      const writeTextMock = vi.fn().mockResolvedValue();
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      render(
        <MemoryRouter>
          <DecisionCard
            headline={{
              one_line_summary: "Property Tax Settlement",
            }}
            noticeId="tax-456"
            onRemind={onRemindMock}
          />
        </MemoryRouter>
      );

      const remindBtn = screen.getByRole("button", { name: /Remind me/i });
      fireEvent.click(remindBtn);
      expect(onRemindMock).toHaveBeenCalledTimes(1);

      const shareBtn = screen.getByRole("button", { name: /Share/i });
      await userEvent.click(shareBtn);
      expect(writeTextMock).toHaveBeenCalled();
    });
  });

  describe("ActionChecklist", () => {
    it("renders tickable steps and persists progress in localStorage", async () => {
      const steps = [
        { order: 1, text: "Pay total amount on portal", evidence: { page: 1, quote: "Pay now", verified: true } },
        { order: 2, text: "Retain payment receipt for records", evidence: { page: 1, quote: "Receipt", verified: false } },
        { order: 3, text: "   " }, // Empty step must be dropped!
      ];

      const whereToSubmit = [
        { channel: "Online", details: "https://bescom.karnataka.gov.in" },
      ];

      const onShowSourceMock = vi.fn();

      const { rerender } = render(
        <ActionChecklist
          steps={steps}
          whereToSubmit={whereToSubmit}
          noticeId="notice-actions"
          onShowSource={onShowSourceMock}
        />
      );

      // Only 2 valid steps should be rendered (empty one dropped)
      expect(screen.getByText(/0 of 2 done/i)).toBeInTheDocument();
      expect(screen.getByText(/Pay total amount on portal/i)).toBeInTheDocument();
      expect(screen.getByText(/Retain payment receipt for records/i)).toBeInTheDocument();
      expect(screen.getByText(/https:\/\/bescom\.karnataka\.gov\.in/i)).toBeInTheDocument();

      // Field-level uncertainty tag on step 2
      expect(screen.getByText(/Verify against notice/i)).toBeInTheDocument();

      // Click step 1 checkbox
      const checkButtons = screen.getAllByRole("button", { name: /Mark step 1 as completed/i });
      fireEvent.click(checkButtons[0]);

      // Progress updates to 1 of 2 done
      expect(screen.getByText(/1 of 2 done/i)).toBeInTheDocument();

      // Verify localStorage was written
      const saved = JSON.parse(localStorage.getItem("n2a_checklist_notice-actions"));
      expect(saved[1]).toBe(true);

      // Click source button
      const sourceBtn = screen.getAllByRole("button", { name: /View source citation on page 1/i })[0];
      fireEvent.click(sourceBtn);
      expect(onShowSourceMock).toHaveBeenCalledWith(1, "Pay now");
    });

    it("renders null if no valid steps exist", () => {
      const { container } = render(
        <ActionChecklist
          steps={[{ text: "" }, { text: "   " }]}
          noticeId="empty-steps"
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("DeadlineTimeline", () => {
    it("renders sorted milestones, estimated badge with derivation tooltip, and consequences", () => {
      const deadlines = [
        {
          id: "dl_future",
          label: "Final Disconnection Notice",
          date: "2026-12-15",
          date_type: "estimated",
          derived_from: { offset_days: 15, relative_to: "due_date" },
        },
        {
          id: "dl_past",
          label: "Prompt Payment Discount",
          date: "2026-01-01",
          date_type: "exact",
        },
      ];

      const consequences = [
        { label: "Late Surcharge", value: "2% monthly", evidence: { page: 1, quote: "2%", verified: true } },
      ];

      render(
        <DeadlineTimeline
          deadlines={deadlines}
          consequences={consequences}
          onShowSource={vi.fn()}
        />
      );

      // Deadlines sorted
      expect(screen.getByText(/Final Disconnection Notice/i)).toBeInTheDocument();
      expect(screen.getByText(/Prompt Payment Discount/i)).toBeInTheDocument();
      expect(screen.getByText(/Past/i)).toBeInTheDocument();
      expect(screen.getByText(/Estimated/i)).toBeInTheDocument();
      expect(screen.getByText(/Calculated as 15 days after due date/i)).toBeInTheDocument();

      // Consequences rendered below timeline
      expect(screen.getByText(/Late Surcharge/i)).toBeInTheDocument();
      expect(screen.getByText(/2% monthly/i)).toBeInTheDocument();
    });
  });

  describe("ConsequenceList", () => {
    it("renders empty null when no consequences exist", () => {
      const { container } = render(<ConsequenceList consequences={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("EvidencePanel", () => {
    it("fetches page text, displays verbatim quote and highlights line", async () => {
      api.getNoticePage.mockResolvedValueOnce({
        page_number: 1,
        text: "BANGALORE ELECTRICITY SUPPLY COMPANY.\nDue date for payment: 18-11-2026 without surcharge.\nPlease retain receipt for reference.",
      });

      const onCloseMock = vi.fn();

      render(
        <EvidencePanel
          noticeId="notice-789"
          page={1}
          quote="Due date for payment: 18-11-2026 without surcharge."
          isOpen={true}
          onClose={onCloseMock}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Notice Evidence • Page 1/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Verified verbatim on page 1/i)).toBeInTheDocument();

      // Close button
      const closeBtn = screen.getByRole("button", { name: /Close evidence panel/i });
      fireEvent.click(closeBtn);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("ProcessingStepper", () => {
    it("renders 4 stages with active stage highlighted", () => {
      render(
        <ProcessingStepper stage="understanding" progress={60} onRefresh={vi.fn()} />
      );

      expect(screen.getByText(/Extracting Action Plan & Deadlines/i)).toBeInTheDocument();
      expect(screen.getByText("Uploading")).toBeInTheDocument();
      expect(screen.getByText("Reading text")).toBeInTheDocument();
      expect(screen.getByText("Understanding")).toBeInTheDocument();
      expect(screen.getByText("Checking")).toBeInTheDocument();
    });
  });

  describe("LanguageToggle", () => {
    it("switches the selected language through the language context", () => {
      render(
        <MemoryRouter initialEntries={["/notices/123"]}>
          <LanguageProvider>
            <LanguageToggle />
          </LanguageProvider>
        </MemoryRouter>
      );

      const hindiBtn = screen.getByTitle(/Switch language to हिंदी/i);
      expect(hindiBtn).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(hindiBtn);

      expect(hindiBtn).toHaveAttribute("aria-pressed", "true");
      expect(localStorage.getItem("notice2action-language")).toBe("hi");
    });
  });
});