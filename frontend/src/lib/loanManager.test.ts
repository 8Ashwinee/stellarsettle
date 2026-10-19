import { describe, expect, it } from "vitest";
import {
  borrowCapacity,
  decodePoolInfoXdr,
  encodePoolInfoXdr,
  healthFactor,
  type LoanSnapshot,
  type PoolInfo,
} from "./loanManager";

describe("loan manager XDR codecs", () => {
  it("round-trips pool totals and TWAP diagnostics without losing i128 precision", () => {
    const pool: PoolInfo = {
      totalDeposits: "123456789012345678901234567890",
      totalBorrowed: "98765432109876543210987654321",
      twapFallbackCount: 17,
    };

    expect(decodePoolInfoXdr(encodePoolInfoXdr(pool))).toEqual(pool);
  });

  it("limits borrow capacity by collateral and free pool liquidity", () => {
    const snapshot: LoanSnapshot = {
      market: { collateral_token: "collateral", debt_token: "debt", liq_threshold_bps: 8_000 },
      position: { collateral: "1000", debt: "500" },
      depositorBalance: "0",
      pool: { totalDeposits: "1000", totalBorrowed: "900", twapFallbackCount: 0 },
      collateralPrice: "100000000",
      debtPrice: "100000000",
      paused: false,
    };

    expect(borrowCapacity(snapshot)).toBe(100n);
  });

  it("never reports negative capacity for an unhealthy position or an illiquid pool", () => {
    const snapshot: LoanSnapshot = {
      market: { collateral_token: "collateral", debt_token: "debt", liq_threshold_bps: 8_000 },
      position: { collateral: "1000", debt: "900" },
      depositorBalance: "0",
      pool: { totalDeposits: "1000", totalBorrowed: "1000", twapFallbackCount: 0 },
      collateralPrice: "100000000",
      debtPrice: "100000000",
      paused: false,
    };

    expect(borrowCapacity(snapshot)).toBe(0n);
  });

  it("calculates the exact health-factor fraction used by repay previews", () => {
    const snapshot: LoanSnapshot = {
      market: { collateral_token: "collateral", debt_token: "debt", liq_threshold_bps: 8_000 },
      position: { collateral: "1000", debt: "500" },
      depositorBalance: "0",
      pool: { totalDeposits: "1000", totalBorrowed: "500", twapFallbackCount: 0 },
      collateralPrice: "100000000",
      debtPrice: "100000000",
      paused: false,
    };

    expect(healthFactor(snapshot.position, snapshot)).toEqual({ numerator: 8_000_000n, denominator: 5_000_000n });
    expect(healthFactor({ ...snapshot.position, debt: "250" }, snapshot)).toEqual({ numerator: 8_000_000n, denominator: 2_500_000n });
  });
});