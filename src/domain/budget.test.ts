import { describe, expect, it } from "vitest";
import type { CostIndicator } from "./types";
import {
  calculateBudget,
  createBudgetDraftFromProject,
  snapshotBudgetIndicator,
  type BudgetDraft,
} from "./budget";

function indicator(
  id: string,
  overrides: Partial<CostIndicator> = {},
): CostIndicator {
  return {
    id,
    groupId: "serraclara-2026",
    groupLabel: "INDICADORES SERRACLARA-2026",
    project: "Serraclara",
    projectType: "residential-tower",
    baseYear: 2026,
    concept: `Indicador ${id}`,
    originalUnit: "m2",
    historicalAmount: 10_000_000,
    basisQuantity: 10,
    unitRate: 1_000_000,
    adjustmentPerUnit: 25_000,
    finalRate: 1_025_000,
    usage: "selectable",
    compatibleChapters: ["common-areas"],
    context: { assetClass: "residential" },
    source: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "H4",
    },
    amountSource: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "D4",
    },
    quantitySource: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "E4",
    },
    ...overrides,
  };
}

describe("createBudgetDraftFromProject", () => {
  it("incluye solo filas seleccionables del proyecto y comienza cantidades en cero", () => {
    const catalog = [
      indicator("preliminares", { basisQuantity: 12_096 }),
      indicator("torre", { basisQuantity: 56_007 }),
      indicator("estructura-parcial", { usage: "partial" }),
      indicator("administracion", {
        usage: "administration",
        originalUnit: "mes",
      }),
      indicator("otro-proyecto", { project: "Rocca" }),
    ];

    const draft = createBudgetDraftFromProject(
      {
        id: "presupuesto-1",
        name: "Nuevo presupuesto",
        baseProjectId: "serraclara",
      },
      catalog,
    );

    expect(draft).toEqual({
      id: "presupuesto-1",
      name: "Nuevo presupuesto",
      baseProjectId: "serraclara",
      lines: [
        {
          id: "presupuesto-1:indicator:preliminares",
          indicatorId: "preliminares",
          indicatorSnapshot: snapshotBudgetIndicator(catalog[0]),
          quantity: 0,
          adjustmentPerUnit: 0,
        },
        {
          id: "presupuesto-1:indicator:torre",
          indicatorId: "torre",
          indicatorSnapshot: snapshotBudgetIndicator(catalog[1]),
          quantity: 0,
          adjustmentPerUnit: 0,
        },
      ],
    });
    expect(catalog[0].basisQuantity).toBe(12_096);
  });

  it("acepta como clave la etiqueta del proyecto con espacios y mayúsculas", () => {
    const draft = createBudgetDraftFromProject(
      {
        id: "p-2",
        name: "Oficinas",
        baseProjectId: "  OFICINAS ROCCA ",
      },
      [indicator("oficina", { project: "Oficinas Rocca" })],
    );

    expect(draft.lines.map(({ indicatorId }) => indicatorId)).toEqual([
      "oficina",
    ]);
  });

  it("resuelve Urbanismo Casas contra el nombre histórico Externo Casas", () => {
    const draft = createBudgetDraftFromProject(
      {
        id: "p-casas",
        name: "Presupuesto de casas",
        baseProjectId: "urbanismo-casas",
      },
      [indicator("casas", { project: "Externo Casas" })],
    );

    expect(draft.lines.map(({ indicatorId }) => indicatorId)).toEqual([
      "casas",
    ]);
  });
});

