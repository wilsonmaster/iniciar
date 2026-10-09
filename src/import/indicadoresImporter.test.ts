// @vitest-environment jsdom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importIndicadores } from "./indicadoresImporter";

const MAIN_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";

interface FixtureCell {
  value: string | number;
  formula?: string;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function worksheetXml(cells: Record<string, FixtureCell>): string {
  const rows = new Map<number, [string, FixtureCell][]>();
  for (const [reference, cell] of Object.entries(cells)) {
    const row = Number(reference.match(/\d+$/)?.[0]);
    const entries = rows.get(row) ?? [];
    entries.push([reference, cell]);
    rows.set(row, entries);
  }

  const body = [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([row, entries]) => {
      const cellXml = entries
        .map(([reference, cell]) => {
          if (typeof cell.value === "string") {
            return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(cell.value)}</t></is></c>`;
          }
          return `<c r="${reference}">${cell.formula ? `<f>${xmlEscape(cell.formula)}</f>` : ""}<v>${cell.value}</v></c>`;
        })
        .join("");
      return `<row r="${row}">${cellXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN_NS}"><sheetData>${body}</sheetData></worksheet>`;
}

function fixtureBuffer(options?: {
  scenario2VisAmount?: number;
  omitCatalogRate?: boolean;
  badSourceFormula?: boolean;
}): ArrayBuffer {
  const catalog: Record<string, FixtureCell> = {
    B65: { value: "INDICADORES PINAR VIS-2026\n13 PISOS" },
    B70: { value: "TORRES VIS- 13 PISOS" },
    C70: { value: "m2" },
    D70: { value: 100 },
    E70: { value: 10 },
    H70: { value: 10 },
    B19: { value: "TORRES" },
    C19: { value: "M2" },
    D19: { value: 200 },
    E19: { value: 10 },
    F19: { value: 20 },
    B68: { value: "EDIFICIO DE PARQUEADEROS (5 PISOS SIN SOTANO)" },
    C68: { value: "m2" },
    D68: { value: 300 },
    E68: { value: 10 },
    H68: { value: 30 },
    B69: { value: "ZONAS CUMUNES ULTIMO PISO ED PARQUEADEROS" },
    C69: { value: "m2" },
    D69: { value: 400 },
    E69: { value: 10 },
    F69: { value: 40 },
    B71: { value: "URBANISMO INTERNO" },
    C71: { value: "m2" },
    D71: { value: 500 },
    E71: { value: 10 },
    H71: { value: 50 },
    B67: { value: "PRELIMINARES" },
    C67: { value: "m2" },
    D67: { value: 600 },
    E67: { value: 10 },
    H67: { value: 60 },
  };
  if (options?.omitCatalogRate) delete catalog.H70;

  const budget: Record<string, FixtureCell> = {};
  const addScenario = (
    firstRow: number,
    administrationRow: number,
    totalRow: number,
    areaRow: number,
    costRow: number,
    areas: readonly number[],
    directAmounts: readonly number[],
    total: number,
  ): void => {
    budget[`B${firstRow === 4 ? 2 : 15}`] = {
      value: `ESCENARIO ${firstRow === 4 ? 2 : 3}`,
    };
    const chapterLabels = [
      "TORRES VIS",
      "TORRES NO VIS",
      "ED DE PARQUEADEROS",
      "COMUNALES",
      "URBANISMO ",
      "PRELIMINARES",
    ];
    const baseRates = [10, 20, 30, 40, 50, 60];
    const adjustments = [0, 0, 5, 0, 5, 0];
    const catalogRateCells = ["H70", "F19", "H68", "F69", "H71", "H67"];
    for (let index = 0; index < 6; index += 1) {
      const row = firstRow + index;
      budget[`B${row}`] = { value: chapterLabels[index] };
      budget[`E${row}`] = {
        value: baseRates[index],
        formula:
          firstRow === 4
            ? options?.badSourceFormula && index === 0
              ? "+'Indicadores costos'!H68"
              : `+'Indicadores costos'!${catalogRateCells[index]}`
            : `E${4 + index}`,
      };
      if (adjustments[index] !== 0) {
        budget[`F${row}`] = {
          value: adjustments[index],
          formula: index === 4 ? `E${row}*10%` : undefined,
        };
      }
      budget[`G${row}`] = {
        value: baseRates[index] + adjustments[index],
        formula: `E${row}+F${row}`,
      };
      budget[`H${row}`] = { value: areas[index] };
      budget[`I${row}`] = {
        value:
          index === 0 && firstRow === 4 && options?.scenario2VisAmount !== undefined
            ? options.scenario2VisAmount
            : directAmounts[index],
        formula: `G${row}*H${row}`,
      };
    }
    const direct = directAmounts.reduce((sum, value) => sum + value, 0);
    budget[`H${administrationRow}`] = { value: 0.11 };
    budget[`I${administrationRow}`] = {
      value: direct * 0.11,
      formula: `SUM(I${firstRow}:I${firstRow + 5})*H${administrationRow}`,
    };
    budget[`I${totalRow}`] = {
      value: total,
      formula: `SUM(I${firstRow}:I${administrationRow})`,
    };
    budget[`I${areaRow}`] = { value: 180 };
    budget[`I${costRow}`] = { value: total / 180, formula: `I${totalRow}/I${areaRow}` };
  };

  addScenario(4, 10, 11, 12, 13, [100, 50, 20, 10, 30, 180], [1000, 1000, 700, 400, 1650, 10800], 17260.5);
  addScenario(17, 23, 24, 25, 26, [80, 60, 30, 10, 30, 180], [800, 1200, 1050, 400, 1650, 10800], 17649);

  const presentation: Record<string, FixtureCell> = {
    D3: { value: "2 VIS Y 1 NO VIS\n3 APTOS\nOctubre 10 2026" },
    J3: { value: "4 VIS Y 2 NO VIS\n6 APTOS\nOctubre 10 2026" },
    D23: { value: 180 },
    D24: { value: 70 },
    D25: { value: 40 },
    J23: { value: 180 },
    J24: { value: 90 },
    J25: { value: 30 },
    F16: { value: 17260.5, formula: "+'Ppto '!I11" },
    L16: { value: 17649, formula: "+'Ppto '!I24" },
    F20: { value: 5000 },
    L20: { value: 5000 },
    J20: { value: 5 },
    K20: { value: 1000, formula: "L20/J20" },
  };

  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_REL_NS}"><sheets><sheet name="Presentacion" sheetId="1" r:id="r1"/><sheet name="Ppto " sheetId="2" r:id="r2"/><sheet name="Indicadores costos" sheetId="3" r:id="r3"/></sheets><definedNames><definedName name="ruido">#REF!</definedName></definedNames></workbook>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="r3" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/catalog.xml"/><Relationship Id="r1" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/presentation.xml"/><Relationship Id="r2" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/budget.xml"/></Relationships>`;
  const zipped = zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(relationships),
    "xl/worksheets/catalog.xml": strToU8(worksheetXml(catalog)),
    "xl/worksheets/budget.xml": strToU8(worksheetXml(budget)),
    "xl/worksheets/presentation.xml": strToU8(worksheetXml(presentation)),
  });

  return zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength,
  ) as ArrayBuffer;
}

describe("importIndicadores", () => {
  it("extracts both scenarios, their used references and traceable source data", () => {
    const result = importIndicadores(fixtureBuffer(), "fixture.xlsx");

    expect(result.workbook).not.toBeNull();
    expect(result.quality.status).toBe("needs-review");
    expect(result.quality.issues).not.toContainEqual(
      expect.objectContaining({ severity: "error" }),
    );
    expect(result.workbook?.metadata.currency).toBe("COP");
    expect(result.quality.issues).not.toContainEqual(
      expect.objectContaining({ code: "currency-assumed" }),
    );
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "external-urbanism-basis-missing",
        scenarioId: "scenario-2",
      }),
    );
    expect(result.workbook?.references).toHaveLength(7);
    expect(result.workbook?.costIndicators).toHaveLength(6);
    expect(result.workbook?.scenarios).toHaveLength(2);

    const scenario2 = result.workbook?.scenarios[0];
    expect(scenario2?.housingUnits).toEqual({ vis: 2, nonVis: 1 });
    expect(scenario2?.areas).toMatchObject({
      constructedTotal: 180,
      visBuilt: 100,
      nonVisBuilt: 50,
      parkingBuilt: 20,
      commonBuilt: 10,
      internalUrbanism: 30,
      sellableVis: 70,
      sellableNonVis: 40,
    });
    expect(scenario2?.adjustments["parking-building"]).toMatchObject({
      kind: "absolute",
      value: 5,
    });
    expect(scenario2?.adjustments["internal-urbanism"]).toMatchObject({
      kind: "percentage",
      value: 0.1,
    });
    expect(scenario2?.externalUrbanism).toMatchObject({
      amount: 5000,
      includedInBase: false,
      source: { sheet: "Presentacion", cell: "F20" },
    });
    expect(scenario2?.reportedResults?.baseBudget).toMatchObject({
      value: 17260.5,
      source: {
        sheet: "Ppto ",
        cell: "I11",
        formula: "SUM(I4:I10)",
        cachedValue: 17260.5,
      },
    });
    expect(result.workbook?.scenarios[1].housingUnits).toEqual({
      vis: 4,
      nonVis: 2,
    });
  });

  it("keeps a model but flags a cached line amount that does not reconcile", () => {
    const result = importIndicadores(
      fixtureBuffer({ scenario2VisAmount: 1001 }),
    );

    expect(result.workbook).not.toBeNull();
    expect(result.quality.status).toBe("invalid");
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "line-reconciliation-difference",
        scenarioId: "scenario-2",
        chapter: "vis-towers",
        sheet: "Ppto ",
        cell: "I4",
      }),
    );
  });

  it("does not claim provenance when a rate formula points elsewhere", () => {
    const result = importIndicadores(fixtureBuffer({ badSourceFormula: true }));

    expect(result.workbook).not.toBeNull();
    expect(result.quality.status).toBe("invalid");
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "reference-formula-mismatch",
        scenarioId: "scenario-2",
        chapter: "vis-towers",
        sheet: "Ppto ",
        cell: "E4",
      }),
    );
  });

  it("returns an invalid null result when a required source cell is missing", () => {
    const result = importIndicadores(fixtureBuffer({ omitCatalogRate: true }));

    expect(result.workbook).toBeNull();
    expect(result.quality.status).toBe("invalid");
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "missing-required-cell",
        sheet: "Indicadores costos",
        cell: "H70",
      }),
    );
  });
});
