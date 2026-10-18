import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionsToolbar } from "./BulkActionsToolbar";

function renderToolbar(overrides: Partial<React.ComponentProps<typeof BulkActionsToolbar>> = {}) {
  const props = {
    selectedCount: 3,
    maxCancel: 20,
    busy: false,
    onConfirm: vi.fn().mockResolvedValue(true),
    onCancel: vi.fn().mockResolvedValue(true),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<BulkActionsToolbar {...props} />);
  return props;
}

describe("BulkActionsToolbar", () => {
  it("is hidden when nothing is selected", () => {
    renderToolbar({ selectedCount: 0 });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("runs batch confirm for the selection", () => {
    const props = renderToolbar();
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirm submitted milestones/i }));
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it("requires a reason before batch cancelling", async () => {
    const props = renderToolbar();
    const cancel = screen.getByRole("button", { name: /cancel shipments/i }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Cancellation reason"), { target: { value: "Supplier insolvent" } });
    fireEvent.click(cancel);
    await waitFor(() => expect(props.onCancel).toHaveBeenCalledWith("Supplier insolvent"));
  });

  it("blocks cancelling more shipments than the contract allows", () => {
    renderToolbar({ selectedCount: 21 });
    fireEvent.change(screen.getByLabelText("Cancellation reason"), { target: { value: "Too many" } });
    expect((screen.getByRole("button", { name: /cancel shipments/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables actions while a batch is signing", () => {
    renderToolbar({ busy: true });
    expect((screen.getByRole("button", { name: /confirm submitted milestones/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
