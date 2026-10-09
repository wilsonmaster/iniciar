// @vitest-environment jsdom

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_WORKSHEET_NAMES,
  getXlsxCell,
  getXlsxValue,
  parseXlsxWorkbook,
  XlsxParseError,
} from "./xlsxParser";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function sheetXml(cells: string): string {
  return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><sheetData><row r="1">${cells}</row></sheetData></worksheet>`;
}

function workbookBuffer(options?: {
  pptoName?: string;
}): ArrayBuffer {
  const names = [
    "Presentacion",
    options?.pptoName ?? "Ppto ",
    "Indicadores costos",
    "Hoja no autorizada",
  ];
  const ids = ["rPresentacion", "rPpto", "rIndicadores", "rIgnorada"];
  const sheetEntries = names
    .map(
      (name, index) =>
        `<sheet name="${name}" sheetId="${index + 1}" r:id="${ids[index]}"/>`,
    )
    .join("");
  const relationships = [
    ["rPresentacion", "worksheets/presentation.xml"],
    ["rPpto", "/xl/worksheets/budget.xml"],
    ["rIndicadores", "worksheets/catalog.xml"],
    // The target deliberately does not exist. A non-allowlisted sheet must not
    // be opened merely because it is declared in workbook.xml.
    ["rIgnorada", "worksheets/does-not-exist.xml"],
  ]
    .map(
      ([id, target]) =>
        `<Relationship Id="${id}" Type="${REL_NS}/worksheet" Target="${target}"/>`,
    )
    .join("");

  const archive = zipSync({
    "xl/workbook.xml": strToU8(
      `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheetEntries}</sheets><definedNames><definedName name="debe_ignorarse">#REF!</definedName></definedNames></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">${relationships}</Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `${XML_HEADER}<sst xmlns="${MAIN_NS}"><si><t>ESCENARIO 2</t></si><si><r><t>Indicador </t></r><r><t>rico</t></r></si></sst>`,
    ),
    "xl/worksheets/presentation.xml": strToU8(
      sheetXml('<c r="A1" t="inlineStr"><is><t>Presentacion</t></is></c>'),
    ),
    "xl/worksheets/budget.xml": strToU8(
      sheetXml(
        '<c r="B1" t="s"><v>0</v></c><c r="C1"><f>1+1</f><v>2</v></c><c r="D1" t="b"><v>1</v></c>',
      ),
    ),
    "xl/worksheets/catalog.xml": strToU8(
      sheetXml('<c r="H1" t="s"><v>1</v></c>'),
    ),
  });

  return asArrayBuffer(archive);
}

describe("parseXlsxWorkbook", () => {
  it("follows workbook relationships and only reads the exact allowlist", () => {
    const workbook = parseXlsxWorkbook(workbookBuffer());

    expect([...workbook.sheets.keys()].sort()).toEqual(
      [...ALLOWED_WORKSHEET_NAMES].sort(),
    );
    expect(getXlsxValue(workbook, "Ppto ", "B1")).toBe("ESCENARIO 2");
    expect(getXlsxValue(workbook, "Indicadores costos", "H1")).toBe(
      "Indicador rico",
    );
    expect(getXlsxValue(workbook, "Presentacion", "A1")).toBe(
      "Presentacion",
    );
  });

  it("keeps formulas and their cached values without evaluating them", () => {
    const workbook = parseXlsxWorkbook(workbookBuffer());

    expect(getXlsxCell(workbook, "Ppto ", "C1")).toMatchObject({
      reference: "C1",
      formula: "1+1",
      value: 2,
      hasCachedValue: true,
    });
    expect(getXlsxValue(workbook, "Ppto ", "D1")).toBe(true);
  });

  it("requires the trailing space in the Ppto sheet name", () => {
    expect(() => parseXlsxWorkbook(workbookBuffer({ pptoName: "Ppto" }))).toThrow(
      /"Ppto "/,
    );
  });

  it("reports invalid ZIP input with a domain-specific error", () => {
    expect(() => parseXlsxWorkbook(new Uint8Array([1, 2, 3]).buffer)).toThrow(
      XlsxParseError,
    );
  });
});
