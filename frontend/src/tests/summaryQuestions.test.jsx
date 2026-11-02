import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SummaryQuestions } from "../components/SummaryQuestions";

describe("SummaryQuestions Component", () => {
  it("renders correctly when summary parts are plain strings", () => {
    const stringSummary = {
      what_is_this: "Electricity final disconnection notice",
      why_it_matters: "Power supply will be disconnected if bill is unpaid",
      what_to_do: "Pay the outstanding bill amount immediately",
      where_to_do_it: "Online portal or local electricity office counter",
      if_deadline_missed: "Disconnection fee of Rs. 500 will be added",
    };

    render(<SummaryQuestions summary={stringSummary} />);

    expect(screen.getByText("Electricity final disconnection notice")).toBeInTheDocument();
    expect(screen.getByText("Power supply will be disconnected if bill is unpaid")).toBeInTheDocument();
    expect(screen.getByText("Pay the outstanding bill amount immediately")).toBeInTheDocument();
    expect(screen.getByText("Online portal or local electricity office counter")).toBeInTheDocument();
    expect(screen.getByText("Disconnection fee of Rs. 500 will be added")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it("renders correctly when summary parts are objects with text property and never shows [object Object]", () => {
    const objectSummary = {
      what_is_this: {
        text: "Electricity final disconnection notice",
        evidence_quote: "FINAL DISCONNECTION NOTICE",
        source_page: 1,
      },
      why_it_matters: {
        text: "Power supply will be disconnected if bill is unpaid",
        evidence_quote: "power supply will be disconnected",
        source_page: 1,
      },
      what_to_do: {
        text: "Pay the outstanding bill amount immediately",
        evidence_quote: "pay immediately",
        source_page: 1,
      },
      where_to_do_it: {
        text: "Online portal or local electricity office counter",
        evidence_quote: "at bill counter or online",
        source_page: 1,
      },
      if_deadline_missed: {
        text: "Disconnection fee of Rs. 500 will be added",
        evidence_quote: "fee of Rs. 500",
        source_page: 1,
      },
    };

    render(<SummaryQuestions summary={objectSummary} />);

    expect(screen.getByText("Electricity final disconnection notice")).toBeInTheDocument();
    expect(screen.getByText("Power supply will be disconnected if bill is unpaid")).toBeInTheDocument();
    expect(screen.getByText("Pay the outstanding bill amount immediately")).toBeInTheDocument();
    expect(screen.getByText("Online portal or local electricity office counter")).toBeInTheDocument();
    expect(screen.getByText("Disconnection fee of Rs. 500 will be added")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it("renders fallback message when summary fields are missing or not found", () => {
    const missingSummary = {
      what_is_this: "Valid notice title",
      why_it_matters: "not_found",
      what_to_do: "",
      where_to_do_it: null,
      if_deadline_missed: { text: "not stated in the notice" },
    };

    render(<SummaryQuestions summary={missingSummary} />);

    expect(screen.getByText("Valid notice title")).toBeInTheDocument();
    const fallbacks = screen.getAllByText("Not stated in the notice");
    expect(fallbacks.length).toBe(4);
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });
});

