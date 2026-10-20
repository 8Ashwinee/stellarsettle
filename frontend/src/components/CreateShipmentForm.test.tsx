import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateShipmentForm } from "./CreateShipmentForm";
import { createShipment } from "../lib/stellar";
import { ARBITER, BUYER, LOGISTICS, SUPPLIER, TOKEN, walletFor } from "../test/fixtures";

vi.mock(import("../lib/stellar"), async (importOriginal) => ({ ...(await importOriginal()), createShipment: vi.fn() }));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillForm() {
  fill("New shipment ID", "PO-42");
  fill("Escrow amount", "5000");
  fill("Supplier address", SUPPLIER);
  fill("Logistics address", LOGISTICS);
  fill("Arbiter address", ARBITER);
  fill("Token address", TOKEN);
}

describe("CreateShipmentForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("is disabled until a wallet is connected", () => {
    render(<CreateShipmentForm wallet={null} onStart={vi.fn()} onCreated={vi.fn()} onError={vi.fn()} />);
    expect((screen.getByRole("button", { name: /sign & create/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("signs a create_shipment transaction and reports the new shipment", async () => {
    vi.mocked(createShipment).mockResolvedValue("abcdef0123456789");
    const onStart = vi.fn();
    const onCreated = vi.fn();
    const wallet = walletFor(BUYER);
    render(<CreateShipmentForm wallet={wallet} onStart={onStart} onCreated={onCreated} onError={vi.fn()} />);

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /sign & create/i }));

    expect(onStart).toHaveBeenCalled();
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("PO-42", "abcdef0123456789"));
    expect(createShipment).toHaveBeenCalledWith(wallet, {
      shipmentId: "PO-42",
      supplier: SUPPLIER,
      logistics: LOGISTICS,
      arbiter: ARBITER,
      token: TOKEN,
      totalAmount: "5000",
      milestoneMode: "Sequential",
      milestones: [
        { name: "Goods dispatched", paymentPercent: 50 },
        { name: "Delivered", paymentPercent: 50 },
      ],
    });
  });

  it("shows a signing state while the transaction is pending", () => {
    vi.mocked(createShipment).mockReturnValue(new Promise(() => undefined));
    render(<CreateShipmentForm wallet={walletFor(BUYER)} onStart={vi.fn()} onCreated={vi.fn()} onError={vi.fn()} />);

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /sign & create/i }));

    expect((screen.getByRole("button", { name: /signing/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects milestones that do not add up to 100%", () => {
    const onError = vi.fn();
    render(<CreateShipmentForm wallet={walletFor(BUYER)} onStart={vi.fn()} onCreated={vi.fn()} onError={onError} />);

    fillForm();
    fill("Milestone 2 percent", "30");
    fireEvent.click(screen.getByRole("button", { name: /sign & create/i }));

    expect(onError).toHaveBeenCalledWith("Milestone percentages must be positive and add up to 100.");
    expect(createShipment).not.toHaveBeenCalled();
  });

  it("surfaces transaction failures", async () => {
    vi.mocked(createShipment).mockRejectedValue(new Error("shipment already exists"));
    const onError = vi.fn();
    render(<CreateShipmentForm wallet={walletFor(BUYER)} onStart={vi.fn()} onCreated={vi.fn()} onError={onError} />);

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /sign & create/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("shipment already exists"));
  });
});
