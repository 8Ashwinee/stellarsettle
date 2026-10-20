import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisputeEvidencePanel } from "./DisputeEvidencePanel";
import { getDisputeEvidence, submitDisputeEvidence, type DisputeEvidence, type Wallet } from "../lib/stellar";

vi.mock("../lib/stellar", () => ({
  getDisputeEvidence: vi.fn(),
  submitDisputeEvidence: vi.fn(),
}));

const wallet: Wallet = { address: `G${"B".repeat(55)}`, network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };

function entry(hash: string): DisputeEvidence {
  return { submitter: wallet.address, evidence_hash: hash, evidence_type: "invoice", submitted_ledger: 4200 };
}

function renderPanel(maxEvidence: number) {
  const props = { wallet, shipmentId: "SHP-1", milestoneIndex: 0, maxEvidence, onError: vi.fn(), onNotice: vi.fn() };
  render(<DisputeEvidencePanel {...props} />);
  return props;
}

describe("DisputeEvidencePanel", () => {
  beforeEach(() => {
    vi.mocked(getDisputeEvidence).mockReset();
    vi.mocked(submitDisputeEvidence).mockReset();
  });

  it("adds submitted evidence to the list and locks the form at the configured max", async () => {
    vi.mocked(getDisputeEvidence)
      .mockResolvedValueOnce([entry("ipfs://first")])
      .mockResolvedValueOnce([entry("ipfs://first"), entry("ipfs://second")]);
    vi.mocked(submitDisputeEvidence).mockResolvedValue("evidence-hash-001");
    const props = renderPanel(2);

    await screen.findByText("ipfs://first");
    fireEvent.change(screen.getByLabelText("Evidence type"), { target: { value: "photo" } });
    fireEvent.change(screen.getByLabelText("Evidence hash or URI"), { target: { value: "ipfs://second" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit evidence" }));

    await screen.findByText("ipfs://second");
    expect(submitDisputeEvidence).toHaveBeenCalledWith(wallet, "SHP-1", 0, "ipfs://second", "photo");
    expect(props.onNotice).toHaveBeenCalledWith(expect.stringContaining("Dispute evidence submitted"));
    expect(screen.getByText("Evidence limit of 2 reached for this milestone.")).toBeTruthy();
    expect(screen.queryByLabelText("Evidence hash or URI")).toBeNull();
  });

  it("never lists more entries than the configured max", async () => {
    vi.mocked(getDisputeEvidence).mockResolvedValue([entry("a"), entry("b"), entry("c")]);
    renderPanel(2);

    await screen.findByText("a");
    expect(screen.getByText("b")).toBeTruthy();
    expect(screen.queryByText("c")).toBeNull();
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("reports submission errors", async () => {
    vi.mocked(getDisputeEvidence).mockResolvedValue([]);
    vi.mocked(submitDisputeEvidence).mockRejectedValue(new Error("evidence can only be submitted while milestone is Disputed"));
    const props = renderPanel(5);

    await screen.findByText("No evidence submitted yet.");
    fireEvent.change(screen.getByLabelText("Evidence hash or URI"), { target: { value: "ipfs://x" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit evidence" }));

    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("evidence can only be submitted while milestone is Disputed"));
  });
});
