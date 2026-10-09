import { strToU8, zipSync } from "fflate";
import type {
  CellSource,
  CostIndicator,
  DataQualityIssue,
  WorkbookQuality,
} from "../domain/types";
import {
  parseXlsxSheets,
  type XlsxCell,
  XlsxParseError,
} from "./xlsxParser";

export const AREA_BUDGET_SHEET_NAME = "Areas" as const;
export const AREA_BUDGET_HEADERS = [
  "Proyecto referente",
  "Indicador",
  "Cantidad",
  "Ajuste unitario",
] as const;

export type AreaBudgetHeader = (typeof AREA_BUDGET_HEADERS)[number];

export interface AreaBudgetLineSources {
  project: CellSource;
  indicator: CellSource;
  quantity: CellSource;
  adjustmentPerUnit: CellSource;
}

/**
 * A row imported from the controlled `Areas` worksheet.
 *
 * `catalogRate` is the catalogue's existing final rate (including any historic
 * catalogue adjustment). `adjustmentPerUnit` belongs only to this new budget.
 */
export interface ImportedAreaBudgetLine {
  rowNumber: number;
  indicator: CostIndicator;
  quantity: number;
  adjustmentPerUnit: number;
  catalogRate: number;
  finalRate: number;
  amount: number;
  sources: AreaBudgetLineSources;
}

export interface AreaBudgetWorkbookImportResult {
  sourceFileName: string;
  lines: readonly ImportedAreaBudgetLine[];
  quality: WorkbookQuality;
}

const DEFAULT_SOURCE_FILE = "areas-presupuesto.xlsx";
const MAX_INPUT_ROW = 1_001;
const MAX_SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("²", "2")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** The source workbook calls this project `Externo Casas`. */
function projectKey(value: string): string {
  const normalized = normalizeText(value);
  return normalized === "URBANISMO CASAS" || normalized === "EXTERNO CASAS"
    ? "CASAS"
    : normalized;
}

function displayProject(value: string): string {
  return projectKey(value) === "CASAS" ? "Urbanismo Casas" : value.trim();
}

function qualityFromIssues(
  issues: readonly DataQualityIssue[],
): WorkbookQuality {
  const status = issues.some((issue) => issue.severity === "error")
    ? "invalid"
    : issues.some((issue) => issue.severity === "warning")
      ? "needs-review"
      : "validated";
  return { status, issues };
}

function cellCoordinates(reference: string): {
  column: string;
  row: number;
} | null {
  const match = reference.toUpperCase().match(/^([A-Z]+)([1-9]\d*)$/);
  if (!match) return null;
  return { column: match[1], row: Number(match[2]) };
}

function sourceFor(
  fileName: string,
  cell: string,
  note?: string,
): CellSource {
  return {
    workbook: fileName,
    sheet: AREA_BUDGET_SHEET_NAME,
    cell,
    ...(note ? { note } : {}),
  };
}

function isBlank(cell: XlsxCell | undefined): boolean {
  return (
    cell === undefined ||
    cell.value === null ||
    (typeof cell.value === "string" && cell.value.trim() === "")
  );
}

function addIssue(
  issues: DataQualityIssue[],
  code: string,
  severity: DataQualityIssue["severity"],
  message: string,
  cell?: string,
): void {
  issues.push({
    code,
    severity,
    message,
    sheet: AREA_BUDGET_SHEET_NAME,
    ...(cell ? { cell } : {}),
  });
}

function requiredText(
  cell: XlsxCell | undefined,
  label: string,
  reference: string,
  issues: DataQualityIssue[],
): string | null {
  if (isBlank(cell)) {
    addIssue(
      issues,
      "missing-area-budget-value",
      "error",
      `Falta ${label} en ${AREA_BUDGET_SHEET_NAME}!${reference}.`,
      reference,
    );
    return null;
  }
  if (typeof cell?.value !== "string") {
    addIssue(
      issues,
      "invalid-area-budget-text",
      "error",
      `${label} debe ser texto en ${AREA_BUDGET_SHEET_NAME}!${reference}.`,
      reference,
    );
    return null;
  }
  return cell.value.trim();
}

