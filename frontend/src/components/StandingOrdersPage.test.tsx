import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelStandingOrder, createStandingOrder, executeStandingOrder, listStandingOrders, type StandingOrder } from "../lib/stellar";
import { buyerAddress, supplierAddress, walletFor } from "../test/fixtures";
import { parseMilestones, StandingOrdersPage } from "./StandingOrdersPage";

vi.mock("../lib/stellar", () => ({
  cancelStandingOrder: vi.fn(),
  createStandingOrder: vi.fn(),
  executeStandingOrder: vi.fn(),
  listStandingOrders: vi.fn(),
}));

const order: StandingOrder = {
  order_id: "7",
  buyer: buyerAddress,
  template_name: "Weekly coffee",
  supplier: supplierAddress,
  token: supplierAddress,
  amount: "5000",
  interval_ledgers: 120960,
  max_occurrences: 4,
  occurrences: 1,
  next_ledger: 2000,
  cancelled: false,
};

function setup() {
  const props = { wallet: walletFor(buyerAddress), onConnect: vi.fn(), onError: vi.fn(), onNotice: vi.fn() };
  render(<StandingOrdersPage {...props} />);
  return props;
}

describe("StandingOrdersPage", () => {
  beforeEach(() => {
    vi.mocked(listStandingOrders).mockReset().mockResolvedValue([order]);
    vi.mocked(createStandingOrder).mockReset();
    vi.mocked(executeStandingOrder).mockReset();
    vi.mocked(cancelStandingOrder).mockReset();
  });

  it("lists the buyer's standing orders", async () => {
    setup();
    expect(await screen.findByText("Weekly coffee")).toBeInTheDocument();
    expect(listStandingOrders).toHaveBeenCalledWith(buyerAddress, buyerAddress);
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
  });

  it("creates a standing order and reloads the list", async () => {
    vi.mocked(listStandingOrders).mockResolvedValueOnce([]);
    vi.mocked(createStandingOrder).mockResolvedValue("7");
    const props = setup();
    await screen.findByText(/No standing orders yet/);

    await userEvent.click(screen.getByRole("button", { name: /new standing order/i }));
    await userEvent.type(screen.getByLabelText("Template name"), "Weekly coffee");
    await userEvent.type(screen.getByLabelText("Supplier address"), supplierAddress);
    await userEvent.type(screen.getByLabelText("Logistics address"), supplierAddress);
    await userEvent.type(screen.getByLabelText("Arbiter address"), supplierAddress);
    await userEvent.type(screen.getByLabelText("Token contract address"), supplierAddress);
    await userEvent.type(screen.getByLabelText("Amount (base units)"), "5000");
    await userEvent.type(screen.getByLabelText("Interval (ledgers)"), "120960");
    await userEvent.type(screen.getByLabelText("Max occurrences"), "4");
    const milestones = screen.getByLabelText("Milestones (Name:percent, …)");
    await userEvent.clear(milestones);
    await userEvent.type(milestones, "Pickup:40, Delivery:60");
    await userEvent.click(screen.getByRole("button", { name: /create standing order/i }));

    await waitFor(() => expect(props.onNotice).toHaveBeenLastCalledWith("Standing order #7 created"));
    expect(createStandingOrder).toHaveBeenCalledWith(props.wallet, expect.objectContaining({
      template_name: "Weekly coffee",
      amount: "5000",
      interval_ledgers: 120960,
      max_occurrences: 4,
      milestones: [{ name: "Pickup", payment_percent: 40 }, { name: "Delivery", payment_percent: 60 }],
    }));
    expect(await screen.findByText("Weekly coffee")).toBeInTheDocument();
  });

  it("executes and cancels a standing order from the list", async () => {
    vi.mocked(executeStandingOrder).mockResolvedValue("so-7-1");
    vi.mocked(cancelStandingOrder).mockResolvedValue("cancelhash");
    const props = setup();
    await screen.findByText("Weekly coffee");

    await userEvent.click(screen.getByRole("button", { name: /execute/i }));
    await waitFor(() => expect(props.onNotice).toHaveBeenLastCalledWith("Standing order #7 executed · shipment so-7-1"));
    expect(executeStandingOrder).toHaveBeenCalledWith(props.wallet, "7");

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(props.onNotice).toHaveBeenLastCalledWith("Standing order #7 cancelled"));
    expect(cancelStandingOrder).toHaveBeenCalledWith(props.wallet, "7");
  });

  it("reports transaction errors through the dashboard error handler", async () => {
    vi.mocked(executeStandingOrder).mockRejectedValue(new Error("standing order not due"));
    const props = setup();
    await userEvent.click(await screen.findByRole("button", { name: /execute/i }));
    await waitFor(() => expect(props.onError).toHaveBeenLastCalledWith("standing order not due"));
  });
});

describe("parseMilestones", () => {
  it("rejects milestone splits that do not sum to 100", () => {
    expect(() => parseMilestones("Pickup:40, Delivery:50")).toThrow("Milestone percentages must sum to 100.");
  });
});
