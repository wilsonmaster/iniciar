import { strFromU8, unzipSync } from "fflate";

export const ALLOWED_WORKSHEET_NAMES = [
  "Indicadores costos",
  "Ppto ",
  "Presentacion",
] as const;

export type AllowedWorksheetName = (typeof ALLOWED_WORKSHEET_NAMES)[number];

export type XlsxCellValue = string | number | boolean | null;

export interface XlsxCell {
  /** A1-style reference, for example `H70`. */
  reference: string;
  /** Decoded cached value. Formula cells keep their cached value here. */
  value: XlsxCellValue;
  /** Formula text without the leading `=`, when the cell contains a formula. */
  formula?: string;
  /** Whether OOXML included a `<v>` cached result, including an empty result. */
  hasCachedValue: boolean;
  /** Original OOXML cell type (`s`, `str`, `inlineStr`, `b`, `e`, etc.). */
  dataType?: string;
}

export interface XlsxWorksheet {
  name: AllowedWorksheetName;
  /** Normalized path inside the XLSX archive. */
  path: string;
  cells: ReadonlyMap<string, XlsxCell>;
}

export interface ParsedXlsxWorkbook {
  sheets: ReadonlyMap<AllowedWorksheetName, XlsxWorksheet>;
}

const OFFICE_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WORKBOOK_PATH = "xl/workbook.xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";

const decoder = (bytes: Uint8Array): string => strFromU8(bytes);

export class XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxParseError";
  }
}

function parseXml(xml: string, source: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.getElementsByTagName("parsererror")[0];

  if (parserError) {
    throw new XlsxParseError(`XML invalido en ${source}.`);
  }

  return document;
}

function requiredArchiveText(
  archive: Record<string, Uint8Array>,
  path: string,
): string {
  const entry = archive[path];
  if (!entry) {
    throw new XlsxParseError(`Falta el archivo requerido ${path}.`);
  }

  return decoder(entry);
}

function elements(parent: ParentNode, localName: string): Element[] {
  return Array.from(
    (parent as Document | Element).getElementsByTagNameNS("*", localName),
  );
}

function firstElement(parent: ParentNode, localName: string): Element | undefined {
  return elements(parent, localName)[0];
}

/** Resolve a relationship target without allowing it to escape the archive root. */
function resolveArchivePath(baseDirectory: string, target: string): string {
  const normalizedTarget = target.replaceAll("\\", "/");
  const parts = normalizedTarget.startsWith("/")
    ? normalizedTarget.split("/")
    : `${baseDirectory}/${normalizedTarget}`.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) {
        throw new XlsxParseError(
          `La relacion apunta fuera del archivo: ${target}.`,
        );
      }
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

function spreadsheetStringText(item: Element): string {
  const text: string[] = [];
  for (const child of Array.from(item.children)) {
    if (child.localName === "t") {
      text.push(child.textContent ?? "");
    } else if (child.localName === "r") {
      const runText = Array.from(child.children).find(
        (runChild) => runChild.localName === "t",
      );
      if (runText) text.push(runText.textContent ?? "");
    }
    // Phonetic runs (`rPh`) are metadata, not part of the cell value.
  }
  return text.join("");
}

function parseSharedStrings(
  archive: Record<string, Uint8Array>,
): readonly string[] {
  const entry = archive["xl/sharedStrings.xml"];
  if (!entry) return [];

  const document = parseXml(decoder(entry), "xl/sharedStrings.xml");

  return elements(document, "si").map(spreadsheetStringText);
}

function parseNumber(value: string, reference: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new XlsxParseError(
      `La celda ${reference} contiene un numero no valido: ${value}.`,
    );
  }
  return number;
}

function decodeCellValue(
  cell: Element,
  reference: string,
  sharedStrings: readonly string[],
  cachedText: string | undefined,
): XlsxCellValue {
  const dataType = cell.getAttribute("t") ?? undefined;

  if (dataType === "inlineStr") {
    const inlineString = firstElement(cell, "is");
    return inlineString ? spreadsheetStringText(inlineString) : "";
  }

  if (cachedText === undefined || cachedText === "") return null;

  switch (dataType) {
    case "s": {
      const index = parseNumber(cachedText, reference);
      const sharedString = sharedStrings[index];
      if (!Number.isInteger(index) || sharedString === undefined) {
        throw new XlsxParseError(
          `La celda ${reference} referencia una cadena compartida inexistente.`,
        );
      }
      return sharedString;
    }
    case "b":
      if (cachedText === "1") return true;
      if (cachedText === "0") return false;
      throw new XlsxParseError(
        `La celda booleana ${reference} contiene ${cachedText}.`,
      );
    case "str":
    case "e":
    case "d":
      return cachedText;
    default:
      return parseNumber(cachedText, reference);
  }
}

