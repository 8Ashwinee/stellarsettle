import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WarrantyState } from "../lib/stellar";
import { WarrantyPanel } from "./WarrantyPanel";

const noClaim: WarrantyState = { balance: "5000", endsAt: 120000, claim: null, filed: null, resolution: null };
const openClaim: WarrantyState = {
  ...noClaim,
  claim: { buyer: "GBUYER", evidence_hash: "ab".repeat(32), filed_ledger: 110000 },
  filed: { action: "warranty_claim_filed", caller: "GBUYER", ledger: 110000, detail: "file_warranty_claim" },
};

function renderPanel(warranty: WarrantyState, overrides: Partial<React.ComponentProps<typeof WarrantyPanel>> = {}) {
  const props = {
    warranty,
    shipmentStatus: "Completed",
    isBuyer: true,
    isArbiter: false,
    busy: false,
    onFile: vi.fn().mockResolvedValue(true),
    onResolve: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  render(<WarrantyPanel {...props} />);
  return props;
}

describe("WarrantyPanel", () => {
  it("lets the buyer file a claim on a completed shipment", async () => {
    const props = renderPanel(noClaim);
    expect(screen.getByText("Claim: None")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Warranty evidence"), { target: { value: "Compressor failed" } });
    fireEvent.click(screen.getByRole("button", { name: /file claim/i }));
    await waitFor(() => expect(props.onFile).toHaveBeenCalledWith("Compressor failed"));
  });

  it("hides the claim form for non-buyers", () => {
    renderPanel(noClaim, { isBuyer: false });
    expect(screen.queryByLabelText("Warranty evidence")).toBeNull();
  });

  it("shows an open claim and the arbiter resolution actions", () => {
    const props = renderPanel(openClaim, { isBuyer: false, isArbiter: true });
    expect(screen.getByText("Claim: Open")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /refund buyer/i }));
    expect(props.onResolve).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /dismiss claim/i }));
    expect(props.onResolve).toHaveBeenCalledWith(false);
  });

  it("disables resolution while a transaction is signing", () => {
    renderPanel(openClaim, { isArbiter: true, busy: true });
    expect((screen.getByRole("button", { name: /refund buyer/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the resolution outcome", () => {
    renderPanel({ ...noClaim, balance: "0", resolution: { outcome: "buyer", ledger: 115000 } });
    expect(screen.getByText("Claim: Resolved")).toBeTruthy();
    expect(screen.getByText("Refunded to buyer")).toBeTruthy();
  });
});
