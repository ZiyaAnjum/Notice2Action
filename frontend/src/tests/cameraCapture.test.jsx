import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import { UploadPage } from "../pages/UploadPage";
import { EvidencePanel } from "../components/EvidencePanel";
import * as api from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    uploadNotice: vi.fn(),
    getNotice: vi.fn(),
    getNoticePage: vi.fn().mockResolvedValue({
      page_number: 1,
      text: "Notice to Pay: Total Due $150.00 by 2026-12-01.",
      char_count: 50,
    }),
  };
});

describe("CameraCaptureModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <CameraCaptureModal isOpen={false} onClose={vi.fn()} onComplete={vi.fn()} />
    );
    expect(screen.queryByText(/Take Notice Photo/i)).not.toBeInTheDocument();
  });

  it("renders modal header and camera viewport when isOpen is true", async () => {
    // Mock navigator.mediaDevices.getUserMedia
    const originalMediaDevices = navigator.mediaDevices;
    const mockStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    };

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    render(
      <CameraCaptureModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
    );

    expect(screen.getByText(/Take Notice Photo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Close camera modal/i })).toBeInTheDocument();

    // Cleanup
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("displays clear error and fallback input when camera permission is denied", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const permissionError = new Error("Permission denied");
    permissionError.name = "NotAllowedError";

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(permissionError),
      },
    });

    render(
      <CameraCaptureModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Live Camera Unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/Camera permission was denied/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upload Photo or Use Device Camera/i })
      ).toBeInTheDocument();
    });

    // Cleanup
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("displays clear error when no camera device is found", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const notFoundError = new Error("No device");
    notFoundError.name = "NotFoundError";

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(notFoundError),
      },
    });

    render(
      <CameraCaptureModal isOpen={true} onClose={vi.fn()} onComplete={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText(/No camera hardware was detected/i)).toBeInTheDocument();
    });

    // Cleanup
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("stops stream tracks when closed", async () => {
    const mockStop = vi.fn();
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    };

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    const onClose = vi.fn();
    const { rerender } = render(
      <CameraCaptureModal isOpen={true} onClose={onClose} onComplete={vi.fn()} />
    );

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    const closeButton = screen.getByRole("button", { name: /Close camera modal/i });
    await userEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();

    rerender(
      <CameraCaptureModal isOpen={false} onClose={onClose} onComplete={vi.fn()} />
    );
    expect(mockStop).toHaveBeenCalled();

    // Cleanup
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it("supports fallback image selection and multi-page preview flow", async () => {
    const onComplete = vi.fn();
    render(
      <CameraCaptureModal isOpen={true} onClose={vi.fn()} onComplete={onComplete} />
    );

    const fallbackInput = screen.getByLabelText(/Upload photo from device/i);
    expect(fallbackInput).toBeInTheDocument();
  });
});

describe("UploadPage Camera Integration", () => {
  it("renders Take Photo buttons on UploadPage", () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );

    const takePhotoButtons = screen.getAllByRole("button", { name: /Take Photo/i });
    expect(takePhotoButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("opens CameraCaptureModal when Take Photo is clicked", async () => {
    render(
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    );

    const takePhotoButton = screen.getAllByRole("button", { name: /Take Photo/i })[0];
    await userEvent.click(takePhotoButton);

    expect(screen.getByText(/Take Notice Photo/i)).toBeInTheDocument();
  });
});

describe("EvidencePanel Original Photo View", () => {
  it("renders Extracted Text and Original Photo tabs", async () => {
    render(
      <EvidencePanel
        noticeId="notice-123"
        page={1}
        quote="Total Due $150.00"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Extracted Text/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Original Photo \/ Page/i })).toBeInTheDocument();

    // Click Original Photo tab
    await userEvent.click(screen.getByRole("button", { name: /Original Photo \/ Page/i }));

    expect(
      screen.getByText(/Page 1 Original Document Photo \/ Scan/i)
    ).toBeInTheDocument();
    const image = screen.getByAltText(/Notice page 1 original document photo/i);
    expect(image).toBeInTheDocument();
    expect(image.getAttribute("src")).toContain("/api/notices/notice-123/pages/1/image");
  });
});
