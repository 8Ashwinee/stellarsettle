import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Reputation } from "../lib/stellar";
import { RatingPrompt } from "./RatingPrompt";

const reputation: Reputation = { address: "GSUPPLIERADDRESS12345", ratingCount: 2, averageX100: 450, completed: 7, disputed: 1, cancelled: 0 };

describe("RatingPrompt", () => {
  it("submits the selected star rating", async () => {
    const onRate = vi.fn().mockResolvedValue(true);
    render(<RatingPrompt counterpartyLabel="supplier" reputation={reputation} alreadyRated={false} busy={false} onRate={onRate} />);

    const submit = screen.getByRole("button", { name: /submit rating/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(4));
  });

  it("shows the counterparty reputation", () => {
    render(<RatingPrompt counterpartyLabel="supplier" reputation={reputation} alreadyRated={false} busy={false} onRate={vi.fn()} />);
    expect(screen.getByText("4.50 / 5")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("replaces the form once the shipment has been rated", () => {
    render(<RatingPrompt counterpartyLabel="buyer" reputation={null} alreadyRated busy={false} onRate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /submit rating/i })).toBeNull();
    expect(screen.getByText(/you have rated this shipment/i)).toBeTruthy();
  });

  it("shows a signing state while busy", () => {
    render(<RatingPrompt counterpartyLabel="supplier" reputation={null} alreadyRated={false} busy onRate={vi.fn()} />);
    expect((screen.getByRole("button", { name: /signing/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
