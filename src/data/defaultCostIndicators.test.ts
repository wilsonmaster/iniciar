import { describe, expect, it } from "vitest";
import type { CostIndicator, ProjectType } from "../domain/types";
import { DEFAULT_COST_INDICATORS } from "./defaultCostIndicators";

const EXPECTED_PROJECT_TYPES: Record<string, ProjectType> = {
  Serraclara: "residential-tower",
  Arbore: "residential-tower",
  Rocca: "residential-tower",
  "Oficinas Rocca": "office",
  "Externo Casas": "houses",
  "Oficinas T6": "office",
  "Pinar VIS": "residential-tower",
};

function findIndicator(id: string): CostIndicator {
  const indicator = DEFAULT_COST_INDICATORS.find((entry) => entry.id === id);
  expect(indicator, `No se encontro el indicador ${id}`).toBeDefined();
  return indicator as CostIndicator;
}

describe("DEFAULT_COST_INDICATORS", () => {
  it("incluye las 45 filas de los 10 grupos y los 7 proyectos esperados", () => {
    expect(DEFAULT_COST_INDICATORS).toHaveLength(45);
    expect(new Set(DEFAULT_COST_INDICATORS.map(({ groupId }) => groupId))).toHaveLength(10);
    expect(new Set(DEFAULT_COST_INDICATORS.map(({ project }) => project))).toEqual(
      new Set(Object.keys(EXPECTED_PROJECT_TYPES)),
    );

    for (const indicator of DEFAULT_COST_INDICATORS) {
      expect(indicator.projectType).toBe(EXPECTED_PROJECT_TYPES[indicator.project]);
    }
  });

  it("clasifica todas las filas por uso y conserva sus unidades originales", () => {
    const usageCounts = Object.fromEntries(
      ["selectable", "partial", "administration", "unmapped"].map((usage) => [
        usage,
        DEFAULT_COST_INDICATORS.filter((indicator) => indicator.usage === usage).length,
      ]),
    );
    const unitCounts = Object.fromEntries(
      ["m2", "mes"].map((unit) => [
        unit,
        DEFAULT_COST_INDICATORS.filter(
          (indicator) => indicator.originalUnit.trim().toLowerCase() === unit,
        ).length,
      ]),
    );

    expect(usageCounts).toEqual({
      selectable: 31,
      partial: 6,
      administration: 6,
      unmapped: 2,
    });
    expect(unitCounts).toEqual({ m2: 39, mes: 6 });
  });

  it("usa IDs unicos, calcula la tarifa final y mantiene la trazabilidad D/E/H", () => {
    const ids = DEFAULT_COST_INDICATORS.map(({ id }) => id);
    expect(new Set(ids)).toHaveLength(DEFAULT_COST_INDICATORS.length);

    for (const indicator of DEFAULT_COST_INDICATORS) {
      const row = indicator.id.match(/-r(\d+)$/)?.[1];
      expect(row, `ID sin fila de origen: ${indicator.id}`).toBeDefined();
      expect(indicator.finalRate).toBe(
        indicator.unitRate + indicator.adjustmentPerUnit,
      );

      expect(indicator.source).toMatchObject({
        workbook: "INDICADORES.xlsx",
        sheet: "Indicadores costos",
        cell: `H${row}`,
        formula: `=+F${row}+G${row}`,
        cachedValue: indicator.unitRate,
      });
      expect(indicator.amountSource).toMatchObject({
        workbook: "INDICADORES.xlsx",
        sheet: "Indicadores costos",
        cell: `D${row}`,
      });
      expect(indicator.quantitySource).toMatchObject({
        workbook: "INDICADORES.xlsx",
        sheet: "Indicadores costos",
        cell: `E${row}`,
      });
    }
  });

  it("conserva las tarifas clave de Pinar, Arbore, Oficinas T6 y Casas", () => {
    expect(findIndicator("pinar-vis-2026-r70")).toMatchObject({
      project: "Pinar VIS",
      concept: "TORRES VIS- 13 PISOS",
      unitRate: 2_161_403.829541057,
      finalRate: 2_161_403.829541057,
      source: {
        workbook: "INDICADORES.xlsx",
        sheet: "Indicadores costos",
        cell: "H70",
        formula: "=+F70+G70",
        cachedValue: 2_161_403.829541057,
      },
    });

    expect(findIndicator("arbore-2026-r19")).toMatchObject({
      project: "Arbore",
      concept: "TORRES",
      unitRate: 2_721_262.4202324734,
      finalRate: 2_721_262.4202324734,
      source: {
        cell: "H19",
        formula: "=+F19+G19",
        cachedValue: 2_721_262.4202324734,
      },
    });

    expect(findIndicator("oficinas-t6-2026-r60")).toMatchObject({
      project: "Oficinas T6",
      concept: "OFICINAS + COMERCIO 16 PISOS- SIN ACABADOS",
      unitRate: 4_202_894.516929457,
      source: { cell: "H60" },
    });

    expect(findIndicator("externo-casas-2026-r52")).toMatchObject({
      project: "Externo Casas",
      concept: "CASAS ",
      unitRate: 3_139_789.9799344367,
      source: { cell: "H52" },
    });
  });
});
