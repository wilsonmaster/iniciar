// @vitest-environment jsdom

import { strToU8, zipSync } from "fflate";
import { DEFAULT_COST_INDICATORS } from "../data/defaultCostIndicators";
import {
  AREA_BUDGET_HEADERS,
  AREA_BUDGET_SHEET_NAME,
  createAreaBudgetTemplate,
  importAreaBudgetWorkbook,
} from "./areaBudgetWorkbook";
import { getXlsxValue, parseXlsxSheets } from "./xlsxParser";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number): string {
  return `<c r="${reference}"><v>${value}</v></c>`;
}

function formulaCell(
  reference: string,
  formula: string,
  cachedValue: number,
): string {
  return `<c r="${reference}"><f>${escapeXml(formula)}</f><v>${cachedValue}</v></c>`;
}

function workbookBuffer(options?: {
  sheetName?: string;
  headers?: readonly string[];
  rows?: readonly string[];
}): ArrayBuffer {
  const sheetName = options?.sheetName ?? AREA_BUDGET_SHEET_NAME;
  const headers = options?.headers ?? AREA_BUDGET_HEADERS;
  const headerCells = headers
    .map((header, index) =>
      textCell(`${String.fromCharCode(65 + index)}1`, header),
    )
    .join("");
  const rows = (options?.rows ?? [])
    .map((cells, index) => `<row r="${index + 2}">${cells}</row>`)
    .join("");
  const worksheet = `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><sheetData><row r="1">${headerCells}</row>${rows}</sheetData></worksheet>`;
  const archive = zipSync({
    "xl/workbook.xml": strToU8(
      `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rAreas"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rAreas" Type="${REL_NS}/worksheet" Target="worksheets/areas.xml"/></Relationships>`,
    ),
    "xl/worksheets/areas.xml": strToU8(worksheet),
  });
  return asArrayBuffer(archive);
}

