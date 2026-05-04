import { describe, expect, it } from "vitest";

import {
  classifyRowReferenceYearPatch,
  getJsonReferenceYear,
  parseArgs,
} from "../scripts/fix-leave-import-reference-year";

describe("leave import reference year fix script helpers", () => {
  it("parses dry-run and apply options without exposing row data", () => {
    expect(parseArgs(["--dry-run", "--from=2019", "--to=2026"])).toMatchObject({
      dryRun: true,
      apply: false,
      from: 2019,
      to: 2026,
      includeApplied: false,
    });
    expect(parseArgs(["--apply", "--from=2019", "--to=2026", "--batchId=batch1"])).toMatchObject({
      dryRun: false,
      apply: true,
      from: 2019,
      to: 2026,
      batchId: "batch1",
    });
  });

  it("reads referenceYear from safe summary JSON only", () => {
    expect(getJsonReferenceYear({ referenceYear: 2019 })).toBe(2019);
    expect(getJsonReferenceYear({ referenceYear: 2026 })).toBe(2026);
    expect(getJsonReferenceYear({ anythingElse: 2019 })).toBeNull();
    expect(getJsonReferenceYear(null)).toBeNull();
  });

  it("patches empty or source-year rows and warns on other years", () => {
    expect(
      classifyRowReferenceYearPatch({
        monthlyUsageJson: null,
        rawJson: null,
        from: 2019,
      }),
    ).toMatchObject({ patchable: true, rowYear: null });
    expect(
      classifyRowReferenceYearPatch({
        monthlyUsageJson: { referenceYear: 2019 },
        rawJson: null,
        from: 2019,
      }),
    ).toMatchObject({ patchable: true, rowYear: 2019 });
    expect(
      classifyRowReferenceYearPatch({
        monthlyUsageJson: { referenceYear: 2025 },
        rawJson: null,
        from: 2019,
      }),
    ).toMatchObject({ patchable: false, rowYear: 2025 });
  });
});