function parseWorksheet(
  name: AllowedWorksheetName,
  path: string,
  xml: string,
  sharedStrings: readonly string[],
): XlsxWorksheet {
  const document = parseXml(xml, path);
  const cells = new Map<string, XlsxCell>();

  for (const cell of elements(document, "c")) {
    const reference = cell.getAttribute("r")?.toUpperCase();
    if (!reference || !/^[A-Z]+[1-9]\d*$/.test(reference)) {
      throw new XlsxParseError(`Referencia de celda invalida en ${name}.`);
    }

    const valueNode = firstElement(cell, "v");
    const cachedText = valueNode?.textContent ?? undefined;
    const formulaNode = firstElement(cell, "f");
    const formula = formulaNode ? (formulaNode.textContent ?? "") : undefined;
    const dataType = cell.getAttribute("t") ?? undefined;

    cells.set(reference, {
      reference,
      value: decodeCellValue(cell, reference, sharedStrings, cachedText),
      ...(formula !== undefined ? { formula } : {}),
      hasCachedValue: valueNode !== undefined,
      ...(dataType ? { dataType } : {}),
    });
  }

  return { name, path, cells };
}

function worksheetRelationships(
  archive: Record<string, Uint8Array>,
): ReadonlyMap<string, string> {
  const document = parseXml(
    requiredArchiveText(archive, WORKBOOK_RELS_PATH),
    WORKBOOK_RELS_PATH,
  );
  const relationships = new Map<string, string>();

  for (const relationship of elements(document, "Relationship")) {
    const type = relationship.getAttribute("Type") ?? "";
    if (!type.endsWith("/worksheet")) continue;

    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (id && target) {
      relationships.set(id, resolveArchivePath("xl", target));
    }
  }

  return relationships;
}

function relationshipId(sheet: Element): string | null {
  return (
    sheet.getAttributeNS(OFFICE_REL_NS, "id") ?? sheet.getAttribute("r:id")
  );
}

/**
 * Read only the three workbook sheets supported by the MVP.
 *
 * Defined names, external links, macros, drawings and any non-allowlisted sheets
 * are deliberately ignored. Formulas are not executed: their OOXML formula and
 * cached result are both exposed so callers can reconcile instead of trusting a
 * spreadsheet engine implicitly.
 */
export function parseXlsxWorkbook(buffer: ArrayBuffer): ParsedXlsxWorkbook {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new XlsxParseError("El archivo no es un XLSX/ZIP valido.");
  }

  const workbook = parseXml(
    requiredArchiveText(archive, WORKBOOK_PATH),
    WORKBOOK_PATH,
  );
  const relationships = worksheetRelationships(archive);
  const sharedStrings = parseSharedStrings(archive);
  const sheets = new Map<AllowedWorksheetName, XlsxWorksheet>();
  const allowed = new Set<string>(ALLOWED_WORKSHEET_NAMES);

  for (const sheet of elements(workbook, "sheet")) {
    const name = sheet.getAttribute("name");
    if (!name || !allowed.has(name)) continue;

    const id = relationshipId(sheet);
    const path = id ? relationships.get(id) : undefined;
    if (!path) {
      throw new XlsxParseError(`No se encontro la relacion para la hoja ${name}.`);
    }

    sheets.set(
      name as AllowedWorksheetName,
      parseWorksheet(
        name as AllowedWorksheetName,
        path,
        requiredArchiveText(archive, path),
        sharedStrings,
      ),
    );
  }

  const missing = ALLOWED_WORKSHEET_NAMES.filter((name) => !sheets.has(name));
  if (missing.length > 0) {
    throw new XlsxParseError(
      `Faltan hojas requeridas: ${missing.map((name) => JSON.stringify(name)).join(", ")}.`,
    );
  }

  return { sheets };
}

export function getXlsxCell(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
): XlsxCell | undefined {
  return workbook.sheets.get(sheet)?.cells.get(reference.toUpperCase());
}

export function getXlsxValue(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
): XlsxCellValue {
  return getXlsxCell(workbook, sheet, reference)?.value ?? null;
}
