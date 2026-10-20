import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopUpForm } from "./TopUpForm";
import { topUpEscrow, type Wallet } from "../lib/stellar";

vi.mock("../lib/stellar", () => ({
  topUpEscrow: vi.fn(),
}));

const wallet: Wallet = { address: "GBUYER", network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };

function renderForm() {
  const props = { wallet, shipmentId: "SHP-1", onToppedUp: vi.fn(), onError: vi.fn(), onNotice: vi.fn() };
  render(<TopUpForm {...props} />);
  return props;
}

describe("TopUpForm", () => {
  beforeEach(() => vi.mocked(topUpEscrow).mockReset());

  it("submits the top-up and refreshes the shipment", async () => {
    vi.mocked(topUpEscrow).mockResolvedValue("topup-hash-000001");
    const props = renderForm();

    fireEvent.change(screen.getByLabelText("Top-up amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign & top up" }));

    await waitFor(() => expect(props.onToppedUp).toHaveBeenCalled());
    expect(topUpEscrow).toHaveBeenCalledWith(wallet, "SHP-1", "500");
    expect(props.onNotice).toHaveBeenCalledWith(expect.stringContaining("Escrow topped up"));
  });

  it("shows a signing state while the transaction is pending", async () => {
    vi.mocked(topUpEscrow).mockReturnValue(new Promise(() => undefined));
    renderForm();

    fireEvent.change(screen.getByLabelText("Top-up amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign & top up" }));

    const button = await screen.findByRole("button", { name: "Signing" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces contract errors without refreshing", async () => {
    vi.mocked(topUpEscrow).mockRejectedValue(new Error("top-up disallowed: shipment is not active"));
    const props = renderForm();

    fireEvent.change(screen.getByLabelText("Top-up amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign & top up" }));

    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("top-up disallowed: shipment is not active"));
    expect(props.onToppedUp).not.toHaveBeenCalled();
  });
});
