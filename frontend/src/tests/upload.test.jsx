import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { UploadPage } from "../pages/UploadPage";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    uploadNotice: vi.fn(),
    getNotice: vi.fn(),
  };
});

describe("UploadPage Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-PDF files on client-side check", async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );

    const input = screen.getByLabelText(/Upload notice PDF/i);
    const nonPdfFile = new File(["dummy text"], "notice.txt", { type: "text/plain" });

    // fireEvent.change bypasses browser/userEvent accept attribute pre-filter
    fireEvent.change(input, { target: { files: [nonPdfFile] } });

    expect(
      screen.getByText(/Only PDF files are supported/i)
    ).toBeInTheDocument();
  });

  it("rejects files larger than 10MB on client-side check", async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );

    const input = screen.getByLabelText(/Upload notice PDF/i);
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "huge.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(
      screen.getByText(/This file is larger than 10MB/i)
    ).toBeInTheDocument();
  });

  it("uploads a valid PDF, shows processing state, polls, and redirects", async () => {
    api.uploadNotice.mockResolvedValueOnce({
      id: "notice-abc-123",
      status: "processing",
      message: "Processing started",
    });

    api.getNotice
      .mockResolvedValueOnce({
        id: "notice-abc-123",
        status: "processing",
      })
      .mockResolvedValueOnce({
        id: "notice-abc-123",
        status: "processed",
      });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route
            path="/notices/:id"
            element={<div data-testid="dashboard-screen">Dashboard Target</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    const input = screen.getByLabelText(/Upload notice PDF/i);
    const validFile = new File(["%PDF-1.4 dummy"], "valid_notice.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [validFile] } });

    const uploadButton = screen.getByRole("button", {
      name: /Read Notice & Build Action Plan/i,
    });
    await userEvent.click(uploadButton);

    expect(screen.getByText(/Reading your notice\.\.\./i)).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId("dashboard-screen")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("displays friendly backend error when upload fails", async () => {
    api.uploadNotice.mockRejectedValueOnce(
      new Error("The uploaded file appears to be corrupted or invalid.")
    );

    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );

    const input = screen.getByLabelText(/Upload notice PDF/i);
    const file = new File(["%PDF-1.4"], "corrupt.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    await userEvent.click(
      screen.getByRole("button", { name: /Read Notice & Build Action Plan/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/The uploaded file appears to be corrupted or invalid\./i)
      ).toBeInTheDocument();
    });
  });
});
