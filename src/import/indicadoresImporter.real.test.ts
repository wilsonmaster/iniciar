// @vitest-environment jsdom
// @ts-nocheck -- Optional local integration test; Node types are not a runtime dependency.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateScenario } from "../domain/estimate";
import { importIndicadores } from "./indicadoresImporter";

const workbookPath = process.env.INDICADORES_XLSX_PATH;

describe.skipIf(!workbookPath)("INDICADORES.xlsx integration", () => {
  it("imports and reconciles the two supplied sensitivities", () => {
    const bytes = readFileSync(workbookPath);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const result = importIndicadores(buffer, "INDICADORES.xlsx");

    expect(result.workbook).not.toBeNull();
    expect(result.quality.issues).not.toContainEqual(
      expect.objectContaining({ severity: "error" }),
    );
    expect(result.workbook?.references).toHaveLength(6);
    expect(result.workbook?.scenarios).toHaveLength(2);

    const [scenario2, scenario3] = result.workbook.scenarios;
    expect(scenario2.housingUnits).toEqual({ vis: 724, nonVis: 284 });
    expect(scenario3.housingUnits).toEqual({ vis: 982, nonVis: 181 });
    expect(scenario2.areas.constructedTotal).toBeCloseTo(53_285.94, 6);
    expect(scenario3.areas.constructedTotal).toBeCloseTo(53_285.94, 6);
    expect(scenario2.areas.sellableVis).toBeCloseTo(20_493.53, 6);
    expect(scenario2.areas.sellableNonVis).toBeCloseTo(15_040.709736, 6);
    expect(scenario3.areas.sellableVis).toBeCloseTo(27_810.48, 6);
    expect(scenario3.areas.sellableNonVis).toBeCloseTo(9_065.64, 6);
    expect(scenario2.reportedResults?.baseBudget?.value).toBeCloseTo(
      157_417_838_654.75873,
      2,
    );
    expect(scenario3.reportedResults?.baseBudget?.value).toBeCloseTo(
      153_089_553_978.7202,
      2,
    );
    expect(scenario2.externalUrbanism?.amount).toBe(16_318_079_700);
    expect(scenario3.externalUrbanism?.amount).toBe(16_318_079_700);
    expect(scenario2.externalUrbanism?.includedInBase).toBe(false);
    expect(scenario3.externalUrbanism?.includedInBase).toBe(false);

    const estimate2 = estimateScenario(
      scenario2,
      result.workbook.references,
      result.workbook.config,
    );
    const estimate3 = estimateScenario(
      scenario3,
      result.workbook.references,
      result.workbook.config,
    );
    expect(estimate2.baseBudget).toBeCloseTo(157_417_838_654.75873, 2);
    expect(estimate3.baseBudget).toBeCloseTo(153_089_553_978.7202, 2);
    expect(estimate2.budgetWithExternalUrbanism).toBeCloseTo(
      173_735_918_354.75873,
      2,
    );
    expect(estimate3.budgetWithExternalUrbanism).toBeCloseTo(
      169_407_633_678.7202,
      2,
    );
  });
});