function requiredNumber(
  cell: XlsxCell | undefined,
  label: string,
  reference: string,
  issues: DataQualityIssue[],
): number | null {
  if (isBlank(cell)) {
    addIssue(
      issues,
      "missing-area-budget-value",
      "error",
      `Falta ${label} en ${AREA_BUDGET_SHEET_NAME}!${reference}.`,
      reference,
    );
    return null;
  }
  if (
    typeof cell?.value !== "number" ||
    !Number.isFinite(cell.value) ||
    Math.abs(cell.value) > MAX_SAFE_MAGNITUDE
  ) {
    addIssue(
      issues,
      "invalid-area-budget-number",
      "error",
      `${label} debe ser un número de Excel válido en ${AREA_BUDGET_SHEET_NAME}!${reference}.`,
      reference,
    );
    return null;
  }
  return cell.value;
}

function optionalAdjustment(
  cell: XlsxCell | undefined,
  reference: string,
  issues: DataQualityIssue[],
): number | null {
  if (isBlank(cell)) return 0;
  return requiredNumber(cell, "el ajuste unitario", reference, issues);
}

function inputFormulaIssue(
  cell: XlsxCell | undefined,
  reference: string,
  issues: DataQualityIssue[],
): boolean {
  if (cell?.formula === undefined) return false;
  addIssue(
    issues,
    "area-budget-formula-not-allowed",
    "error",
    `La plantilla no admite fórmulas en ${AREA_BUDGET_SHEET_NAME}!${reference}; pega el valor calculado.`,
    reference,
  );
  return true;
}

/**
 * Import a controlled, row-based area/budget workbook against the active cost
 * catalogue. It never adds rates supplied by the workbook and never mutates
 * the catalogue. Structurally readable rows remain available for preview; any
 * error makes the result invalid so callers can block finalisation while
 * showing every finding (including duplicate rows).
 */
