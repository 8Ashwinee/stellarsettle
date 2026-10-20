import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CancelShipmentForm } from "./CancelShipmentForm";
import { cancelShipment } from "../lib/stellar";
import { BUYER, SUPPLIER, makeShipment, walletFor } from "../test/fixtures";

vi.mock(import("../lib/stellar"), async (importOriginal) => ({ ...(await importOriginal()), cancelShipment: vi.fn() }));

describe("CancelShipmentForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("is gated to the buyer", () => {
    render(<CancelShipmentForm wallet={walletFor(SUPPLIER)} shipment={makeShipment()} onStart={vi.fn()} onCancelled={vi.fn()} onError={vi.fn()} />);
    expect((screen.getByRole("button", { name: /cancel shipment/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Only the shipment's buyer can cancel it.")).toBeTruthy();
  });

  it("cancels with a reason as the buyer", async () => {
    vi.mocked(cancelShipment).mockResolvedValue("cafebabe00112233");
    const onCancelled = vi.fn();
    const wallet = walletFor(BUYER);
    render(<CancelShipmentForm wallet={wallet} shipment={makeShipment()} onStart={vi.fn()} onCancelled={onCancelled} onError={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel shipment/i }));
    fireEvent.change(screen.getByLabelText("Cancellation reason"), { target: { value: "Order withdrawn" } });
    fireEvent.click(screen.getByRole("button", { name: /sign & cancel/i }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith("Shipment PO-1 cancelled · cafebabe0011…"));
    expect(cancelShipment).toHaveBeenCalledWith(wallet, "PO-1", "Order withdrawn");
  });

  it("shows the refund once the shipment is cancelled", () => {
    const shipment = makeShipment({
      status: "Cancelled",
      total_amount: "10000",
      released_amount: "2000",
      buyer_cancel_fee_bps: 500,
      cancellation_reason: ["BuyerCancelled"],
    });
    render(<CancelShipmentForm wallet={walletFor(BUYER)} shipment={shipment} onStart={vi.fn()} onCancelled={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText("Shipment cancelled")).toBeTruthy();
    expect(screen.getByText("7,600")).toBeTruthy();
  });

  it("reports cancellation failures", async () => {
    vi.mocked(cancelShipment).mockRejectedValue(new Error("shipment is not active"));
    const onError = vi.fn();
    render(<CancelShipmentForm wallet={walletFor(BUYER)} shipment={makeShipment()} onStart={vi.fn()} onCancelled={vi.fn()} onError={onError} />);

    fireEvent.click(screen.getByRole("button", { name: /cancel shipment/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign & cancel/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("shipment is not active"));
  });
});
