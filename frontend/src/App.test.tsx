import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { connectWallet, getShipmentSummary, topUpEscrow, type Shipment } from "./lib/stellar";

vi.mock("./lib/stellar", () => ({
  appNetwork: "testnet",
  configuredContractId: "",
  connectWallet: vi.fn(),
  getShipmentSummary: vi.fn(),
  setShipmentMetadata: vi.fn(),
  topUpEscrow: vi.fn(),
  getMilestones: vi.fn().mockResolvedValue([]),
  getMaxEvidencePerMilestone: vi.fn().mockResolvedValue(5),
  getMilestoneSplitProposal: vi.fn().mockResolvedValue(null),
  getDisputeEvidence: vi.fn().mockResolvedValue([]),
  getVaultBalance: vi.fn().mockResolvedValue("0"),
  vaultDeposit: vi.fn(),
  vaultWithdraw: vi.fn(),
}));

class FakeEventSource {
  addEventListener() {}
  close() {}
}

const shipment: Shipment = {
  id: "SHP-1",
  status: "Active",
  supplier: `G${"S".repeat(55)}`,
  token: `C${"T".repeat(55)}`,
  total_amount: "1000",
  released_amount: "0",
  milestone_count: 2,
  open_disputes: 0,
  created_at: 100,
};

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.mocked(connectWallet).mockResolvedValue({ address: "GBUYER", network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, "", "/");
  });

  it("updates the escrow total after a successful top-up", async () => {
    vi.mocked(getShipmentSummary)
      .mockResolvedValueOnce(shipment)
      .mockResolvedValueOnce({ ...shipment, total_amount: "1500" });
    vi.mocked(topUpEscrow).mockResolvedValue("topup-hash-000001");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    await screen.findAllByText("Wallet connected");
    fireEvent.change(screen.getByLabelText("Shipment ID"), { target: { value: "SHP-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("ESCROW TOTAL");

    fireEvent.click(screen.getByRole("button", { name: "Top up escrow" }));
    fireEvent.change(screen.getByLabelText("Top-up amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign & top up" }));

    await waitFor(() => expect(screen.getAllByText("1,500", { exact: false }).length).toBeGreaterThan(0));
    expect(topUpEscrow).toHaveBeenCalledWith(expect.objectContaining({ address: "GBUYER" }), "SHP-1", "500");
    expect(getShipmentSummary).toHaveBeenLastCalledWith("GBUYER", "SHP-1");
  });

  it("renders the vault page on the /vault route", () => {
    window.history.pushState(null, "", "/vault");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Escrow vault" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Vault balance" })).toBeTruthy();
  });
});
