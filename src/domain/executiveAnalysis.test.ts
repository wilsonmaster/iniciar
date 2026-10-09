import { describe, expect, it } from "vitest";
import type { BudgetDraft } from "./budget";
import { calculateBudget } from "./budget";
import {
  analyzeCalculatedBudget,
  analyzeHistoricalProject,
} from "./executiveAnalysis";
import type { CostIndicator } from "./types";

function indicator(
  id: string,
  overrides: Partial<CostIndicator> = {},
): CostIndicator {
  return {
    id,
    groupId: "arbore-2026",
    groupLabel: "INDICADORES ARBORE-2026",
    project: "Arbore",
    projectType: "residential-tower",
    baseYear: 2026,
    concept: `Indicador ${id}`,
    originalUnit: "m2",
    historicalAmount: 100_000_000,
    basisQuantity: 100,
    unitRate: 1_000_000,
    adjustmentPerUnit: 0,
    finalRate: 1_000_000,
    usage: "selectable",
    compatibleChapters: ["non-vis-towers"],
    context: { assetClass: "residential" },
    source: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "H19",
    },
    amountSource: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "D19",
    },
    quantitySource: {
      workbook: "INDICADORES.xlsx",
      sheet: "Indicadores costos",
      cell: "E19",
    },
    ...overrides,
  };
}

describe("analyzeCalculatedBudget", () => {
  it("produce métricas, composición y comparación deterministas", () => {
    const catalog = [
      indicator("torres", { finalRate: 2_000_000, concept: "TORRES" }),
      indicator("urbanismo", {
        finalRate: 500_000,
        concept: "URBANISMO INTERNO",
      }),
    ];
    const draft: BudgetDraft = {
      id: "parque-175",
      name: "Parque 175",
      baseProjectId: "arbore",
      areaM2: 200,
      lines: [
        {
          id: "linea-torres",
          indicatorId: "torres",
          quantity: 100,
          adjustmentPerUnit: 100_000,
        },
        {
          id: "linea-urbanismo",
          indicatorId: "urbanismo",
          quantity: 50,
          adjustmentPerUnit: 0,
        },
      ],
    };
    const calculated = calculateBudget(draft, catalog);

    const first = analyzeCalculatedBudget(draft, calculated, catalog);
    const second = analyzeCalculatedBudget(draft, calculated, catalog);

    expect(first).toEqual(second);
    expect(first.status).toBe("ready");
    expect(first.kind).toBe("active-budget");
    expect(first.metrics).toMatchObject({
      totalAmount: 235_000_000,
      referenceBaseAmount: 225_000_000,
      adjustmentAmount: 10_000_000,
      areaM2: 200,
      costPerM2: 1_175_000,
      lineCount: 2,
      pricedLineCount: 2,
      referenceProjectCount: 1,
    });
    expect(first.metrics.adjustmentRate).toBeCloseTo(10 / 225);
    expect(first.composition[0]).toMatchObject({
      label: "TORRES",
      referenceProject: "Arbore",
      referenceAmount: 200_000_000,
      adjustmentAmount: 10_000_000,
      amount: 210_000_000,
    });
    expect(first.composition[0]?.share).toBeCloseTo(210 / 235);
    expect(first.comparisons[0]).toMatchObject({
      referenceRate: 2_000_000,
      evaluatedRate: 2_100_000,
      differencePerUnit: 100_000,
      differenceRate: 0.05,
    });
    expect(first.summary).toContain("1.175.000");
    expect(first.methodologyNote).toContain("determinístico");
  });

  it("advierte concentración, ajustes altos, mezcla y usos no seleccionables", () => {
    const catalog = [
      indicator("torres", {
        concept: "TORRES",
        finalRate: 1_000_000,
      }),
      indicator("zonas", {
        project: "Rocca",
        concept: "ZONAS COMUNES",
        finalRate: 500_000,
        usage: "partial",
      }),
    ];
    const draft: BudgetDraft = {
      id: "mixto",
      name: "Proyecto mixto",
      baseProjectId: "arbore",
      areaM2: 1_000,
      lines: [
        {
          id: "principal",
          indicatorId: "torres",
          quantity: 100,
          adjustmentPerUnit: 200_000,
        },
        {
          id: "secundaria",
          indicatorId: "zonas",
          quantity: 10,
          adjustmentPerUnit: 0,
        },
      ],
    };

    const report = analyzeCalculatedBudget(
      draft,
      calculateBudget(draft, catalog),
      catalog,
    );

    expect(report.metrics.highAdjustmentLineCount).toBe(1);
    expect(report.metrics.nonSelectableLineCount).toBe(1);
    expect(report.metrics.referenceProjectCount).toBe(2);
    expect(report.reviewPoints.join(" ")).toMatch(/Concentración/i);
    expect(report.reviewPoints.join(" ")).toMatch(/ajuste alto/i);
    expect(report.reviewPoints.join(" ")).toMatch(/no clasificado/i);
    expect(report.reviewPoints.join(" ")).toMatch(/mezcla indicadores/i);
    expect(report.recommendations.join(" ")).toMatch(/cotizaciones/i);
  });

  it("no infiere área y cubre las validaciones propias del contexto colombiano", () => {
    const catalog = [indicator("torres")];
    const draft: BudgetDraft = {
      id: "sin-area",
      name: "Sin área",
      baseProjectId: "arbore",
      lines: [
        {
          id: "linea",
          indicatorId: "torres",
          quantity: 100,
          adjustmentPerUnit: 0,
        },
      ],
    };

    const report = analyzeCalculatedBudget(
      draft,
      calculateBudget(draft, catalog),
      catalog,
    );
    const allText = [
      ...report.recommendations,
      ...report.clarifications,
      ...report.reviewPoints,
    ].join(" ");

    expect(report.metrics.areaM2).toBeNull();
    expect(report.metrics.costPerM2).toBeNull();
    expect(report.summary).toMatch(/falta un área total/i);
    expect(allText).toMatch(/DANE/i);
    expect(allText).toMatch(/ICOCED/i);
    expect(allText).toMatch(/no consulta.+tiempo real/i);
    expect(allText).toMatch(/Ubicación/i);
    expect(allText).toMatch(/Suelo/i);
    expect(allText).toMatch(/Licencias/i);
    expect(allText).toMatch(/Impuestos/i);
    expect(allText).toMatch(/Contingencias/i);
  });

  it("expone incidencias de cálculo sin convertirlas en valores no finitos", () => {
    const draft: BudgetDraft = {
      id: "incompleto",
      name: "Incompleto",
      baseProjectId: "arbore",
      lines: [
        {
          id: "perdida",
          indicatorId: "no-existe",
          quantity: 100,
          adjustmentPerUnit: 0,
        },
      ],
    };
    const calculated = calculateBudget(draft, []);

    const report = analyzeCalculatedBudget(draft, calculated, []);

    expect(report.metrics.totalAmount).toBe(0);
    expect(report.composition[0]).toMatchObject({
      usage: "missing",
      amount: 0,
      hasCalculationIssues: true,
    });
    expect(report.reviewPoints.join(" ")).toMatch(/incidencia de cálculo/i);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });

  it("ignora líneas sin cuantificar al evaluar mezcla y ajustes de impacto", () => {
    const catalog = [
      indicator("torres", { project: "Arbore" }),
      indicator("otro", {
        project: "Rocca",
        usage: "partial",
      }),
    ];
    const draft: BudgetDraft = {
      id: "ceros",
      name: "Líneas pendientes",
      baseProjectId: "arbore",
      areaM2: 100,
      lines: [
        {
          id: "cuantificada",
          indicatorId: "torres",
          quantity: 10,
          adjustmentPerUnit: 0,
        },
        {
          id: "sin-cuantificar",
          indicatorId: "otro",
          quantity: 0,
          adjustmentPerUnit: 500_000,
        },
      ],
    };

    const report = analyzeCalculatedBudget(
      draft,
      calculateBudget(draft, catalog),
      catalog,
    );

    expect(report.metrics.referenceProjectCount).toBe(1);
    expect(report.metrics.highAdjustmentLineCount).toBe(0);
    expect(report.metrics.nonSelectableLineCount).toBe(0);
    expect(report.reviewPoints.join(" ")).not.toMatch(/mezcla indicadores/i);
  });
});

