import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmMilestone } from "../lib/stellar";
import { buyerAddress, shipmentFixture, supplierAddress, walletFor } from "../test/fixtures";
import { MilestoneConfirmation } from "./MilestoneConfirmation";

vi.mock("../lib/stellar", () => ({ confirmMilestone: vi.fn() }));

function setup(address: string) {
  const props = {
    wallet: walletFor(address),
    shipment: shipmentFixture(),
    onUpdated: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
    onNotice: vi.fn(),
  };
  render(<MilestoneConfirmation {...props} />);
  return props;
}

describe("MilestoneConfirmation", () => {
  beforeEach(() => vi.mocked(confirmMilestone).mockReset());

  it("only offers confirmation to the buyer on milestones awaiting confirmation", () => {
    setup(buyerAddress);
    expect(screen.getAllByRole("button", { name: /confirm/i })).toHaveLength(1);
    expect(screen.getByText("Proof submitted")).toBeInTheDocument();
  });

  it("hides the confirm action from the supplier", () => {
    setup(supplierAddress);
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("confirms the milestone and refreshes the shipment", async () => {
    vi.mocked(confirmMilestone).mockResolvedValue("abcdef1234567890");
    const props = setup(buyerAddress);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(props.onUpdated).toHaveBeenCalled());
    expect(confirmMilestone).toHaveBeenCalledWith(props.wallet, "SHIP-1", 0);
    expect(props.onNotice).toHaveBeenLastCalledWith(expect.stringContaining("Milestone 1 confirmed"));
  });

  it("reports contract errors through the dashboard error handler", async () => {
    vi.mocked(confirmMilestone).mockRejectedValue(new Error("milestone proof not yet submitted"));
    const props = setup(buyerAddress);
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(props.onError).toHaveBeenLastCalledWith("milestone proof not yet submitted"));
    expect(props.onUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
  });
});