export function importAreaBudgetWorkbook(
  buffer: ArrayBuffer,
  catalogue: readonly CostIndicator[],
  sourceFileName = DEFAULT_SOURCE_FILE,
): AreaBudgetWorkbookImportResult {
  const issues: DataQualityIssue[] = [];
  const lines: ImportedAreaBudgetLine[] = [];

  try {
    const workbook = parseXlsxSheets(buffer, [AREA_BUDGET_SHEET_NAME]);
    const sheet = workbook.sheets.get(AREA_BUDGET_SHEET_NAME);
    if (!sheet) {
      throw new XlsxParseError(
        `Falta la hoja requerida ${JSON.stringify(AREA_BUDGET_SHEET_NAME)}.`,
      );
    }

    const headerColumns = new Map<AreaBudgetHeader, string>();
    for (const cell of sheet.cells.values()) {
      const coordinates = cellCoordinates(cell.reference);
      if (coordinates?.row !== 1 || typeof cell.value !== "string") continue;
      const expected = AREA_BUDGET_HEADERS.find(
        (header) => normalizeText(header) === normalizeText(cell.value as string),
      );
      if (!expected) continue;
      if (headerColumns.has(expected)) {
        addIssue(
          issues,
          "duplicate-area-budget-header",
          "error",
          `La columna ${JSON.stringify(expected)} aparece más de una vez.`,
          cell.reference,
        );
      } else {
        headerColumns.set(expected, coordinates.column);
      }
    }

    for (const header of AREA_BUDGET_HEADERS) {
      if (!headerColumns.has(header)) {
        addIssue(
          issues,
          "missing-area-budget-header",
          "error",
          `Falta la columna obligatoria ${JSON.stringify(header)} en la fila 1.`,
        );
      }
    }
    if (headerColumns.size !== AREA_BUDGET_HEADERS.length) {
      return {
        sourceFileName,
        lines,
        quality: qualityFromIssues(issues),
      };
    }

    const projectColumn = headerColumns.get("Proyecto referente")!;
    const indicatorColumn = headerColumns.get("Indicador")!;
    const quantityColumn = headerColumns.get("Cantidad")!;
    const adjustmentColumn = headerColumns.get("Ajuste unitario")!;
    const inputColumns = new Set([
      projectColumn,
      indicatorColumn,
      quantityColumn,
      adjustmentColumn,
    ]);

    const candidateRows = new Set<number>();
    for (const cell of sheet.cells.values()) {
      const coordinates = cellCoordinates(cell.reference);
      if (
        coordinates &&
        coordinates.row > 1 &&
        inputColumns.has(coordinates.column)
      ) {
        candidateRows.add(coordinates.row);
      }
    }

    const indicatorsByProject = new Map<string, CostIndicator[]>();
    for (const indicator of catalogue) {
      const key = projectKey(indicator.project);
      const projectIndicators = indicatorsByProject.get(key) ?? [];
      projectIndicators.push(indicator);
      indicatorsByProject.set(key, projectIndicators);
    }
    const knownProjects = [...indicatorsByProject.values()]
      .map((items) => displayProject(items[0].project))
      .sort((left, right) => left.localeCompare(right, "es"));
    const importedIndicatorIds = new Set<string>();

    for (const row of [...candidateRows].sort((left, right) => left - right)) {
      if (row > MAX_INPUT_ROW) {
        addIssue(
          issues,
          "area-budget-row-limit",
          "error",
          `La plantilla admite como máximo ${MAX_INPUT_ROW - 1} filas de datos.`,
          `${projectColumn}${row}`,
        );
        break;
      }

      const projectRef = `${projectColumn}${row}`;
      const indicatorRef = `${indicatorColumn}${row}`;
      const quantityRef = `${quantityColumn}${row}`;
      const adjustmentRef = `${adjustmentColumn}${row}`;
      const projectCell = sheet.cells.get(projectRef);
      const indicatorCell = sheet.cells.get(indicatorRef);
      const quantityCell = sheet.cells.get(quantityRef);
      const adjustmentCell = sheet.cells.get(adjustmentRef);

      if (
        [projectCell, indicatorCell, quantityCell, adjustmentCell].every(isBlank)
      ) {
        continue;
      }
      const inputCells = [
        [projectCell, projectRef],
        [indicatorCell, indicatorRef],
        [quantityCell, quantityRef],
        [adjustmentCell, adjustmentRef],
      ] as const;
      let hasFormula = false;
      for (const [cell, reference] of inputCells) {
        hasFormula = inputFormulaIssue(cell, reference, issues) || hasFormula;
      }
      if (hasFormula) continue;

      const project = requiredText(
        projectCell,
        "el proyecto referente",
        projectRef,
        issues,
      );
      const indicatorName = requiredText(
        indicatorCell,
        "el indicador",
        indicatorRef,
        issues,
      );
      const quantity = requiredNumber(
        quantityCell,
        "la cantidad",
        quantityRef,
        issues,
      );
      const adjustmentPerUnit = optionalAdjustment(
        adjustmentCell,
        adjustmentRef,
        issues,
      );
      if (
        project === null ||
        indicatorName === null ||
        quantity === null ||
        adjustmentPerUnit === null
      ) {
        continue;
      }
      if (quantity < 0) {
        addIssue(
          issues,
          "negative-area-budget-quantity",
          "error",
          `La cantidad no puede ser negativa en ${AREA_BUDGET_SHEET_NAME}!${quantityRef}.`,
          quantityRef,
        );
        continue;
      }

      const projectIndicators = indicatorsByProject.get(projectKey(project));
      if (!projectIndicators) {
        addIssue(
          issues,
          "unknown-area-budget-project",
          "error",
          `El proyecto ${JSON.stringify(project)} no existe en el catálogo activo. Proyectos disponibles: ${knownProjects.join(", ")}.`,
          projectRef,
        );
        continue;
      }

      const normalizedIndicator = normalizeText(indicatorName);
      const matches = projectIndicators.filter(
        (candidate) =>
          normalizeText(candidate.concept) === normalizedIndicator ||
          normalizeText(candidate.id) === normalizedIndicator,
      );
      if (matches.length === 0) {
        addIssue(
          issues,
          "unknown-area-budget-indicator",
          "error",
          `El indicador ${JSON.stringify(indicatorName)} no pertenece a ${displayProject(projectIndicators[0].project)}.`,
          indicatorRef,
        );
        continue;
      }
      if (matches.length > 1) {
        addIssue(
          issues,
          "ambiguous-area-budget-indicator",
          "error",
          `El indicador ${JSON.stringify(indicatorName)} coincide con varias filas de ${displayProject(projectIndicators[0].project)}; usa su ID de catálogo.`,
          indicatorRef,
        );
        continue;
      }

      const indicator = matches[0];
      const finalRate = indicator.finalRate + adjustmentPerUnit;
      const amount = quantity * finalRate;
      if (
        finalRate < 0 ||
        !Number.isFinite(finalRate) ||
        !Number.isFinite(amount) ||
        Math.abs(amount) > MAX_SAFE_MAGNITUDE
      ) {
        addIssue(
          issues,
          "invalid-area-budget-result",
          "error",
          `Cantidad × tarifa ajustada produce un valor no válido en la fila ${row}.`,
          adjustmentRef,
        );
        continue;
      }

      if (importedIndicatorIds.has(indicator.id)) {
        addIssue(
          issues,
          "duplicate-area-budget-indicator",
          "error",
          `El indicador ${JSON.stringify(indicator.concept)} está repetido en el presupuesto.`,
          indicatorRef,
        );
      }
      importedIndicatorIds.add(indicator.id);
      if (quantity === 0) {
        addIssue(
          issues,
          "zero-area-budget-quantity",
          "warning",
          `La fila ${row} tiene cantidad cero y no aporta valor al presupuesto.`,
          quantityRef,
        );
      }
      if (indicator.usage !== "selectable") {
        addIssue(
          issues,
          "area-budget-indicator-needs-review",
          "warning",
          `El indicador ${JSON.stringify(indicator.concept)} está clasificado como ${indicator.usage} y requiere revisión antes de usarlo.`,
          indicatorRef,
        );
      }

      lines.push({
        rowNumber: row,
        indicator,
        quantity,
        adjustmentPerUnit,
        catalogRate: indicator.finalRate,
        finalRate,
        amount,
        sources: {
          project: sourceFor(sourceFileName, projectRef),
          indicator: sourceFor(sourceFileName, indicatorRef),
          quantity: sourceFor(sourceFileName, quantityRef),
          adjustmentPerUnit: sourceFor(
            sourceFileName,
            adjustmentRef,
            isBlank(adjustmentCell)
              ? "Celda vacía interpretada como ajuste cero."
              : undefined,
          ),
        },
      });
    }

    if (lines.length === 0) {
      addIssue(
        issues,
        "empty-area-budget",
        "error",
        "La hoja Areas no contiene ninguna fila válida para importar.",
      );
    }
  } catch (error) {
    addIssue(
      issues,
      "invalid-area-budget-workbook",
      "error",
      error instanceof XlsxParseError
        ? error.message
        : "No fue posible leer la plantilla de áreas.",
    );
  }

  return {
    sourceFileName,
    lines,
    quality: qualityFromIssues(issues),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function inlineStringCell(reference: string, value: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/** Build a macro-free one-sheet XLSX template with catalogue-backed lists. */
export function createAreaBudgetTemplate(
  catalogue: readonly CostIndicator[],
): Uint8Array {
  const projects = [
    ...new Set(catalogue.map((indicator) => displayProject(indicator.project))),
  ].sort((left, right) => left.localeCompare(right, "es"));
  const indicators = [
    ...new Set(catalogue.map((indicator) => indicator.concept.trim())),
  ].sort((left, right) => left.localeCompare(right, "es"));
  const headerCells = AREA_BUDGET_HEADERS.map((header, index) =>
    inlineStringCell(`${String.fromCharCode(65 + index)}1`, header),
  ).join("");
  const lookupRows = Math.max(projects.length, indicators.length);
  const lookupXml = Array.from({ length: lookupRows }, (_, index) => {
    const row = index + 2;
    const cells = [
      projects[index] ? inlineStringCell(`F${row}`, projects[index]) : "",
      indicators[index] ? inlineStringCell(`G${row}`, indicators[index]) : "",
    ].join("");
    return `<row r="${row}">${cells}</row>`;
  }).join("");
  const validations = [
    projects.length > 0
      ? `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Proyecto no válido" error="Selecciona un proyecto de la lista." sqref="A2:A${MAX_INPUT_ROW}"><formula1>$F$2:$F$${projects.length + 1}</formula1></dataValidation>`
      : "",
    indicators.length > 0
      ? `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Indicador no válido" error="Selecciona un indicador de la lista." sqref="B2:B${MAX_INPUT_ROW}"><formula1>$G$2:$G$${indicators.length + 1}</formula1></dataValidation>`
      : "",
  ].filter(Boolean);
  const validationXml = validations.length
    ? `<dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`
    : "";
  const lastRow = Math.max(1, lookupRows + 1);
  const worksheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:G${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols><col min="1" max="2" width="34" customWidth="1"/><col min="3" max="4" width="18" customWidth="1"/><col min="6" max="7" hidden="1"/></cols>` +
    `<sheetData><row r="1">${headerCells}${inlineStringCell("F1", "Proyectos disponibles")}${inlineStringCell("G1", "Indicadores disponibles")}</row>${lookupXml}</sheetData>` +
    validationXml +
    `</worksheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${AREA_BUDGET_SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  });
}

/** Browser helper; the caller decides where to expose the download action. */
export function downloadAreaBudgetTemplate(
  catalogue: readonly CostIndicator[],
  fileName = "plantilla-areas-presupuesto.xlsx",
): void {
  const bytes = createAreaBudgetTemplate(catalogue);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
