import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DisputePanel } from "./DisputePanel";
import { resolveDispute } from "../lib/stellar";
import { ARBITER, BUYER, makeShipment, walletFor } from "../test/fixtures";

vi.mock(import("../lib/stellar"), async (importOriginal) => ({ ...(await importOriginal()), resolveDispute: vi.fn() }));

const disputed = makeShipment({
  milestones: [
    { index: 0, name: "Goods dispatched", payment_percent: 50, proof_hash: "ipfs://a", status: "Disputed" },
    { index: 1, name: "Delivered", payment_percent: 50, proof_hash: "", status: "Pending" },
  ],
});

describe("DisputePanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists only disputed milestones", () => {
    render(<DisputePanel wallet={walletFor(ARBITER)} shipment={disputed} onStart={vi.fn()} onResolved={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText("Goods dispatched")).toBeTruthy();
    expect(screen.queryByText("Delivered")).toBeNull();
  });

  it("gates resolution to the arbiter", () => {
    render(<DisputePanel wallet={walletFor(BUYER)} shipment={disputed} onStart={vi.fn()} onResolved={vi.fn()} onError={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Approve milestone 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Reject milestone 1" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls resolve_dispute and drops the dispute once the shipment refreshes", async () => {
    vi.mocked(resolveDispute).mockResolvedValue("0123456789abcdef");
    const onResolved = vi.fn();
    const wallet = walletFor(ARBITER);
    const { rerender } = render(<DisputePanel wallet={wallet} shipment={disputed} onStart={vi.fn()} onResolved={onResolved} onError={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject milestone 1" }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith("Dispute on milestone 1 rejected · 0123456789ab…"));
    expect(resolveDispute).toHaveBeenCalledWith(wallet, "PO-1", 0, false);

    const resolved = makeShipment({
      milestones: [
        { index: 0, name: "Goods dispatched", payment_percent: 50, proof_hash: "ipfs://a", status: "Resolved" },
        { index: 1, name: "Delivered", payment_percent: 50, proof_hash: "", status: "Pending" },
      ],
    });
    rerender(<DisputePanel wallet={wallet} shipment={resolved} onStart={vi.fn()} onResolved={onResolved} onError={vi.fn()} />);
    expect(screen.getByText("No active disputes on this shipment.")).toBeTruthy();
  });

  it("reports resolution failures", async () => {
    vi.mocked(resolveDispute).mockRejectedValue(new Error("unauthorized"));
    const onError = vi.fn();
    render(<DisputePanel wallet={walletFor(ARBITER)} shipment={disputed} onStart={vi.fn()} onResolved={vi.fn()} onError={onError} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve milestone 1" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("unauthorized"));
  });
});
