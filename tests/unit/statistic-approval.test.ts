import { describe, expect, it } from "vitest";
import { approvedStatisticsOnly } from "@/server/services/content";
import { statisticApprovalKey } from "@/server/validation/cms";

const YEARS_CLAIM = { label: "Years of success", value: "50", approved: true };
const TRUSTED_CLAIM = { label: "Brands represented", value: "8", approved: true };

describe("FR-007 statistic approval gate (T114)", () => {
  it("hides a claim that is marked approved in the payload but has no server-side approval", () => {
    expect(approvedStatisticsOnly([YEARS_CLAIM], null)).toEqual([]);
    expect(approvedStatisticsOnly([YEARS_CLAIM], {})).toEqual([]);
  });

  it("hides a claim whose approval was recorded for different wording", () => {
    const staleFlags = { [statisticApprovalKey({ label: "Years of success", value: "40" })]: true };
    expect(approvedStatisticsOnly([YEARS_CLAIM], staleFlags)).toEqual([]);
  });

  it("renders a claim only when the payload flag and the register both agree", () => {
    const flags = { [statisticApprovalKey(TRUSTED_CLAIM)]: true };
    expect(approvedStatisticsOnly([TRUSTED_CLAIM], flags)).toEqual([
      { label: "Brands represented", value: "8" },
    ]);
  });

  it("hides a claim explicitly unapproved in the register even if the payload says approved", () => {
    const flags = { [statisticApprovalKey(YEARS_CLAIM)]: false };
    expect(approvedStatisticsOnly([YEARS_CLAIM], flags)).toEqual([]);
  });

  it("strips the internal approval fields from the public shape", () => {
    const flags = { [statisticApprovalKey(TRUSTED_CLAIM)]: true };
    const [only] = approvedStatisticsOnly([TRUSTED_CLAIM], flags);
    expect(Object.keys(only)).toEqual(["label", "value"]);
  });

  it("derives a stable key that changes whenever the claim text changes", () => {
    expect(statisticApprovalKey(YEARS_CLAIM)).toBe(
      statisticApprovalKey({ label: "Years of success", value: "50" }),
    );
    expect(statisticApprovalKey(YEARS_CLAIM)).not.toBe(
      statisticApprovalKey({ label: "Years of success", value: "51" }),
    );
    expect(statisticApprovalKey(YEARS_CLAIM)).not.toBe(
      statisticApprovalKey({ label: "Years of success ", value: "50" }),
    );
  });
});
