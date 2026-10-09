import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESTIMATE_CONFIG,
  DEFAULT_REFERENCES,
  getDefaultScenario,
} from "../data/defaultWorkbook";
import { applyAdjustment, estimateScenario } from "./estimate";
import type { CostReference, ScenarioInput } from "./types";

function estimateDefault(id: "scenario-2" | "scenario-3") {
  return estimateScenario(
    getDefaultScenario(id),
    DEFAULT_REFERENCES,
    DEFAULT_ESTIMATE_CONFIG,
  );
}

function line(
  estimate: ReturnType<typeof estimateDefault>,
  chapter: ReturnType<typeof estimateDefault>["lineItems"][number]["chapter"],
) {
  const item = estimate.lineItems.find(
    (candidate) => candidate.chapter === chapter,
  );
  expect(item, `No se encontró el capítulo ${chapter}`).toBeDefined();
  return item!;
}

describe("estimateScenario", () => {
  it("reproduce los totales canónicos de los escenarios 2 y 3", () => {
    const scenario2 = estimateDefault("scenario-2");
    const scenario3 = estimateDefault("scenario-3");

    expect(scenario2.lineItems).toHaveLength(6);
    expect(scenario3.lineItems).toHaveLength(6);
    expect(scenario2.baseBudget).toBe(157_417_838_654.75873);
    expect(scenario3.baseBudget).toBe(153_089_553_978.72025);

    expect(scenario2.indicators.costPerConstructedM2).toBe(
      2_954_209.6593352524,
    );
    expect(scenario3.indicators.costPerConstructedM2).toBe(
      2_872_982.140855923,
    );
    expect(
      scenario2.warnings.filter(
        ({ code }) => code === "source-reconciliation-difference",
      ),
    ).toEqual([]);
    expect(
      scenario3.warnings.filter(
        ({ code }) => code === "source-reconciliation-difference",
      ),
    ).toEqual([]);
  });

  it("conserva tarifas, ajustes y trazabilidad de celda sin redondear", () => {
    const estimate = estimateDefault("scenario-2");
    const parking = line(estimate, "parking-building");
    const urbanism = line(estimate, "internal-urbanism");
    const vis = line(estimate, "vis-towers");

    expect(parking.baseRate).toBe(2_232_473.959804815);
    expect(parking.adjustmentPerUnit).toBe(122_185.41222257512);
    expect(parking.finalRate).toBe(2_354_659.3720273897);
    expect(parking.rateSource).toMatchObject({
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "H68",
    });
    expect(parking.quantitySource).toMatchObject({
      sheet: "Ppto ",
      cell: "H6",
    });

    expect(urbanism.adjustment?.kind).toBe("percentage");
    expect(urbanism.adjustment?.value).toBe(0.05);
    expect(urbanism.adjustmentPerUnit).toBe(39_953.552642965056);
    expect(urbanism.finalRate).toBe(839_024.6055022662);
    expect(vis.rateSource.cell).toBe("H70");

    for (const item of estimate.lineItems) {
      expect(item.rateSource.sheet).toBeTruthy();
      expect(item.rateSource.cell).toBeTruthy();
      expect(item.quantitySource?.sheet).toBe(BUDGET_SHEET);
      expect(item.quantitySource?.cell).toBeTruthy();
    }
  });

  it("mantiene urbanismo externo separado y permite incluirlo una sola vez", () => {
    const scenario = getDefaultScenario("scenario-2");
    const base = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );
    const included = estimateScenario(scenario, DEFAULT_REFERENCES, {
      ...DEFAULT_ESTIMATE_CONFIG,
      includeExternalUrbanism: true,
    });

    expect(base.externalUrbanism.amount).toBe(16_318_079_700);
    expect(base.selectedBudget).toBe(base.baseBudget);
    expect(base.budgetWithExternalUrbanism).toBe(
      173_735_918_354.75873,
    );
    expect(included.selectedBudget).toBe(included.budgetWithExternalUrbanism);

    scenario.externalUrbanism = {
      ...scenario.externalUrbanism!,
      includedInBase: true,
    };
    const alreadyIncluded = estimateScenario(scenario, DEFAULT_REFERENCES, {
      ...DEFAULT_ESTIMATE_CONFIG,
      includeExternalUrbanism: true,
    });
    expect(alreadyIncluded.budgetWithExternalUrbanism).toBe(
      alreadyIncluded.baseBudget,
    );
    expect(alreadyIncluded.externalUrbanism.addedToConsolidatedBudget).toBe(0);
    expect(
      alreadyIncluded.warnings.some(
        ({ code }) => code === "external-urbanism-already-included",
      ),
    ).toBe(true);
  });

  it("calcula indicadores por área construida, vendible y vivienda", () => {
    const estimate = estimateDefault("scenario-2");

    expect(estimate.indicators.constructedArea).toBe(53_285.94000000001);
    expect(estimate.indicators.sellableArea).toBe(35_534.239736238276);
    expect(estimate.indicators.housingUnits).toBe(1_008);
    expect(estimate.indicators.costPerSellableM2).toBe(
      4_430_032.549541843,
    );
    expect(estimate.indicators.costPerHousingUnit).toBeCloseTo(
      156_168_490.7289273,
      7,
    );
    expect(estimate.indicators.parkingCostPerSpace).toBeNull();
    expect(
      estimate.warnings.some(
        ({ code }) => code === "parking-spaces-missing",
      ),
    ).toBe(true);
  });

  it("altera solo parqueaderos, A&G y totales cuando solo cambia esa área", () => {
    const originalInput = getDefaultScenario("scenario-2");
    const changedInput = getDefaultScenario("scenario-2");
    changedInput.areas.parkingBuilt += 100;

    const original = estimateScenario(
      originalInput,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );
    const changed = estimateScenario(
      changedInput,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );
    const originalParking = line(original, "parking-building");
    const changedParking = line(changed, "parking-building");
    const parkingDelta = changedParking.amount - originalParking.amount;

    expect(parkingDelta).toBeCloseTo(
      100 * 2_354_659.3720273897,
      5,
    );
    expect(changed.administrationAndGeneral.amount - original.administrationAndGeneral.amount).toBeCloseTo(
      parkingDelta * 0.11,
      5,
    );
    expect(changed.baseBudget - original.baseBudget).toBeCloseTo(
      parkingDelta * 1.11,
      3,
    );

    for (const chapter of [
      "vis-towers",
      "non-vis-towers",
      "common-areas",
      "internal-urbanism",
      "preliminaries",
    ] as const) {
      expect(line(changed, chapter).amount).toBe(line(original, chapter).amount);
    }
    expect(
      changed.warnings.some(({ code }) => code === "area-mismatch"),
    ).toBe(true);
  });

  it("hace A&G configurable y lo aplica una sola vez al subtotal directo", () => {
    const scenario = getDefaultScenario("scenario-3");
    const withoutAdministration = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      { ...DEFAULT_ESTIMATE_CONFIG, administrationRate: 0 },
    );
    const withAdministration = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      { ...DEFAULT_ESTIMATE_CONFIG, administrationRate: 0.12 },
    );

    expect(withoutAdministration.administrationAndGeneral.amount).toBe(0);
    expect(withoutAdministration.baseBudget).toBe(
      withoutAdministration.directCostSubtotal,
    );
    expect(withAdministration.administrationAndGeneral.amount).toBe(
      withAdministration.directCostSubtotal * 0.12,
    );
    expect(withAdministration.baseBudget).toBe(
      withAdministration.directCostSubtotal * 1.12,
    );
  });

  it("devuelve null y advertencias en vez de NaN/Infinity si faltan denominadores", () => {
    const scenario = getDefaultScenario("scenario-2");
    scenario.areas.sellableVis = undefined;
    scenario.areas.sellableNonVis = undefined;
    scenario.housingUnits.vis = 0;
    scenario.housingUnits.nonVis = 0;

    const estimate = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );

    expect(estimate.indicators.costPerSellableM2).toBeNull();
    expect(estimate.indicators.costPerHousingUnit).toBeNull();
    expect(
      estimate.warnings.some(({ code }) => code === "sellable-area-missing"),
    ).toBe(true);
    expect(
      estimate.warnings.some(({ code }) => code === "housing-units-missing"),
    ).toBe(true);
  });

  it("avisa cuando un comparable no corresponde al tipo de proyecto", () => {
    const incompatibleReferences: CostReference[] = DEFAULT_REFERENCES.map(
      (reference) =>
        reference.chapter === "vis-towers"
          ? {
              ...reference,
              context: { ...reference.context, assetClass: "office" },
            }
          : { ...reference, context: { ...reference.context } },
    );
    const estimate = estimateScenario(
      getDefaultScenario("scenario-2"),
      incompatibleReferences,
      DEFAULT_ESTIMATE_CONFIG,
    );

    expect(estimate.status).toBe("blocked");
    expect(
      estimate.warnings.some(
        ({ code, chapter }) =>
          code === "incompatible-reference" && chapter === "vis-towers",
      ),
    ).toBe(true);
  });

  it("es determinista y no modifica la entrada", () => {
    const scenario = getDefaultScenario("scenario-3");
    const snapshot = structuredClone(scenario) as ScenarioInput;

    const first = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );
    const second = estimateScenario(
      scenario,
      DEFAULT_REFERENCES,
      DEFAULT_ESTIMATE_CONFIG,
    );

    expect(first).toEqual(second);
    expect(scenario).toEqual(snapshot);
  });
});

describe("applyAdjustment", () => {
  it("aplica ajustes absolutos y porcentuales de forma explícita", () => {
    expect(
      applyAdjustment(100, {
        kind: "absolute",
        value: 25,
        label: "prueba",
        reason: "prueba",
      }),
    ).toBe(125);
    expect(
      applyAdjustment(100, {
        kind: "percentage",
        value: 0.05,
        label: "prueba",
        reason: "prueba",
      }),
    ).toBe(105);
  });
});

const BUDGET_SHEET = "Ppto ";
