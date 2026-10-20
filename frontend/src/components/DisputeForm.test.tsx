import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Milestone } from "../lib/stellar";
import { DisputeForm } from "./DisputeForm";
import { StatusPill } from "./StatusPill";

const milestones: Milestone[] = [
  { name: "Factory release", payment_percent: 40, proof_hash: "a", status: "Confirmed" },
  { name: "Port arrival", payment_percent: 60, proof_hash: "b", status: "ProofSubmitted" },
];

describe("DisputeForm", () => {
  it("only offers milestones with a submitted proof and submits the reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<DisputeForm milestones={milestones} busy={false} onSubmit={onSubmit} />);

    const select = screen.getByLabelText("Milestone to dispute") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Milestone 2 · Port arrival"]);

    const submit = screen.getByRole("button", { name: /raise dispute/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const reason = screen.getByLabelText("Dispute reason") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "  Goods arrived damaged  " } });
    fireEvent.click(submit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(1, "Goods arrived damaged"));
    await waitFor(() => expect(reason.value).toBe(""));
  });

  it("keeps the reason when the transaction fails", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<DisputeForm milestones={milestones} busy={false} onSubmit={onSubmit} />);
    const reason = screen.getByLabelText("Dispute reason") as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: "Wrong quantity" } });
    fireEvent.click(screen.getByRole("button", { name: /raise dispute/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(reason.value).toBe("Wrong quantity");
  });

  it("shows a signing state while busy", () => {
    render(<DisputeForm milestones={milestones} busy onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: /signing/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("explains when nothing can be disputed", () => {
    render(<DisputeForm milestones={[milestones[0]]} busy={false} onSubmit={vi.fn()} />);
    expect(screen.getByText(/no milestone has a submitted proof/i)).toBeTruthy();
  });
});

describe("StatusPill", () => {
  it("renders a distinct pill for disputed milestones", () => {
    const { container } = render(<StatusPill status="Disputed" />);
    const pill = container.querySelector(".status-pill");
    expect(pill?.classList.contains("disputed")).toBe(true);
    expect(pill?.textContent).toBe("Disputed");
  });

  it("humanises multi-word statuses", () => {
    render(<StatusPill status="ProofSubmitted" />);
    expect(screen.getByText("Proof submitted")).toBeTruthy();
  });
});