describe("importAreaBudgetWorkbook", () => {
  it("matches catalogue rows, computes amounts and accepts the Casas display alias", () => {
    const pinar = DEFAULT_COST_INDICATORS.find(
      (indicator) =>
        indicator.project === "Pinar VIS" &&
        indicator.concept === "TORRES VIS- 13 PISOS",
    )!;
    const casas = DEFAULT_COST_INDICATORS.find(
      (indicator) =>
        indicator.project === "Externo Casas" &&
        indicator.concept.trim() === "URBANISMO INTERNO",
    )!;
    const buffer = workbookBuffer({
      rows: [
        [
          textCell("A2", "Pinar VIS"),
          textCell("B2", "TORRES VIS- 13 PISOS"),
          numberCell("C2", 100),
          numberCell("D2", 50),
        ].join(""),
        [
          textCell("A3", "Urbanismo Casas"),
          textCell("B3", " urbanismo interno "),
          numberCell("C3", 200),
        ].join(""),
      ],
    });

    const result = importAreaBudgetWorkbook(
      buffer,
      DEFAULT_COST_INDICATORS,
      "mi-cuadro.xlsx",
    );

    expect(result.quality.status).toBe("validated");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      rowNumber: 2,
      indicator: { id: pinar.id },
      quantity: 100,
      adjustmentPerUnit: 50,
      catalogRate: pinar.finalRate,
      finalRate: pinar.finalRate + 50,
      amount: 100 * (pinar.finalRate + 50),
      sources: {
        project: { workbook: "mi-cuadro.xlsx", sheet: "Areas", cell: "A2" },
        indicator: { cell: "B2" },
        quantity: { cell: "C2" },
        adjustmentPerUnit: { cell: "D2" },
      },
    });
    expect(result.lines[1]).toMatchObject({
      indicator: { id: casas.id },
      quantity: 200,
      adjustmentPerUnit: 0,
      finalRate: casas.finalRate,
    });
    expect(result.lines[1].sources.adjustmentPerUnit.note).toMatch(/ajuste cero/i);
  });

  it("finds columns by normalized header instead of relying on their order", () => {
    const indicator = DEFAULT_COST_INDICATORS.find(
      (item) => item.project === "Arbore" && item.concept === "TORRES",
    )!;
    const result = importAreaBudgetWorkbook(
      workbookBuffer({
        headers: [
          "CANTIDAD",
          "ajuste unitario",
          "indicador",
          "proyecto referente",
        ],
        rows: [
          [
            numberCell("A2", 12.5),
            numberCell("B2", -100),
            textCell("C2", indicator.concept),
            textCell("D2", " arbore "),
          ].join(""),
        ],
      }),
      DEFAULT_COST_INDICATORS,
    );

    expect(result.quality.status).toBe("validated");
    expect(result.lines[0]).toMatchObject({
      indicator: { id: indicator.id },
      quantity: 12.5,
      adjustmentPerUnit: -100,
      finalRate: indicator.finalRate - 100,
    });
  });

  it("keeps non-selectable catalogue rows visible but marks them for review", () => {
    const partial = DEFAULT_COST_INDICATORS.find(
      (indicator) =>
        indicator.project === "Serraclara" && indicator.usage === "partial",
    )!;
    const result = importAreaBudgetWorkbook(
      workbookBuffer({
        rows: [
          [
            textCell("A2", partial.project),
            textCell("B2", partial.concept),
            numberCell("C2", 10),
            numberCell("D2", 0),
          ].join(""),
        ],
      }),
      DEFAULT_COST_INDICATORS,
    );

    expect(result.lines).toHaveLength(1);
    expect(result.quality.status).toBe("needs-review");
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "area-budget-indicator-needs-review",
        severity: "warning",
        cell: "B2",
      }),
    );
  });

  it("rejects unknown catalogue values, negative quantities and input formulas", () => {
    const result = importAreaBudgetWorkbook(
      workbookBuffer({
        rows: [
          [
            textCell("A2", "Proyecto inexistente"),
            textCell("B2", "TORRES"),
            numberCell("C2", 10),
            numberCell("D2", 0),
          ].join(""),
          [
            textCell("A3", "Arbore"),
            textCell("B3", "No existe"),
            numberCell("C3", 10),
            numberCell("D3", 0),
          ].join(""),
          [
            textCell("A4", "Arbore"),
            textCell("B4", "TORRES"),
            numberCell("C4", -1),
            numberCell("D4", 0),
          ].join(""),
          [
            textCell("A5", "Arbore"),
            textCell("B5", "TORRES"),
            formulaCell("C5", "5+5", 10),
            numberCell("D5", 0),
          ].join(""),
        ],
      }),
      DEFAULT_COST_INDICATORS,
    );

    expect(result.lines).toHaveLength(0);
    expect(result.quality.status).toBe("invalid");
    expect(result.quality.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "unknown-area-budget-project",
        "unknown-area-budget-indicator",
        "negative-area-budget-quantity",
        "area-budget-formula-not-allowed",
        "empty-area-budget",
      ]),
    );
  });

  it("reports duplicate lines so callers can block accidental double counting", () => {
    const row = [
      textCell("A2", "Arbore"),
      textCell("B2", "TORRES"),
      numberCell("C2", 10),
      numberCell("D2", 0),
    ].join("");
    const secondRow = row
      .replaceAll("A2", "A3")
      .replaceAll("B2", "B3")
      .replaceAll("C2", "C3")
      .replaceAll("D2", "D3");
    const result = importAreaBudgetWorkbook(
      workbookBuffer({ rows: [row, secondRow] }),
      DEFAULT_COST_INDICATORS,
    );

    expect(result.lines).toHaveLength(2);
    expect(result.quality.status).toBe("invalid");
    expect(result.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "duplicate-area-budget-indicator",
        severity: "error",
        cell: "B3",
      }),
    );
  });

  it("returns structured errors for a missing header or wrong sheet name", () => {
    const missingHeader = importAreaBudgetWorkbook(
      workbookBuffer({ headers: AREA_BUDGET_HEADERS.slice(0, 3) }),
      DEFAULT_COST_INDICATORS,
    );
    const wrongSheet = importAreaBudgetWorkbook(
      workbookBuffer({ sheetName: "Hoja1" }),
      DEFAULT_COST_INDICATORS,
    );

    expect(missingHeader.quality.status).toBe("invalid");
    expect(missingHeader.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "missing-area-budget-header",
        message: expect.stringMatching(/Ajuste unitario/),
      }),
    );
    expect(wrongSheet.lines).toHaveLength(0);
    expect(wrongSheet.quality.issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-area-budget-workbook",
        message: expect.stringMatching(/"Areas"/),
      }),
    );
  });

  it("generates a macro-free template readable by the same XLSX parser", () => {
    const bytes = createAreaBudgetTemplate(DEFAULT_COST_INDICATORS);
    const workbook = parseXlsxSheets(asArrayBuffer(bytes), [
      AREA_BUDGET_SHEET_NAME,
    ]);

    expect(getXlsxValue(workbook, AREA_BUDGET_SHEET_NAME, "A1")).toBe(
      "Proyecto referente",
    );
    expect(getXlsxValue(workbook, AREA_BUDGET_SHEET_NAME, "D1")).toBe(
      "Ajuste unitario",
    );
    expect(
      [...workbook.sheets.get(AREA_BUDGET_SHEET_NAME)!.cells.values()].some(
        (cell) => cell.value === "Urbanismo Casas",
      ),
    ).toBe(true);

    const blankImport = importAreaBudgetWorkbook(
      asArrayBuffer(bytes),
      DEFAULT_COST_INDICATORS,
    );
    expect(blankImport.lines).toHaveLength(0);
    expect(blankImport.quality.issues).toContainEqual(
      expect.objectContaining({ code: "empty-area-budget" }),
    );
  });
});
