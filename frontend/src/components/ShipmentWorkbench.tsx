import type { Wallet } from "../lib/stellar";
import { ShipmentRoleList } from "./ShipmentRoleList";
import { SupplierProfile } from "./SupplierProfile";
import { MilestoneTemplateManager } from "./MilestoneTemplateManager";

export function ShipmentWorkbench({ wallet }: { wallet: Wallet | null }) {
  return (
    <div className="shipment-workbench" style={{ display: "grid", gap: 16, marginTop: 16 }}>
      <ShipmentRoleList wallet={wallet} />
      <MilestoneTemplateManager wallet={wallet} />
      <SupplierProfile wallet={wallet} />
    </div>
  );
}
