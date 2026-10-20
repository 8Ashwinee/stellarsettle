import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveAdvance, getAdvanceRequest, getMaxAdvancePercent, requestAdvance } from "../lib/stellar";
import { buyerAddress, shipmentFixture, supplierAddress, walletFor } from "../test/fixtures";
import { AdvancePayments } from "./AdvancePayments";

vi.mock("../lib/stellar", () => ({
  approveAdvance: vi.fn(),
  getAdvanceRequest: vi.fn(),
  getMaxAdvancePercent: vi.fn(),
  requestAdvance: vi.fn(),
}));

function setup(address: string) {
  const props = {
    wallet: walletFor(address),
    shipment: shipmentFixture(),
    onUpdated: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    onNotice: vi.fn(),
  };
  render(<AdvancePayments {...props} />);
  return props;
}

describe("AdvancePayments", () => {
  beforeEach(() => {
    vi.mocked(getMaxAdvancePercent).mockReset().mockResolvedValue(30);
    vi.mocked(getAdvanceRequest).mockReset().mockResolvedValue(null);
    vi.mocked(approveAdvance).mockReset();
    vi.mocked(requestAdvance).mockReset();
  });

  it("lets the supplier request an advance within the contract maximum", async () => {
    vi.mocked(requestAdvance).mockResolvedValue("advancehash000000");
    const props = setup(supplierAddress);
    expect(await screen.findByText("MAX 30%")).toBeInTheDocument();

    const input = screen.getByLabelText("Advance percent");
    await userEvent.type(input, "45");
    expect(screen.getByText(/between 1% and 30%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request advance/i })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, "25");
    await userEvent.click(screen.getByRole("button", { name: /request advance/i }));

    // Only the Pending milestone (index 1) is eligible for an advance.
    await waitFor(() => expect(requestAdvance).toHaveBeenCalledWith(props.wallet, "SHIP-1", 1, 25));
    expect(props.onUpdated).toHaveBeenCalled();
  });

  it("lets the buyer approve a pending advance and refreshes released totals", async () => {
    vi.mocked(getAdvanceRequest).mockImplementation(async (_shipmentId, milestoneIndex) =>
      milestoneIndex === 1 ? { milestoneIndex, requestedPercent: 20, approved: false, amountAdvanced: "0" } : null);
    vi.mocked(approveAdvance).mockResolvedValue("approvehash000000");
    const props = setup(buyerAddress);

    expect(await screen.findByText("20% of milestone payment requested")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request advance/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
    expect(approveAdvance).toHaveBeenCalledWith(props.wallet, "SHIP-1", 1);
  });

  it("reports approval failures through the dashboard error handler", async () => {
    vi.mocked(getAdvanceRequest).mockImplementation(async (_shipmentId, milestoneIndex) =>
      milestoneIndex === 1 ? { milestoneIndex, requestedPercent: 20, approved: false, amountAdvanced: "0" } : null);
    vi.mocked(approveAdvance).mockRejectedValue(new Error("AdvanceAlreadyApproved"));
    const props = setup(buyerAddress);
    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));
    await waitFor(() => expect(props.onError).toHaveBeenLastCalledWith("AdvanceAlreadyApproved"));
    expect(props.onUpdated).not.toHaveBeenCalled();
  });
});
