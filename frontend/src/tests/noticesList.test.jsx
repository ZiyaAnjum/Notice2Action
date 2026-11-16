import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NoticesListPage } from "../pages/NoticesListPage";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    listNotices: vi.fn(),
    getUpcomingReminders: vi.fn(),
    deleteNotice: vi.fn(),
    updateReminder: vi.fn(),
  };
});

describe("NoticesListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders past notices and upcoming reminders", async () => {
    api.listNotices.mockResolvedValueOnce([
      {
        id: "notice-1",
        title: "Council Tax Demand",
        category: "tax_or_payment",
        status: "processed",
        deadline_summary: "Due in 14 days",
        needs_verification: true,
        created_at: "2026-10-20T10:00:00Z",
      },
    ]);

    api.getUpcomingReminders.mockResolvedValueOnce([
      {
        id: "rem-1",
        notice_id: "notice-1",
        deadline_ref: "Council Tax Payment",
        remind_on: "2026-11-01",
        note: "Check banking balance",
        done: false,
      },
    ]);

    render(
      <MemoryRouter>
        <NoticesListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Council Tax Demand/i)).toBeInTheDocument();
    });

    // Notice card details
    expect(screen.getAllByText(/Tax & payments/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Due in 14 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Some extracted information needs review/i)).toBeInTheDocument();

    // Upcoming reminders
    expect(screen.getByText(/Check banking balance/i)).toBeInTheDocument();
  });

  it("renders empty state with upload button when no notices exist", async () => {
    api.listNotices.mockResolvedValueOnce([]);
    api.getUpcomingReminders.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <NoticesListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No documents yet/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: /Upload a document/i })
    ).toBeInTheDocument();
  });

  it("searches and filters by metadata actually returned by the notice service", async () => {
    api.listNotices.mockResolvedValueOnce([
      {
        id: "notice-water",
        title: "Water maintenance advisory",
        category: "utility",
        status: "processed",
        priority: "urgent",
        source_organisation: "Regional Water Board",
        notice_type: "Service interruption",
        issue_date: "2026-10-28",
        deadline_summary: "Reply by 5 December",
        created_at: "2026-10-29T10:00:00Z",
      },
      {
        id: "notice-bank",
        title: "Account information update",
        category: "bank",
        status: "processed",
        priority: "low",
        created_at: "2026-10-30T10:00:00Z",
      },
    ]);
    api.getUpcomingReminders.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <NoticesListPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Water maintenance advisory")).toBeInTheDocument();
    expect(screen.getByText("Regional Water Board")).toBeInTheDocument();
    expect(screen.getByText("Service interruption")).toBeInTheDocument();
    expect(screen.getByText("urgent", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Reply by 5 December")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter by priority" }),
      "urgent"
    );
    expect(screen.getByText("Water maintenance advisory")).toBeInTheDocument();
    expect(screen.queryByText("Account information update")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search notices and documents" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search notices and documents" }),
      "Regional Water Board"
    );
    expect(screen.getByText("Water maintenance advisory")).toBeInTheDocument();
  });
});
