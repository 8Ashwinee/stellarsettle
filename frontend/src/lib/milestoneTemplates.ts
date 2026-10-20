import { nativeToScVal, xdr } from "@stellar/stellar-sdk";

export type MilestoneDraft = { name: string; percent: string };

export function validateTemplate(name: string, milestones: MilestoneDraft[]): string {
  if (!name.trim()) return "Template name is required.";
  if (milestones.length === 0) return "Add at least one milestone.";
  if (milestones.some((item) => !item.name.trim())) return "Every milestone needs a name.";
  const percents = milestones.map((item) => Number(item.percent));
  if (percents.some((value) => !Number.isInteger(value) || value <= 0)) return "Percentages must be positive whole numbers.";
  const sum = percents.reduce((a, b) => a + b, 0);
  if (sum !== 100) return `Milestone percentages must total 100 (currently ${sum}).`;
  return "";
}

const sym = (value: string) => nativeToScVal(value, { type: "symbol" });
const u32 = (value: number) => nativeToScVal(value, { type: "u32" });
const entry = (key: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(key), val });

/** Encodes a pending Milestone struct (map keys sorted, as Soroban requires). */
export function milestoneToScVal(item: MilestoneDraft): xdr.ScVal {
  return xdr.ScVal.scvMap([
    entry("deadline_ledger", u32(0)),
    entry("dispute_opened_ledger", xdr.ScVal.scvVoid()),
    entry("name", nativeToScVal(item.name.trim(), { type: "string" })),
    entry("payment_percent", u32(Number(item.percent))),
    entry("penalty_bps_per_ledger", u32(0)),
    entry("proof_hash", nativeToScVal("", { type: "string" })),
    entry("proof_submitted_ledger", xdr.ScVal.scvVoid()),
    entry("release_after_ledger", u32(0)),
    entry("status", xdr.ScVal.scvVec([sym("Pending")])),
  ]);
}

export type ShipmentDraft = { templateName: string; shipmentId: string; supplier: string; logistics: string; arbiter: string; token: string; totalAmount: string };

export function emptyDraft(templateName = ""): ShipmentDraft {
  return { templateName, shipmentId: "", supplier: "", logistics: "", arbiter: "", token: "", totalAmount: "" };
}