describe("calculateBudget", () => {
  it("usa finalRate como tarifa base, aplica el ajuste y suma las líneas", () => {
    const catalog = [
      indicator("torre", { finalRate: 2_000_000 }),
      indicator("urbanismo", { finalRate: 500_000 }),
    ];
    const draft: BudgetDraft = {
      id: "p-1",
      name: "Cabida A",
      baseProjectId: "Serraclara",
      lines: [
        {
          id: "linea-1",
          indicatorId: "torre",
          quantity: 100,
          adjustmentPerUnit: 50_000,
        },
        {
          id: "linea-2",
          indicatorId: "urbanismo",
          quantity: 20,
          adjustmentPerUnit: -25_000,
        },
      ],
    };

    const result = calculateBudget(draft, catalog);

    expect(result.lines[0]).toMatchObject({
      baseRate: 2_000_000,
      finalRate: 2_050_000,
      amount: 205_000_000,
      issues: [],
    });
    expect(result.lines[1]).toMatchObject({
      baseRate: 500_000,
      finalRate: 475_000,
      amount: 9_500_000,
      issues: [],
    });
    expect(result.total).toBe(214_500_000);
    expect(result.status).toBe("complete");
    expect(result.issues).toEqual([]);
  });

  it("reporta un indicador ausente y conserva valores de salida seguros", () => {
    const draft: BudgetDraft = {
      id: "p-1",
      name: "Cabida A",
      baseProjectId: "Serraclara",
      lines: [
        {
          id: "linea-perdida",
          indicatorId: "ya-no-existe",
          quantity: 80,
          adjustmentPerUnit: 10,
        },
      ],
    };

    const result = calculateBudget(draft, []);

    expect(result.lines[0]).toMatchObject({
      indicator: null,
      quantity: 80,
      baseRate: null,
      finalRate: null,
      amount: 0,
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "missing-indicator",
        lineId: "linea-perdida",
        indicatorId: "ya-no-existe",
      }),
    ]);
    expect(result.total).toBe(0);
    expect(result.status).toBe("needs-review");
  });

  it("conserva la tarifa seleccionada mediante el snapshot aunque cambie o falte el catálogo", () => {
    const selected = indicator("indicador-importado", {
      project: "Arbore",
      finalRate: 2_345_678,
    });
    const draft: BudgetDraft = {
      id: "p-importado",
      name: "Presupuesto importado",
      baseProjectId: "arbore",
      lines: [
        {
          id: "linea-importada",
          indicatorId: selected.id,
          indicatorSnapshot: snapshotBudgetIndicator(selected),
          quantity: 10,
          adjustmentPerUnit: 100,
        },
      ],
    };

    const missingCatalog = calculateBudget(draft, []);
    const changedCatalog = calculateBudget(draft, [
      indicator("indicador-importado", { finalRate: 1 }),
    ]);

    expect(missingCatalog.lines[0]).toMatchObject({
      baseRate: 2_345_678,
      finalRate: 2_345_778,
      amount: 23_457_780,
      issues: [],
    });
    expect(changedCatalog.total).toBe(23_457_780);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "normaliza una cantidad inválida (%s) a cero sin producir NaN",
    (quantity) => {
      const draft: BudgetDraft = {
        id: "p-1",
        name: "Cabida A",
        baseProjectId: "Serraclara",
        lines: [
          {
            id: "linea-1",
            indicatorId: "torre",
            quantity,
            adjustmentPerUnit: 0,
          },
        ],
      };

      const result = calculateBudget(draft, [indicator("torre")]);

      expect(result.lines[0].quantity).toBe(0);
      expect(result.lines[0].amount).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
      expect(result.issues).toEqual([
        expect.objectContaining({ code: "invalid-quantity" }),
      ]);
    },
  );

  it("bloquea tarifas finales negativas y desbordamientos en vez de devolver Infinity", () => {
    const draft: BudgetDraft = {
      id: "p-1",
      name: "Cabida A",
      baseProjectId: "Serraclara",
      lines: [
        {
          id: "linea-negativa",
          indicatorId: "torre",
          quantity: 5,
          adjustmentPerUnit: -1_100_000,
        },
        {
          id: "linea-desbordada",
          indicatorId: "enorme",
          quantity: Number.MAX_VALUE,
          adjustmentPerUnit: 0,
        },
      ],
    };

    const result = calculateBudget(draft, [
      indicator("torre", { finalRate: 1_000_000 }),
      indicator("enorme", { finalRate: 2 }),
    ]);

    expect(result.lines.map(({ amount }) => amount)).toEqual([0, 0]);
    expect(result.lines.every(({ amount }) => Number.isFinite(amount))).toBe(
      true,
    );
    expect(result.issues.map(({ code }) => code)).toEqual([
      "invalid-final-rate",
      "invalid-amount",
    ]);
  });

  it("no muta el borrador ni los indicadores al calcular", () => {
    const catalog = [indicator("torre")];
    const draft: BudgetDraft = {
      id: "p-1",
      name: "Cabida A",
      baseProjectId: "Serraclara",
      lines: [
        {
          id: "linea-1",
          indicatorId: "torre",
          quantity: 2,
          adjustmentPerUnit: 0,
        },
      ],
    };
    const draftBefore = structuredClone(draft);
    const catalogBefore = structuredClone(catalog);

    calculateBudget(draft, catalog);

    expect(draft).toEqual(draftBefore);
    expect(catalog).toEqual(catalogBefore);
  });
});
