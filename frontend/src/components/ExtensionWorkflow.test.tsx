import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveExtension, denyExtension, getExtensionState, requestExtension } from "../lib/stellar";
import { buyerAddress, shipmentFixture, supplierAddress, walletFor } from "../test/fixtures";
import { ExtensionWorkflow } from "./ExtensionWorkflow";

vi.mock("../lib/stellar", () => ({
  approveExtension: vi.fn(),
  denyExtension: vi.fn(),
  getExtensionState: vi.fn(),
  requestExtension: vi.fn(),
}));

function setup(address: string) {
  const props = {
    wallet: walletFor(address),
    shipment: shipmentFixture(),
    onUpdated: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    onNotice: vi.fn(),
  };
  render(<ExtensionWorkflow {...props} />);
  return props;
}

describe("ExtensionWorkflow", () => {
  beforeEach(() => {
    vi.mocked(getExtensionState).mockReset().mockImplementation(async (_address, _shipmentId, milestoneIndex) => ({
      milestoneIndex,
      deadline: 1000 + milestoneIndex,
      pending: milestoneIndex === 0 ? { extraLedgers: 500, reason: "Port congestion" } : null,
    }));
    vi.mocked(approveExtension).mockReset();
    vi.mocked(denyExtension).mockReset();
    vi.mocked(requestExtension).mockReset();
  });

  it("shows pending requests to the buyer with approve and deny actions", async () => {
    const props = setup(buyerAddress);
    expect(await screen.findByText(/\+500 ledgers · “Port congestion”/)).toBeInTheDocument();
    vi.mocked(approveExtension).mockResolvedValue("approvehash000000");
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
    expect(approveExtension).toHaveBeenCalledWith(props.wallet, "SHIP-1", 0);
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request extension/i })).not.toBeInTheDocument();
  });

  it("shows pending requests to the supplier and lets them request an extension with a reason", async () => {
    vi.mocked(requestExtension).mockResolvedValue("requesthash000000");
    const props = setup(supplierAddress);
    expect(await screen.findByText(/\+500 ledgers/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Extra ledgers"), "720");
    await userEvent.type(screen.getByLabelText("Extension reason"), "Customs hold");
    await userEvent.click(screen.getByRole("button", { name: /request extension/i }));

    await waitFor(() => expect(requestExtension).toHaveBeenCalledWith(props.wallet, "SHIP-1", 1, 720, "Customs hold"));
    expect(props.onNotice).toHaveBeenLastCalledWith(expect.stringContaining("Extension requested"));
  });

  it("surfaces load failures through the dashboard error handler", async () => {
    vi.mocked(getExtensionState).mockRejectedValue(new Error("RPC unavailable"));
    const props = setup(buyerAddress);
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("RPC unavailable"));
  });
});
