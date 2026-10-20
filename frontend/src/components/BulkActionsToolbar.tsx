import { useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";

type BulkActionsToolbarProps = {
  selectedCount: number;
  maxCancel: number;
  busy: boolean;
  onConfirm: () => Promise<boolean>;
  onCancel: (reason: string) => Promise<boolean>;
  onClear: () => void;
};

export function BulkActionsToolbar({ selectedCount, maxCancel, busy, onConfirm, onCancel, onClear }: BulkActionsToolbarProps) {
  const [reason, setReason] = useState("");

  if (selectedCount === 0) return null;

  async function handleCancel() {
    if (!reason.trim()) return;
    if (await onCancel(reason.trim())) setReason("");
  }

  return (
    <div className="bulk-toolbar" role="toolbar" aria-label="Bulk shipment actions">
      <strong>{selectedCount} selected</strong>
      <button className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Confirm submitted milestones</button>
      <input aria-label="Cancellation reason" placeholder="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} />
      <button className="filter-button danger-text" disabled={busy || !reason.trim() || selectedCount > maxCancel} title={selectedCount > maxCancel ? `At most ${maxCancel} shipments per batch` : undefined} onClick={handleCancel}><X size={14} />Cancel shipments</button>
      <button className="text-button" disabled={busy} onClick={onClear}>Clear selection</button>
    </div>
  );
}
