import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SummaryQuestions } from "../components/SummaryQuestions";
import { LanguageProvider } from "../context/LanguageContext";

const validSummary = {
  what_is_this: "Electricity final disconnection notice",
  why_it_matters: "Power supply will be disconnected",
  what_to_do: "Pay the outstanding bill",
  where_to_do_it: "Use the local electricity office",
  if_deadline_missed: "A late fee may be charged",
};

let synthesis;
let spokenUtterances;

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    spokenUtterances.push(this);
  }
}

function renderSummary(summary = validSummary) {
  return render(
    <LanguageProvider>
      <SummaryQuestions summary={summary} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  spokenUtterances = [];
  synthesis = {
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    writable: true,
    value: synthesis,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: MockSpeechSynthesisUtterance,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: undefined,
  });
});

describe("SummaryQuestions text-to-speech", () => {
  it("plays the five sections in order with their headings", async () => {
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));

    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(spokenUtterances).toHaveLength(1);
    const spokenText = spokenUtterances[0].text;
    expect(spokenText).toContain("What is this notice about?");
    expect(spokenText).toContain("Why might it matter to me?");
    expect(spokenText).toContain("What do I need to do?");
    expect(spokenText).toContain("Where should I do it?");
    expect(spokenText).toContain("What happens if I miss the deadline?");
    expect(spokenText.indexOf("What is this notice about?")).toBeLessThan(
      spokenText.indexOf("Why might it matter to me?")
    );
  });

  it("pauses and resumes speech", async () => {
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));
    await user.click(screen.getByRole("button", { name: "Pause notice explanation" }));
    expect(synthesis.pause).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Resume notice explanation" }));
    expect(synthesis.resume).toHaveBeenCalledTimes(1);
  });

  it("stops speech", async () => {
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));
    await user.click(screen.getByRole("button", { name: "Stop notice explanation" }));

    expect(synthesis.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Listen to notice explanation" })).toBeInTheDocument();
  });

  it("handles an empty summary safely", () => {
    renderSummary({
      what_is_this: "",
      why_it_matters: "not_found",
      what_to_do: null,
      where_to_do_it: { text: "" },
      if_deadline_missed: "not stated in the notice",
    });

    expect(screen.queryByRole("button", { name: "Listen to notice explanation" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No plain-language explanation");
  });

  it("shows an accessible unsupported-browser message", () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    renderSummary();

    expect(screen.getByRole("status")).toHaveTextContent("not supported by this browser");
  });

  it("cancels speech on unmount", async () => {
    const user = userEvent.setup();
    const view = renderSummary();

    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));
    view.unmount();

    expect(synthesis.cancel).toHaveBeenCalled();
  });

  it("uses an English voice for English notice text and does not claim translation", async () => {
    localStorage.setItem("notice2action-language", "kn");
    synthesis.getVoices.mockReturnValue([
      { name: "English voice", lang: "en-IN" },
      { name: "Kannada voice", lang: "kn-IN" },
    ]);
    const user = userEvent.setup();
    renderSummary();

    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));

    expect(spokenUtterances[0].voice).toEqual({ name: "English voice", lang: "en-IN" });
    expect(spokenUtterances[0].lang).toBe("en-US");
    expect(screen.getByText(/This notice text is English/i)).toHaveTextContent("has not been translated");
  });

  it("uses a Kannada notice voice even when the interface language is English", async () => {
    localStorage.setItem("notice2action-language", "en");
    synthesis.getVoices.mockReturnValue([
      { name: "English voice", lang: "en-IN" },
      { name: "Kannada voice", lang: "kn-IN" },
    ]);
    const kannadaSummary = {
      what_is_this: { text: "ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ವಿಸರ್ಜನೆ ನೋಟಿಸ್" },
      why_it_matters: "ಬಿಲ್ಲು ಪಾವತಿಸದಿದ್ದರೆ ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಳ್ಳಬಹುದು",
      what_to_do: "ಬಾಕಿ ಬಿಲ್ ಪಾವತಿಸಿ",
      where_to_do_it: "ಸ್ಥಳೀಯ ವಿದ್ಯುತ್ ಕಚೇರಿ",
      if_deadline_missed: "ವಿಳಂಬ ಶುಲ್ಕ ವಿಧಿಸಬಹುದು",
    };

    const user = userEvent.setup();
    renderSummary(kannadaSummary);
    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));

    expect(spokenUtterances[0].voice).toEqual({ name: "Kannada voice", lang: "kn-IN" });
    expect(spokenUtterances[0].lang).toBe("kn-IN");
  });

  it("uses the browser default and explains when no matching voice is available", async () => {
    localStorage.setItem("notice2action-language", "en");
    synthesis.getVoices.mockReturnValue([
      { name: "English voice", lang: "en-IN" },
    ]);
    const kannadaSummary = {
      what_is_this: { text: "ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ವಿಸರ್ಜನೆ ನೋಟಿಸ್" },
      why_it_matters: "ಬಿಲ್ಲು ಪಾವತಿಸದಿದ್ದರೆ ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಳ್ಳಬಹುದು",
      what_to_do: "ಬಾಕಿ ಬಿಲ್ ಪಾವತಿಸಿ",
      where_to_do_it: "ಸ್ಥಳೀಯ ವಿದ್ಯುತ್ ಕಚೇರಿ",
      if_deadline_missed: "ವಿಳಂಬ ಶುಲ್ಕ ವಿಧಿಸಬಹುದು",
    };

    const user = userEvent.setup();
    renderSummary(kannadaSummary);

    expect(screen.getByRole("status")).toHaveTextContent("No matching Kannada voice is available");
    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));

    expect(spokenUtterances[0].voice).toBeUndefined();
    expect(spokenUtterances[0].lang).toBe("kn-IN");
    expect(screen.getByRole("status")).toHaveTextContent("browser's default voice");
    expect(screen.getByRole("status")).toHaveTextContent("pronunciation may be inaccurate");
  });

  it("uses a matching Hindi voice independently of the interface language", async () => {
    localStorage.setItem("notice2action-language", "ta");
    synthesis.getVoices.mockReturnValue([
      { name: "Hindi voice", lang: "hi-IN" },
      { name: "Tamil voice", lang: "ta-IN" },
    ]);
    const hindiSummary = {
      what_is_this: { text: "बिजली का अंतिम डिस्कनेक्शन नोटिस" },
      why_it_matters: "बिजली काटी जा सकती है",
      what_to_do: "बकाया बिल का भुगतान करें",
      where_to_do_it: "स्थानीय बिजली कार्यालय",
      if_deadline_missed: "विलंब शुल्क लग सकता है",
    };

    const user = userEvent.setup();
    renderSummary(hindiSummary);
    await user.click(screen.getByRole("button", { name: "Listen to notice explanation" }));

    expect(spokenUtterances[0].voice).toEqual({ name: "Hindi voice", lang: "hi-IN" });
    expect(spokenUtterances[0].lang).toBe("hi-IN");
  });
});
