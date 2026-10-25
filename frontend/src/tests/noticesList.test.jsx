import { render, screen, waitFor } from "@testing-library/react";
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
        category: "tax_revenue",
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
    expect(screen.getByText(/Tax & Revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/Due in 14 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Needs Verification/i)).toBeInTheDocument();

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
      expect(screen.getByText(/No notices uploaded yet/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole("link", { name: /Upload Your First Notice/i })
    ).toBeInTheDocument();
  });
});