describe("analyzeHistoricalProject", () => {
  it("excluye desgloses parciales para no duplicar el rollup histórico", () => {
    const catalog = [
      indicator("torres", {
        historicalAmount: 200_000_000,
        concept: "TORRES",
      }),
      indicator("estructura", {
        historicalAmount: 120_000_000,
        concept: "TORRE ESTRUCTURA",
        usage: "partial",
      }),
      indicator("administracion", {
        historicalAmount: 20_000_000,
        concept: "ADMON Y GG",
        usage: "administration",
        originalUnit: "mes",
      }),
    ];

    const report = analyzeHistoricalProject("arbore", catalog);

    expect(report.kind).toBe("historical-project");
    expect(report.subjectName).toBe("Arbore");
    expect(report.metrics.totalAmount).toBe(220_000_000);
    expect(report.metrics.lineCount).toBe(2);
    expect(report.composition.map(({ indicatorId }) => indicatorId)).toEqual([
      "torres",
      "administracion",
    ]);
    expect(report.clarifications.join(" ")).toMatch(/excluyeron 1 renglón parcial/i);
    expect(report.clarifications.join(" ")).toMatch(/escala de los valores/i);
    expect(report.metrics.areaM2).toBeNull();
    expect(report.reviewPoints.join(" ")).toMatch(/no se infirió un área total/i);
  });

  it("devuelve un reporte seguro cuando el proyecto no existe", () => {
    const report = analyzeHistoricalProject("desconocido", [indicator("torres")]);

    expect(report.metrics.totalAmount).toBe(0);
    expect(report.composition).toEqual([]);
    expect(report.reviewPoints.join(" ")).toMatch(/No se encontraron indicadores/i);
    expect(report.summary).toMatch(/No hay información histórica utilizable/i);
  });
});
