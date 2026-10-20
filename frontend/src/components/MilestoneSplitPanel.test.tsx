import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MilestoneSplitPanel } from "./MilestoneSplitPanel";
import { ShipmentMilestones } from "./ShipmentMilestones";
import {
  approveMilestoneSplit,
  getMaxEvidencePerMilestone,
  getMilestoneSplitProposal,
  getMilestones,
  proposeMilestoneSplit,
  type Milestone,
  type MilestoneSplitProposal,
  type Wallet,
} from "../lib/stellar";

vi.mock("../lib/stellar", () => ({
  approveMilestoneSplit: vi.fn(),
  getDisputeEvidence: vi.fn().mockResolvedValue([]),
  getMaxEvidencePerMilestone: vi.fn(),
  getMilestoneSplitProposal: vi.fn(),
  getMilestones: vi.fn(),
  proposeMilestoneSplit: vi.fn(),
}));

const buyer: Wallet = { address: `G${"B".repeat(55)}`, network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };
const supplier: Wallet = { ...buyer, address: `G${"S".repeat(55)}` };

const milestones: Milestone[] = [
  { index: 0, name: "Deposit", payment_percent: 30, status: "Confirmed" },
  { index: 1, name: "Delivery", payment_percent: 70, status: "Pending" },
];

const proposal: MilestoneSplitProposal = {
  milestone_index: 1,
  proposer: buyer.address,
  parts: [
    { name: "Port arrival", payment_percent: 40 },
    { name: "Warehouse", payment_percent: 30 },
  ],
};

describe("MilestoneSplitPanel", () => {
  beforeEach(() => {
    vi.mocked(getMilestoneSplitProposal).mockReset();
    vi.mocked(proposeMilestoneSplit).mockReset();
    vi.mocked(approveMilestoneSplit).mockReset();
    vi.mocked(getMilestones).mockReset();
    vi.mocked(getMaxEvidencePerMilestone).mockReset().mockResolvedValue(5);
  });

  it("proposes splitting a milestone into two parts", async () => {
    vi.mocked(getMilestoneSplitProposal).mockResolvedValueOnce(null).mockResolvedValueOnce(proposal);
    vi.mocked(proposeMilestoneSplit).mockResolvedValue("split-hash-000001");
    const onNotice = vi.fn();
    render(<MilestoneSplitPanel wallet={buyer} shipmentId="SHP-1" milestones={milestones} onApplied={vi.fn()} onError={vi.fn()} onNotice={onNotice} />);

    fireEvent.click(await screen.findByRole("button", { name: "Propose split" }));
    fireEvent.change(screen.getByLabelText("First part name"), { target: { value: "Port arrival" } });
    fireEvent.change(screen.getByLabelText("First part percent"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Second part name"), { target: { value: "Warehouse" } });
    expect(screen.getByText("30%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign & propose" }));

    await screen.findByText("Awaiting counterparty approval.");
    expect(proposeMilestoneSplit).toHaveBeenCalledWith(buyer, "SHP-1", 1, proposal.parts);
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("Milestone split proposed"));
  });

  it("shows the pending proposal to the proposer without an approve action", async () => {
    vi.mocked(getMilestoneSplitProposal).mockResolvedValue(proposal);
    render(<MilestoneSplitPanel wallet={buyer} shipmentId="SHP-1" milestones={milestones} onApplied={vi.fn()} onError={vi.fn()} onNotice={vi.fn()} />);

    await screen.findByText("Pending split of milestone 2 · Delivery");
    expect(screen.getByText("Proposed by you")).toBeTruthy();
    expect(screen.getByText("Awaiting counterparty approval.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve split" })).toBeNull();
  });

  it("lets the counterparty approve and refreshes the milestone list", async () => {
    vi.mocked(getMilestoneSplitProposal).mockResolvedValueOnce(proposal).mockResolvedValue(null);
    vi.mocked(getMilestones)
      .mockResolvedValueOnce(milestones)
      .mockResolvedValueOnce([
        milestones[0],
        { index: 1, name: "Port arrival", payment_percent: 40, status: "Pending" },
        { index: 2, name: "Warehouse", payment_percent: 30, status: "Pending" },
      ]);
    vi.mocked(approveMilestoneSplit).mockResolvedValue("approve-hash-0001");
    const onShipmentChanged = vi.fn();
    render(<ShipmentMilestones wallet={supplier} shipmentId="SHP-1" onShipmentChanged={onShipmentChanged} onError={vi.fn()} onNotice={vi.fn()} />);

    await screen.findByText("2. Delivery");
    fireEvent.click(await screen.findByRole("button", { name: "Approve split" }));

    await screen.findByText("3. Warehouse");
    expect(screen.getByText("2. Port arrival")).toBeTruthy();
    expect(screen.queryByText("2. Delivery")).toBeNull();
    expect(approveMilestoneSplit).toHaveBeenCalledWith(supplier, "SHP-1", 1);
    await waitFor(() => expect(onShipmentChanged).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Pending split proposal" })).toBeNull();
  });

  it("reports approval errors", async () => {
    vi.mocked(getMilestoneSplitProposal).mockResolvedValue(proposal);
    vi.mocked(approveMilestoneSplit).mockRejectedValue(new Error("split must be approved by the counterparty"));
    const onError = vi.fn();
    render(<MilestoneSplitPanel wallet={supplier} shipmentId="SHP-1" milestones={milestones} onApplied={vi.fn()} onError={onError} onNotice={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve split" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("split must be approved by the counterparty"));
  });
});
