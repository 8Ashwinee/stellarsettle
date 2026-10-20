import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultPage } from "./VaultPage";
import { getVaultBalance, vaultDeposit, vaultWithdraw, type Wallet } from "../lib/stellar";

vi.mock("../lib/stellar", () => ({
  getVaultBalance: vi.fn(),
  vaultDeposit: vi.fn(),
  vaultWithdraw: vi.fn(),
}));

const wallet: Wallet = { address: "GBUYER", network: "TESTNET", networkPassphrase: "Test SDF Network ; September 2015" };
const token = `C${"A".repeat(55)}`;

function renderVault(overrides: Partial<React.ComponentProps<typeof VaultPage>> = {}) {
  const props = { wallet, defaultToken: token, onConnect: vi.fn(), onError: vi.fn(), onNotice: vi.fn(), ...overrides };
  render(<VaultPage {...props} />);
  return props;
}

describe("VaultPage", () => {
  beforeEach(() => {
    vi.mocked(getVaultBalance).mockReset();
    vi.mocked(vaultDeposit).mockReset();
    vi.mocked(vaultWithdraw).mockReset();
  });

  it("loads the vault balance for the selected token", async () => {
    vi.mocked(getVaultBalance).mockResolvedValue("1000");
    renderVault();
    await waitFor(() => expect(screen.getByTestId("vault-balance").textContent).toBe("1,000"));
    expect(getVaultBalance).toHaveBeenCalledWith("GBUYER", token);
  });

  it("updates the balance immediately after a deposit and a withdrawal", async () => {
    vi.mocked(getVaultBalance)
      .mockResolvedValueOnce("1000")
      .mockReturnValue(new Promise(() => undefined));
    vi.mocked(vaultDeposit).mockResolvedValue("deposit-hash-0001");
    vi.mocked(vaultWithdraw).mockResolvedValue("withdraw-hash-0001");
    const props = renderVault();
    await waitFor(() => expect(screen.getByTestId("vault-balance").textContent).toBe("1,000"));

    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    await waitFor(() => expect(screen.getByTestId("vault-balance").textContent).toBe("1,250"));
    expect(vaultDeposit).toHaveBeenCalledWith(wallet, token, "250");

    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(screen.getByTestId("vault-balance").textContent).toBe("1,200"));
    expect(vaultWithdraw).toHaveBeenCalledWith(wallet, token, "50");
    expect(props.onNotice).toHaveBeenCalledWith(expect.stringContaining("Vault withdrawal confirmed"));
  });

  it("reports a failed transaction and leaves the balance unchanged", async () => {
    vi.mocked(getVaultBalance).mockResolvedValue("1000");
    vi.mocked(vaultWithdraw).mockRejectedValue(new Error("insufficient vault balance"));
    const props = renderVault();
    await waitFor(() => expect(screen.getByTestId("vault-balance").textContent).toBe("1,000"));

    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("insufficient vault balance"));
    expect(screen.getByTestId("vault-balance").textContent).toBe("1,000");
  });

  it("disables the forms until a wallet is connected", () => {
    renderVault({ wallet: null });
    expect((screen.getByRole("button", { name: "Deposit" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Connect Freighter to view and manage your vault balance.")).toBeTruthy();
  });
});
