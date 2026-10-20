export type ShipmentRole = "buyer" | "supplier" | "logistics" | "arbiter";

export const SHIPMENT_ROLES: { role: ShipmentRole; label: string; method: string; paginated: boolean }[] = [
  { role: "buyer", label: "Buyer", method: "get_shipments_by_buyer", paginated: false },
  { role: "supplier", label: "Supplier", method: "get_shipments_by_supplier", paginated: false },
  { role: "logistics", label: "Logistics", method: "get_shipments_by_logistics", paginated: true },
  { role: "arbiter", label: "Arbiter", method: "get_shipments_by_arbiter", paginated: true },
];

export const ROLE_PAGE_LIMIT = 100;

export function roleConfig(role: ShipmentRole) {
  return SHIPMENT_ROLES.find((item) => item.role === role)!;
}

/** Normalizes contract output into a de-duplicated list of shipment IDs. */
export function normalizeShipmentIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((id) => String(id)).filter(Boolean)));
}
