import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProofSubmissionForm } from "./ProofSubmissionForm";
import { submitProof } from "../lib/stellar";
import { BUYER, LOGISTICS, SUPPLIER, makeShipment, walletFor } from "../test/fixtures";

vi.mock(import("../lib/stellar"), async (importOriginal) => ({ ...(await importOriginal()), submitProof: vi.fn() }));

describe("ProofSubmissionForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("is disabled for wallets that are not the supplier or logistics", () => {
    render(<ProofSubmissionForm wallet={walletFor(BUYER)} shipment={makeShipment()} onStart={vi.fn()} onSubmitted={vi.fn()} onError={vi.fn()} />);
    expect((screen.getByLabelText("Proof hash") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Only the shipment's supplier or logistics wallet can submit proof.")).toBeTruthy();
  });

  it("submits proof for the active milestone as the supplier", async () => {
    vi.mocked(submitProof).mockResolvedValue("feedbeef00112233");
    const onSubmitted = vi.fn();
    const wallet = walletFor(SUPPLIER);
    const shipment = makeShipment({
      milestones: [
        { index: 0, name: "Goods dispatched", payment_percent: 50, proof_hash: "ipfs://a", status: "Confirmed" },
        { index: 1, name: "Delivered", payment_percent: 50, proof_hash: "", status: "Pending" },
      ],
    });
    render(<ProofSubmissionForm wallet={wallet} shipment={shipment} onStart={vi.fn()} onSubmitted={onSubmitted} onError={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Proof hash"), { target: { value: "ipfs://QmProof" } });
    fireEvent.click(screen.getByRole("button", { name: /sign & submit/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith("Proof submitted for milestone 2 · feedbeef0011…"));
    expect(submitProof).toHaveBeenCalledWith(wallet, "PO-1", 1, "ipfs://QmProof");
  });

  it("is enabled for the logistics wallet and reports failures", async () => {
    vi.mocked(submitProof).mockRejectedValue(new Error("MilestoneOutOfOrder"));
    const onError = vi.fn();
    render(<ProofSubmissionForm wallet={walletFor(LOGISTICS)} shipment={makeShipment()} onStart={vi.fn()} onSubmitted={vi.fn()} onError={onError} />);

    fireEvent.change(screen.getByLabelText("Proof hash"), { target: { value: "ipfs://QmProof" } });
    fireEvent.click(screen.getByRole("button", { name: /sign & submit/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("MilestoneOutOfOrder"));
  });
});
