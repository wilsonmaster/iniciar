import type {
  CellSource,
  ChapterKey,
  CostIndicator,
  CostIndicatorUsage,
  CostReference,
  DataQualityIssue,
  ProjectType,
  RateAdjustment,
  ScenarioInput,
  WorkbookImportResult,
  WorkbookModel,
  WorkbookQuality,
} from "../domain/types";
import { buildCandidateReferences } from "../domain/referenceCandidates";
import {
  ALLOWED_WORKSHEET_NAMES,
  getXlsxCell,
  parseXlsxWorkbook,
  type AllowedWorksheetName,
  type ParsedXlsxWorkbook,
  type XlsxCell,
  XlsxParseError,
} from "./xlsxParser";

const DEFAULT_SOURCE_FILE = "INDICADORES.xlsx";
const MONEY_TOLERANCE = 0.01;
const RATE_TOLERANCE = 0.000001;
const AREA_TOLERANCE = 0.000001;

interface CatalogBlockSpec {
  groupId: string;
  fallbackLabel: string;
  project: string;
  projectType: ProjectType;
  headingRow: number;
  dataRows: readonly number[];
  floorCount?: number;
  partial?: boolean;
}

const CATALOG_BLOCK_SPECS: readonly CatalogBlockSpec[] = [
  {
    groupId: "serraclara",
    fallbackLabel: "Indicadores Serraclara 2026 · 11 pisos",
    project: "Serraclara",
    projectType: "residential-tower",
    headingRow: 2,
    dataRows: [4, 5, 6, 7, 8, 9, 10],
    floorCount: 11,
  },
  {
    groupId: "serraclara-structure-finishes",
    fallbackLabel: "Serraclara · estructura y acabados",
    project: "Serraclara",
    projectType: "residential-tower",
    headingRow: 11,
    dataRows: [13, 14],
    floorCount: 11,
    partial: true,
  },
  {
    groupId: "arbore",
    fallbackLabel: "Indicadores Arbore 2026 · 12 pisos",
    project: "Arbore",
    projectType: "residential-tower",
    headingRow: 16,
    dataRows: [18, 19, 20, 21],
    floorCount: 12,
  },
  {
    groupId: "arbore-structure-finishes",
    fallbackLabel: "Arbore · estructura y acabados",
    project: "Arbore",
    projectType: "residential-tower",
    headingRow: 22,
    dataRows: [24, 25],
    floorCount: 12,
    partial: true,
  },
  {
    groupId: "rocca",
    fallbackLabel: "Indicadores Rocca 2026 · 22 pisos",
    project: "Rocca",
    projectType: "residential-tower",
    headingRow: 27,
    dataRows: [29, 30, 31, 32, 33, 34, 35],
    floorCount: 22,
  },
  {
    groupId: "rocca-structure-finishes",
    fallbackLabel: "Rocca · estructura y acabados",
    project: "Rocca",
    projectType: "residential-tower",
    headingRow: 36,
    dataRows: [38, 39],
    floorCount: 22,
    partial: true,
  },
  {
    groupId: "offices-rocca",
    fallbackLabel: "Indicadores Oficinas Rocca 2026 · 10 pisos",
    project: "Oficinas Rocca",
    projectType: "office",
    headingRow: 41,
    dataRows: [43, 44, 45, 46, 47],
    floorCount: 10,
  },
  {
    groupId: "external-houses",
    fallbackLabel: "Indicadores Externo Casas 2026 · 2 pisos",
    project: "Externo Casas",
    projectType: "houses",
    headingRow: 49,
    dataRows: [51, 52, 53, 54, 55],
    floorCount: 2,
  },
  {
    groupId: "offices-t6",
    fallbackLabel: "Indicadores Oficinas T6 2026 · 16 pisos",
    project: "Oficinas T6",
    projectType: "office",
    headingRow: 57,
    dataRows: [59, 60, 61, 62, 63],
    floorCount: 16,
  },
  {
    groupId: "pinar-vis",
    fallbackLabel: "Indicadores Pinar VIS 2026 · 13 pisos",
    project: "Pinar VIS",
    projectType: "residential-tower",
    headingRow: 65,
    dataRows: [67, 68, 69, 70, 71, 72],
    floorCount: 13,
  },
] as const;

interface ReferenceSpec {
  chapter: ChapterKey;
  id: string;
  catalogIndicatorId: string;
  rateCell: string;
  unitCell: string;
  labelCell: string;
  project: string;
  context: CostReference["context"];
  scope: string;
  exclusions: readonly string[];
}

const REFERENCE_SPECS: readonly ReferenceSpec[] = [
  {
    chapter: "vis-towers",
    id: "pinar-vis-towers-2026",
    catalogIndicatorId: "catalog-pinar-vis-r70",
    rateCell: "H70",
    unitCell: "C70",
    labelCell: "B70",
    project: "Pinar VIS",
    context: { assetClass: "residential", product: "VIS", floorCount: 13 },
    scope: "Torres VIS de 13 pisos.",
    exclusions: [],
  },
  {
    chapter: "non-vis-towers",
    id: "arbore-towers-2026",
    catalogIndicatorId: "catalog-arbore-r19",
    rateCell: "F19",
    unitCell: "C19",
    labelCell: "B19",
    project: "Arbore",
    context: {
      assetClass: "residential",
      product: "non-VIS",
      floorCount: 12,
    },
    scope: "Torres residenciales de 12 pisos.",
    exclusions: [],
  },
  {
    chapter: "parking-building",
    id: "pinar-parking-building-2026",
    catalogIndicatorId: "catalog-pinar-vis-r68",
    rateCell: "H68",
    unitCell: "C68",
    labelCell: "B68",
    project: "Pinar VIS",
    context: {
      assetClass: "residential",
      product: "VIS",
      floorCount: 5,
      basementLevels: 0,
    },
    scope: "Edificio de parqueaderos de 5 pisos sin sotano.",
    exclusions: ["Sotanos", "Tres pisos adicionales del escenario"],
  },
  {
    chapter: "common-areas",
    id: "pinar-common-areas-2026",
    catalogIndicatorId: "catalog-pinar-vis-r69",
    rateCell: "F69",
    unitCell: "C69",
    labelCell: "B69",
    project: "Pinar VIS",
    context: { assetClass: "residential", product: "VIS" },
    scope: "Zonas comunes en el ultimo piso del edificio de parqueaderos.",
    exclusions: [],
  },
  {
    chapter: "internal-urbanism",
    id: "pinar-internal-urbanism-2026",
    catalogIndicatorId: "catalog-pinar-vis-r71",
    rateCell: "H71",
    unitCell: "C71",
    labelCell: "B71",
    project: "Pinar VIS",
    context: { assetClass: "residential", product: "mixed" },
    scope: "Urbanismo interno.",
    exclusions: ["Urbanismo externo"],
  },
  {
    chapter: "preliminaries",
    id: "pinar-preliminaries-2026",
    catalogIndicatorId: "catalog-pinar-vis-r67",
    rateCell: "H67",
    unitCell: "C67",
    labelCell: "B67",
    project: "Pinar VIS",
    context: { assetClass: "residential", product: "VIS" },
    scope: "Preliminares de obra.",
    exclusions: [],
  },
] as const;

const CHAPTERS = REFERENCE_SPECS.map((spec) => spec.chapter);

interface ScenarioSpec {
  id: string;
  number: 2 | 3;
  budgetTitleCell: string;
  titleCell: string;
  presentationColumn: "D" | "J";
  presentationValueColumn: "F" | "L";
  firstBudgetRow: number;
  administrationRow: number;
  totalRow: number;
  areaRow: number;
  costPerM2Row: number;
}

const SCENARIO_SPECS: readonly ScenarioSpec[] = [
  {
    id: "scenario-2",
    number: 2,
    budgetTitleCell: "B2",
    titleCell: "D3",
    presentationColumn: "D",
    presentationValueColumn: "F",
    firstBudgetRow: 4,
    administrationRow: 10,
    totalRow: 11,
    areaRow: 12,
    costPerM2Row: 13,
  },
  {
    id: "scenario-3",
    number: 3,
    budgetTitleCell: "B15",
    titleCell: "J3",
    presentationColumn: "J",
    presentationValueColumn: "L",
    firstBudgetRow: 17,
    administrationRow: 23,
    totalRow: 24,
    areaRow: 25,
    costPerM2Row: 26,
  },
] as const;

class WorkbookDataError extends Error {
  constructor(readonly issue: DataQualityIssue) {
    super(issue.message);
    this.name = "WorkbookDataError";
  }
}

function qualityFromIssues(issues: readonly DataQualityIssue[]): WorkbookQuality {
  const status = issues.some((issue) => issue.severity === "error")
    ? "invalid"
    : issues.some((issue) => issue.severity === "warning")
      ? "needs-review"
      : "validated";
  return { status, issues };
}

function failCell(
  code: string,
  message: string,
  sheet: AllowedWorksheetName,
  cell: string,
  field?: string,
): never {
  throw new WorkbookDataError({
    code,
    severity: "error",
    message,
    sheet,
    cell,
    ...(field ? { field } : {}),
  });
}

function requiredCell(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
  field?: string,
): XlsxCell {
  const cell = getXlsxCell(workbook, sheet, reference);
  if (!cell) {
    failCell(
      "missing-required-cell",
      `Falta la celda requerida ${sheet}!${reference}.`,
      sheet,
      reference,
      field,
    );
  }
  return cell;
}

function requiredNumber(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
  field?: string,
): number {
  const cell = requiredCell(workbook, sheet, reference, field);
  if (cell.formula !== undefined && !cell.hasCachedValue) {
    failCell(
      "formula-without-cached-value",
      `La formula ${sheet}!${reference} no tiene un resultado cacheado.`,
      sheet,
      reference,
      field,
    );
  }
  if (typeof cell.value !== "number" || !Number.isFinite(cell.value)) {
    failCell(
      "invalid-required-number",
      `Se esperaba un numero en ${sheet}!${reference}.`,
      sheet,
      reference,
      field,
    );
  }
  return cell.value;
}

function optionalNumber(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
): number | null {
  const value = getXlsxCell(workbook, sheet, reference)?.value;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    failCell(
      "invalid-optional-number",
      `El ajuste opcional ${sheet}!${reference} no es numerico.`,
      sheet,
      reference,
      "adjustment",
    );
  }
  return value;
}

function requiredString(
  workbook: ParsedXlsxWorkbook,
  sheet: AllowedWorksheetName,
  reference: string,
  field?: string,
): string {
  const cell = requiredCell(workbook, sheet, reference, field);
  if (typeof cell.value !== "string" || cell.value.trim() === "") {
    failCell(
      "invalid-required-text",
      `Se esperaba texto en ${sheet}!${reference}.`,
      sheet,
      reference,
      field,
    );
  }
  return cell.value;
}

function sourceFor(
  workbook: ParsedXlsxWorkbook,
  fileName: string,
  sheet: AllowedWorksheetName,
  reference: string,
  note?: string,
): CellSource {
  const cell = requiredCell(workbook, sheet, reference);
  return {
    workbook: fileName,
    sheet,
    cell: reference,
    ...(cell.formula !== undefined ? { formula: cell.formula } : {}),
    ...(cell.formula !== undefined && typeof cell.value === "number"
      ? { cachedValue: cell.value }
      : {}),
    ...(note ? { note } : {}),
  };
}

function differenceIssue(
  issues: DataQualityIssue[],
  options: {
    code: string;
    actual: number;
    expected: number;
    tolerance: number;
    message: string;
    sheet: AllowedWorksheetName;
    cell: string;
    scenarioId?: string;
    chapter?: ChapterKey;
    field?: string;
  },
): void {
  const difference = options.actual - options.expected;
  if (Math.abs(difference) <= options.tolerance) return;

  issues.push({
    code: options.code,
    severity: "error",
    message: `${options.message} Diferencia: ${difference}.`,
    sheet: options.sheet,
    cell: options.cell,
    ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}),
    ...(options.chapter ? { chapter: options.chapter } : {}),
    ...(options.field ? { field: options.field } : {}),
  });
}

function normalizeFormula(formula: string): string {
  return formula
    .trim()
    .replace(/^=/, "")
    .replace(/^\+/, "")
    .replaceAll("$", "")
    .replaceAll("'", "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseScenarioUnits(
  text: string,
  sourceCell: string,
  issues: DataQualityIssue[],
): { vis: number; nonVis: number } {
  const normalized = text.replaceAll("\u00a0", " ");
  const match = normalized.match(
    /([\d.,]+)\s*VIS\s*(?:Y|\+)\s*([\d.,]+)\s*NO\s*VIS/i,
  );
  if (!match) {
    failCell(
      "scenario-units-not-found",
      `No se pudieron leer las unidades VIS/No VIS de Presentacion!${sourceCell}.`,
      "Presentacion",
      sourceCell,
      "housingUnits",
    );
  }

  const parseInteger = (value: string): number =>
    Number.parseInt(value.replace(/[.,]/g, ""), 10);
  const vis = parseInteger(match[1]);
  const nonVis = parseInteger(match[2]);
  const totalMatch = normalized.match(/([\d.,]+)\s*APTOS/i);
  if (totalMatch) {
    const statedTotal = parseInteger(totalMatch[1]);
    if (statedTotal !== vis + nonVis) {
      issues.push({
        code: "housing-unit-total-mismatch",
        severity: "error",
        message: `Las unidades VIS y No VIS no concilian con el total declarado (${statedTotal}).`,
        sheet: "Presentacion",
        cell: sourceCell,
        field: "housingUnits",
      });
    }
  }

  return { vis, nonVis };
}

function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function catalogueClassification(
  concept: string,
  block: CatalogBlockSpec,
): { usage: CostIndicatorUsage; compatibleChapters: readonly ChapterKey[] } {
  const normalized = normalizeCatalogText(concept);
  const towerChapters = ["vis-towers", "non-vis-towers"] as const;

  if (block.partial) {
    return { usage: "partial", compatibleChapters: towerChapters };
  }
  if (normalized.includes("ADMON") || normalized.includes("ADMINISTRACION")) {
    return { usage: "administration", compatibleChapters: [] };
  }
  if (normalized.includes("PRELIMINAR")) {
    return { usage: "selectable", compatibleChapters: ["preliminaries"] };
  }
  if (normalized.includes("URBANISMO")) {
    return { usage: "selectable", compatibleChapters: ["internal-urbanism"] };
  }
  if (
    normalized.includes("ZONA") ||
    normalized.includes("AMENIDAD") ||
    normalized.includes("CLUB HOUSE")
  ) {
    return { usage: "selectable", compatibleChapters: ["common-areas"] };
  }
  if (
    normalized.includes("TORRE") ||
    normalized.includes("OFICINA") ||
    /^CASAS\b/.test(normalized)
  ) {
    if (block.groupId === "pinar-vis" && normalized.includes("VIS")) {
      return { usage: "selectable", compatibleChapters: ["vis-towers"] };
    }
    return { usage: "selectable", compatibleChapters: towerChapters };
  }
  if (normalized.includes("PARQUEADERO") || normalized.includes("SOTANO")) {
    return { usage: "selectable", compatibleChapters: ["parking-building"] };
  }

  return { usage: "unmapped", compatibleChapters: [] };
}

function assetClassFor(projectType: ProjectType): CostReference["context"]["assetClass"] {
  if (projectType === "office") return "office";
  if (projectType === "houses") return "houses";
  return "residential";
}

function basementLevelsFor(concept: string): number | undefined {
  const normalized = normalizeCatalogText(concept);
  if (normalized.includes("SIN SOTANO")) return 0;
  if (normalized.includes("3 NIVELES") && normalized.includes("SOTANO")) return 3;
  if (normalized.includes("SOTANO + SEMISOTANO") || normalized.includes("SOT + SEM")) return 2;
  if (normalized.includes("SOTANO") || normalized.includes("SOT ")) return 1;
  return undefined;
}

function buildCostIndicators(
  workbook: ParsedXlsxWorkbook,
  fileName: string,
  fallbackBaseYear: number,
): CostIndicator[] {
  const indicators: CostIndicator[] = [];

  for (const block of CATALOG_BLOCK_SPECS) {
    const headingValue = getXlsxCell(
      workbook,
      "Indicadores costos",
      `B${block.headingRow}`,
    )?.value;
    const groupLabel =
      typeof headingValue === "string" && headingValue.trim()
        ? headingValue.trim().replace(/\s+/g, " ")
        : block.fallbackLabel;
    const headingYear = groupLabel.match(/\b(20\d{2})\b/);
    const baseYear = headingYear ? Number(headingYear[1]) : fallbackBaseYear;

    for (const row of block.dataRows) {
      const conceptValue = getXlsxCell(
        workbook,
        "Indicadores costos",
        `B${row}`,
      )?.value;
      if (conceptValue === undefined || conceptValue === null || conceptValue === "") {
        continue;
      }
      if (typeof conceptValue !== "string") {
        failCell(
          "invalid-catalog-concept",
          `Se esperaba texto en Indicadores costos!B${row}.`,
          "Indicadores costos",
          `B${row}`,
          "costIndicators.concept",
        );
      }

      const concept = conceptValue.trim();
      const originalUnit = requiredString(
        workbook,
        "Indicadores costos",
        `C${row}`,
        "costIndicators.originalUnit",
      ).trim();
      const historicalAmount = requiredNumber(
        workbook,
        "Indicadores costos",
        `D${row}`,
        "costIndicators.historicalAmount",
      );
      const basisQuantity = requiredNumber(
        workbook,
        "Indicadores costos",
        `E${row}`,
        "costIndicators.basisQuantity",
      );
      if (basisQuantity <= 0) {
        failCell(
          "invalid-catalog-quantity",
          `La base de Indicadores costos!E${row} debe ser mayor que cero.`,
          "Indicadores costos",
          `E${row}`,
          "costIndicators.basisQuantity",
        );
      }

      const storedUnitRate = optionalNumber(
        workbook,
        "Indicadores costos",
        `F${row}`,
      );
      const adjustmentPerUnit =
        optionalNumber(workbook, "Indicadores costos", `G${row}`) ?? 0;
      const storedFinalRate = optionalNumber(
        workbook,
        "Indicadores costos",
        `H${row}`,
      );
      const unitRate = storedUnitRate ?? historicalAmount / basisQuantity;
      const finalRate = storedFinalRate ?? unitRate + adjustmentPerUnit;
      const rateCell = storedFinalRate === null ? `F${row}` : `H${row}`;
      const classification = catalogueClassification(concept, block);
      const assetClass = assetClassFor(block.projectType);
      const context: CostReference["context"] = {
        assetClass,
        ...(block.projectType === "residential-tower"
          ? { product: block.groupId === "pinar-vis" ? "VIS" : "mixed" }
          : {}),
        ...(block.floorCount === undefined ? {} : { floorCount: block.floorCount }),
        ...(basementLevelsFor(concept) === undefined
          ? {}
          : { basementLevels: basementLevelsFor(concept) }),
      };

      indicators.push({
        id: `catalog-${block.groupId}-r${row}`,
        groupId: block.groupId,
        groupLabel,
        project: block.project,
        projectType: block.projectType,
        baseYear,
        ...(block.floorCount === undefined ? {} : { floorCount: block.floorCount }),
        concept,
        originalUnit,
        historicalAmount,
        basisQuantity,
        unitRate,
        adjustmentPerUnit,
        finalRate,
        usage: classification.usage,
        compatibleChapters: classification.compatibleChapters,
        context,
        source: sourceFor(
          workbook,
          fileName,
          "Indicadores costos",
          rateCell,
          "Tipología y compatibilidad derivadas del título y concepto del Excel; requieren validación de Presupuestos.",
        ),
        amountSource: sourceFor(
          workbook,
          fileName,
          "Indicadores costos",
          `D${row}`,
        ),
        quantitySource: sourceFor(
          workbook,
          fileName,
          "Indicadores costos",
          `E${row}`,
        ),
      });
    }
  }

  return indicators;
}

function buildReferences(
  workbook: ParsedXlsxWorkbook,
  fileName: string,
  baseYear: number,
  issues: DataQualityIssue[],
): CostReference[] {
  return REFERENCE_SPECS.map((spec) => {
    const unit = requiredString(
      workbook,
      "Indicadores costos",
      spec.unitCell,
      "quantityUnit",
    );
    if (unit.trim().toLowerCase() !== "m2") {
      failCell(
        "unsupported-reference-unit",
        `La referencia ${spec.id} usa la unidad no soportada ${JSON.stringify(unit)}.`,
        "Indicadores costos",
        spec.unitCell,
        "quantityUnit",
      );
    }

    const row = spec.rateCell.match(/\d+$/)?.[0];
    if (!row) {
      throw new Error(`Celda de referencia interna invalida: ${spec.rateCell}.`);
    }
    const historicalAmount = requiredNumber(
      workbook,
      "Indicadores costos",
      `D${row}`,
      "historicalAmount",
    );
    const historicalQuantity = requiredNumber(
      workbook,
      "Indicadores costos",
      `E${row}`,
      "historicalQuantity",
    );
    if (historicalQuantity <= 0) {
      failCell(
        "invalid-reference-quantity",
        `La cantidad historica de la referencia ${spec.id} debe ser mayor que cero.`,
        "Indicadores costos",
        `E${row}`,
        "historicalQuantity",
      );
    }
    const selectedRate = requiredNumber(
      workbook,
      "Indicadores costos",
      spec.rateCell,
      "baseRate",
    );
    const usesAdjustedCatalogRate = spec.rateCell.startsWith("H");
    const catalogAdjustment = usesAdjustedCatalogRate
      ? (optionalNumber(workbook, "Indicadores costos", `G${row}`) ?? 0)
      : 0;
    differenceIssue(issues, {
      code: "catalog-rate-reconciliation-difference",
      actual: selectedRate,
      expected: historicalAmount / historicalQuantity + catalogAdjustment,
      tolerance: RATE_TOLERANCE,
      message:
        "La tarifa seleccionada no coincide con valor historico / cantidad + ajuste del catalogo.",
      sheet: "Indicadores costos",
      cell: spec.rateCell,
      chapter: spec.chapter,
      field: "baseRate",
    });

    return {
      id: spec.id,
      chapter: spec.chapter,
      catalogIndicatorId: spec.catalogIndicatorId,
      label: requiredString(
        workbook,
        "Indicadores costos",
        spec.labelCell,
        "label",
      ).trim(),
      project: spec.project,
      baseYear,
      currency: "COP",
      quantityUnit: "m2",
      rateUnit: "COP/m2",
      baseRate: selectedRate,
      source: sourceFor(
        workbook,
        fileName,
        "Indicadores costos",
        spec.rateCell,
        `Celda exacta usada por el presupuesto; concilia contra D${row}/E${row}${usesAdjustedCatalogRate ? ` + G${row}` : ""} y no combina desgloses alternativos.`,
      ),
      scope: spec.scope,
      exclusions: spec.exclusions,
      context: spec.context,
      reviewStatus: "needs-review",
    };
  });
}

function referenceMap(
  references: readonly CostReference[],
): Record<ChapterKey, CostReference> {
  return Object.fromEntries(
    references.map((reference) => [reference.chapter, reference]),
  ) as Record<ChapterKey, CostReference>;
}

function chapterRow(spec: ScenarioSpec, chapter: ChapterKey): number {
  return spec.firstBudgetRow + CHAPTERS.indexOf(chapter);
}

const EXPECTED_CHAPTER_LABELS: Record<ChapterKey, RegExp> = {
  "vis-towers": /^TORRES VIS$/,
  "non-vis-towers": /^TORRES NO VIS$/,
  "parking-building": /^ED(?:IFICIO)? DE PARQUEADEROS$/,
  "common-areas": /^(?:COMUNALES|ZONAS COMUNES)$/,
  "internal-urbanism": /^URBANISMO$/,
  preliminaries: /^PRELIMINARES$/,
};

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function validateScenarioLayout(
  workbook: ParsedXlsxWorkbook,
  spec: ScenarioSpec,
): void {
  const title = normalizeLabel(
    requiredString(workbook, "Ppto ", spec.budgetTitleCell, "scenarioTitle"),
  );
  if (title !== `ESCENARIO ${spec.number}`) {
    failCell(
      "unexpected-scenario-layout",
      `Se esperaba ESCENARIO ${spec.number} en Ppto !${spec.budgetTitleCell}.`,
      "Ppto ",
      spec.budgetTitleCell,
      "scenarioTitle",
    );
  }

  for (const chapter of CHAPTERS) {
    const cell = `B${chapterRow(spec, chapter)}`;
    const label = normalizeLabel(
      requiredString(workbook, "Ppto ", cell, `chapter.${chapter}`),
    );
    if (!EXPECTED_CHAPTER_LABELS[chapter].test(label)) {
      failCell(
        "unexpected-scenario-layout",
        `La fila ${cell} no corresponde al capitulo ${chapter}.`,
        "Ppto ",
        cell,
        `chapter.${chapter}`,
      );
    }
  }
}

function adjustmentFor(
  workbook: ParsedXlsxWorkbook,
  fileName: string,
  spec: ScenarioSpec,
  chapter: ChapterKey,
  baseRate: number,
): RateAdjustment | undefined {
  const row = chapterRow(spec, chapter);
  const adjustment = optionalNumber(workbook, "Ppto ", `F${row}`);
  if (adjustment === null || adjustment === 0) return undefined;

  const source = sourceFor(workbook, fileName, "Ppto ", `F${row}`);
  if (chapter === "internal-urbanism") {
    if (baseRate === 0) {
      failCell(
        "invalid-percentage-adjustment-base",
        `No se puede calcular el porcentaje de ajuste de Ppto !F${row} con tarifa cero.`,
        "Ppto ",
        `F${row}`,
        "adjustment",
      );
    }
    return {
      kind: "percentage",
      value: adjustment / baseRate,
      label: "Ajuste de redes",
      reason:
        "Redes con diametros 5% mayores por area, tamano de apartamentos No VIS y carga electrica.",
      source,
    };
  }

  return {
    kind: "absolute",
    value: adjustment,
    label: "Ajuste de parqueaderos",
    reason:
      "Ajuste en cimentacion y estructura por tres pisos adicionales, de 5 a 8 pisos.",
    source,
  };
}

function buildScenario(
  workbook: ParsedXlsxWorkbook,
  fileName: string,
  spec: ScenarioSpec,
  references: Record<ChapterKey, CostReference>,
  issues: DataQualityIssue[],
): ScenarioInput {
  validateScenarioLayout(workbook, spec);
  const presentationText = requiredString(
    workbook,
    "Presentacion",
    spec.titleCell,
    "description",
  );
  const housingUnits = parseScenarioUnits(
    presentationText,
    spec.titleCell,
    issues,
  );
  const quantity = (chapter: ChapterKey): number =>
    requiredNumber(
      workbook,
      "Ppto ",
      `H${chapterRow(spec, chapter)}`,
      `areas.${chapter}`,
    );
  const adjustments = Object.fromEntries(
    CHAPTERS.map((chapter) => {
      const adjustment = adjustmentFor(
        workbook,
        fileName,
        spec,
        chapter,
        references[chapter].baseRate,
      );
      return adjustment ? [chapter, adjustment] : null;
    }).filter((entry): entry is [ChapterKey, RateAdjustment] => entry !== null),
  ) as Partial<Record<ChapterKey, RateAdjustment>>;

  const visBuilt = quantity("vis-towers");
  const nonVisBuilt = quantity("non-vis-towers");
  const parkingBuilt = quantity("parking-building");
  const commonBuilt = quantity("common-areas");
  const internalUrbanism = quantity("internal-urbanism");
  const preliminariesArea = quantity("preliminaries");
  const constructedArea = requiredNumber(
    workbook,
    "Presentacion",
    `${spec.presentationColumn}23`,
    "areas.constructedTotal",
  );
  const sellableVis = requiredNumber(
    workbook,
    "Presentacion",
    `${spec.presentationColumn}24`,
    "areas.sellableVis",
  );
  const sellableNonVis = requiredNumber(
    workbook,
    "Presentacion",
    `${spec.presentationColumn}25`,
    "areas.sellableNonVis",
  );
  const budgetArea = requiredNumber(
    workbook,
    "Ppto ",
    `I${spec.areaRow}`,
    "reportedArea",
  );

  differenceIssue(issues, {
    code: "constructed-area-source-mismatch",
    actual: constructedArea,
    expected: budgetArea,
    tolerance: AREA_TOLERANCE,
    message: "El area construida de Presentacion no coincide con Ppto .",
    sheet: "Presentacion",
    cell: `${spec.presentationColumn}23`,
    scenarioId: spec.id,
    field: "areas.constructedTotal",
  });
  differenceIssue(issues, {
    code: "preliminaries-area-mismatch",
    actual: preliminariesArea,
    expected: constructedArea,
    tolerance: AREA_TOLERANCE,
    message: "La base de preliminares no coincide con el area construida.",
    sheet: "Ppto ",
    cell: `H${chapterRow(spec, "preliminaries")}`,
    scenarioId: spec.id,
    chapter: "preliminaries",
  });
  differenceIssue(issues, {
    code: "built-components-area-mismatch",
    actual: visBuilt + nonVisBuilt + parkingBuilt + commonBuilt,
    expected: constructedArea,
    tolerance: AREA_TOLERANCE,
    message:
      "Las areas construidas de torres, parqueaderos y zonas comunes no concilian con el total.",
    sheet: "Ppto ",
    cell: `H${spec.firstBudgetRow}:H${spec.firstBudgetRow + 3}`,
    scenarioId: spec.id,
    field: "areas.constructedTotal",
  });

  let recomputedDirect = 0;
  for (const chapter of CHAPTERS) {
    const row = chapterRow(spec, chapter);
    const baseRate = references[chapter].baseRate;
    const importedBaseRate = requiredNumber(
      workbook,
      "Ppto ",
      `E${row}`,
      `rates.${chapter}`,
    );
    differenceIssue(issues, {
      code: "reference-rate-mismatch",
      actual: importedBaseRate,
      expected: baseRate,
      tolerance: RATE_TOLERANCE,
      message: "La tarifa base de Ppto no coincide con la referencia del catalogo.",
      sheet: "Ppto ",
      cell: `E${row}`,
      scenarioId: spec.id,
      chapter,
      field: "baseRate",
    });
    if (spec.number === 2) {
      const importedRateCell = requiredCell(workbook, "Ppto ", `E${row}`);
      const expectedFormula = normalizeFormula(
        `+'Indicadores costos'!${REFERENCE_SPECS.find((item) => item.chapter === chapter)?.rateCell ?? ""}`,
      );
      if (
        importedRateCell.formula === undefined ||
        normalizeFormula(importedRateCell.formula) !== expectedFormula
      ) {
        issues.push({
          code: "reference-formula-mismatch",
          severity: "error",
          message:
            "La formula de tarifa no apunta a la celda de catalogo esperada; no se puede afirmar su trazabilidad solo por igualdad numerica.",
          sheet: "Ppto ",
          cell: `E${row}`,
          scenarioId: spec.id,
          chapter,
          field: "baseRate",
        });
      }
    }

    const adjustment = adjustments[chapter];
    const adjustmentPerUnit = adjustment
      ? adjustment.kind === "absolute"
        ? adjustment.value
        : baseRate * adjustment.value
      : 0;
    const finalRate = baseRate + adjustmentPerUnit;
    const importedFinalRate = requiredNumber(
      workbook,
      "Ppto ",
      `G${row}`,
      `finalRates.${chapter}`,
    );
    differenceIssue(issues, {
      code: "adjusted-rate-reconciliation-difference",
      actual: importedFinalRate,
      expected: finalRate,
      tolerance: RATE_TOLERANCE,
      message: "La tarifa ajustada almacenada no coincide con tarifa base + ajuste.",
      sheet: "Ppto ",
      cell: `G${row}`,
      scenarioId: spec.id,
      chapter,
      field: "finalRate",
    });

    const recomputedLine = quantity(chapter) * finalRate;
    const storedLine = requiredNumber(
      workbook,
      "Ppto ",
      `I${row}`,
      `amounts.${chapter}`,
    );
    differenceIssue(issues, {
      code: "line-reconciliation-difference",
      actual: storedLine,
      expected: recomputedLine,
      tolerance: MONEY_TOLERANCE,
      message: "El valor almacenado no coincide con area por tarifa ajustada.",
      sheet: "Ppto ",
      cell: `I${row}`,
      scenarioId: spec.id,
      chapter,
      field: "amount",
    });
    recomputedDirect += recomputedLine;
  }

  const administrationRate = requiredNumber(
    workbook,
    "Ppto ",
    `H${spec.administrationRow}`,
    "administrationRate",
  );
  const storedAdministration = requiredNumber(
    workbook,
    "Ppto ",
    `I${spec.administrationRow}`,
    "administrationAmount",
  );
  differenceIssue(issues, {
    code: "administration-reconciliation-difference",
    actual: storedAdministration,
    expected: recomputedDirect * administrationRate,
    tolerance: MONEY_TOLERANCE,
    message: "Administracion/GG no coincide con el subtotal por la tasa.",
    sheet: "Ppto ",
    cell: `I${spec.administrationRow}`,
    scenarioId: spec.id,
    field: "administrationAmount",
  });

  const reportedBudget = requiredNumber(
    workbook,
    "Ppto ",
    `I${spec.totalRow}`,
    "reportedResults.baseBudget",
  );
  differenceIssue(issues, {
    code: "budget-reconciliation-difference",
    actual: reportedBudget,
    expected: recomputedDirect + recomputedDirect * administrationRate,
    tolerance: MONEY_TOLERANCE,
    message: "El presupuesto total no coincide con el calculo de sus partidas.",
    sheet: "Ppto ",
    cell: `I${spec.totalRow}`,
    scenarioId: spec.id,
    field: "reportedResults.baseBudget",
  });

  const reportedCostPerM2 = requiredNumber(
    workbook,
    "Ppto ",
    `I${spec.costPerM2Row}`,
    "reportedResults.costPerConstructedM2",
  );
  differenceIssue(issues, {
    code: "cost-per-m2-reconciliation-difference",
    actual: reportedCostPerM2,
    expected: reportedBudget / constructedArea,
    tolerance: MONEY_TOLERANCE,
    message: "El valor por m2 construido no coincide con total dividido por area.",
    sheet: "Ppto ",
    cell: `I${spec.costPerM2Row}`,
    scenarioId: spec.id,
    field: "reportedResults.costPerConstructedM2",
  });

  const presentationBudget = requiredNumber(
    workbook,
    "Presentacion",
    `${spec.presentationValueColumn}16`,
    "presentationBudget",
  );
  differenceIssue(issues, {
    code: "presentation-budget-mismatch",
    actual: presentationBudget,
    expected: reportedBudget,
    tolerance: MONEY_TOLERANCE,
    message: "El presupuesto de Presentacion no coincide con Ppto .",
    sheet: "Presentacion",
    cell: `${spec.presentationValueColumn}16`,
    scenarioId: spec.id,
    field: "reportedResults.baseBudget",
  });

  const externalUrbanismCell = `${spec.presentationValueColumn}20`;
  const externalUrbanism = requiredNumber(
    workbook,
    "Presentacion",
    externalUrbanismCell,
    "externalUrbanism.amount",
  );
  let externalUrbanismNote: string;
  if (spec.number === 3) {
    const externalArea = requiredNumber(
      workbook,
      "Presentacion",
      "J20",
      "externalUrbanism.area",
    );
    const externalRate = requiredNumber(
      workbook,
      "Presentacion",
      "K20",
      "externalUrbanism.rate",
    );
    differenceIssue(issues, {
      code: "external-urbanism-reconciliation-difference",
      actual: externalUrbanism,
      expected: externalArea * externalRate,
      tolerance: MONEY_TOLERANCE,
      message: "El urbanismo externo no coincide con area por tarifa.",
      sheet: "Presentacion",
      cell: externalUrbanismCell,
      scenarioId: spec.id,
      field: "externalUrbanism.amount",
    });
    externalUrbanismNote =
      `Importe separado del presupuesto base. Base informada: ${externalArea} m2 en Presentacion!J20 ` +
      `por ${externalRate} COP/m2 en Presentacion!K20.`;
  } else {
    externalUrbanismNote =
      "Importe separado del presupuesto base; el lado del escenario 2 no informa area ni tarifa.";
    issues.push({
      code: "external-urbanism-basis-missing",
      severity: "warning",
      message:
        "El escenario 2 informa el importe de urbanismo externo, pero no su area, tarifa ni justificacion documental.",
      sheet: "Presentacion",
      cell: externalUrbanismCell,
      scenarioId: spec.id,
      field: "externalUrbanism",
    });
  }

  return {
    id: spec.id,
    name: `Escenario ${spec.number}`,
    description: presentationText,
    housingUnits,
    areas: {
      constructedTotal: constructedArea,
      visBuilt,
      nonVisBuilt,
      parkingBuilt,
      commonBuilt,
      internalUrbanism,
      sellableVis,
      sellableNonVis,
    },
    referenceIds: Object.fromEntries(
      CHAPTERS.map((chapter) => [chapter, references[chapter].id]),
    ) as Record<ChapterKey, string>,
    adjustments,
    externalUrbanism: {
      amount: externalUrbanism,
      includedInBase: false,
      note: externalUrbanismNote,
      source: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        externalUrbanismCell,
        externalUrbanismNote,
      ),
    },
    context: { assetClass: "residential", structuralSystem: "S.I / S.A" },
    assumptions: [
      "Moneda interpretada como COP; el libro solo muestra el simbolo $.",
      "Urbanismo externo excluido del presupuesto base.",
      "El indicador de parqueaderos proviene de 5 pisos sin sotano; el ajuste declara tres pisos adicionales.",
      "Los resultados cacheados de formulas se conservan para conciliacion, no como reglas de calculo.",
    ],
    sources: {
      chapterQuantities: Object.fromEntries(
        CHAPTERS.map((chapter) => {
          const cell = `H${chapterRow(spec, chapter)}`;
          return [chapter, sourceFor(workbook, fileName, "Ppto ", cell)];
        }),
      ) as Record<ChapterKey, CellSource>,
      chapterAdjustments: Object.fromEntries(
        CHAPTERS.flatMap((chapter) => {
          if (!adjustments[chapter]) return [];
          const cell = `F${chapterRow(spec, chapter)}`;
          return [[chapter, sourceFor(workbook, fileName, "Ppto ", cell)]];
        }),
      ) as Partial<Record<ChapterKey, CellSource>>,
      administrationRate: sourceFor(
        workbook,
        fileName,
        "Ppto ",
        `H${spec.administrationRow}`,
        "Porcentaje actual de Pinar, separado de referencias historicas COP/mes.",
      ),
      constructedArea: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        `${spec.presentationColumn}23`,
      ),
      sellableVisArea: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        `${spec.presentationColumn}24`,
      ),
      sellableNonVisArea: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        `${spec.presentationColumn}25`,
      ),
      visUnits: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        spec.titleCell,
      ),
      nonVisUnits: sourceFor(
        workbook,
        fileName,
        "Presentacion",
        spec.titleCell,
      ),
    },
    reportedResults: {
      baseBudget: {
        value: reportedBudget,
        source: sourceFor(
          workbook,
          fileName,
          "Ppto ",
          `I${spec.totalRow}`,
        ),
      },
      costPerConstructedM2: {
        value: reportedCostPerM2,
        source: sourceFor(
          workbook,
          fileName,
          "Ppto ",
          `I${spec.costPerM2Row}`,
        ),
      },
    },
  };
}

function workbookYear(workbook: ParsedXlsxWorkbook): number {
  const heading = requiredString(
    workbook,
    "Indicadores costos",
    "B65",
    "baseYear",
  );
  const match = heading.match(/\b(20\d{2})\b/);
  if (!match) {
    failCell(
      "base-year-not-found",
      "No se encontro el ano base en Indicadores costos!B65.",
      "Indicadores costos",
      "B65",
      "baseYear",
    );
  }
  return Number(match[1]);
}

/**
 * Import the supplied workbook into the deterministic domain model.
 *
 * The source ArrayBuffer is never mutated. Invalid structure/data is returned
 * as a quality result with `workbook: null`, while reconciliation differences
 * remain attached to a model so the UI can show the imported evidence.
 */
export function importIndicadores(
  buffer: ArrayBuffer,
  sourceFileName = DEFAULT_SOURCE_FILE,
): WorkbookImportResult {
  const issues: DataQualityIssue[] = [];

  try {
    const parsed = parseXlsxWorkbook(buffer);
    const baseYear = workbookYear(parsed);
    const preferredReferences = buildReferences(
      parsed,
      sourceFileName,
      baseYear,
      issues,
    );
    const costIndicators = buildCostIndicators(
      parsed,
      sourceFileName,
      baseYear,
    );
    const references = buildCandidateReferences(
      costIndicators,
      preferredReferences,
    );
    const referencesByChapter = referenceMap(preferredReferences);
    const scenarios = SCENARIO_SPECS.map((spec) =>
      buildScenario(
        parsed,
        sourceFileName,
        spec,
        referencesByChapter,
        issues,
      ),
    );
    const administrationRate = requiredNumber(parsed, "Ppto ", "H10");
    const scenario3AdministrationRate = requiredNumber(parsed, "Ppto ", "H23");

    differenceIssue(issues, {
      code: "administration-rate-mismatch",
      actual: scenario3AdministrationRate,
      expected: administrationRate,
      tolerance: Number.EPSILON,
      message: "Los escenarios no usan la misma tasa de administracion/GG.",
      sheet: "Ppto ",
      cell: "H23",
      scenarioId: "scenario-3",
      field: "administrationRate",
    });

    issues.push(
      {
        code: "reference-provenance-incomplete",
        severity: "warning",
        message:
          "El Excel no informa ubicacion, madurez (preliminar/aprobado/ejecutado), responsable ni documento fuente de los comparables.",
        sheet: "Indicadores costos",
        field: "references",
      },
      {
        code: "structural-system-codes-unresolved",
        severity: "warning",
        message:
          "Los codigos S.I y S.A del presupuesto no estan definidos en el libro y requieren homologacion tecnica.",
        sheet: "Ppto ",
        field: "context.structuralSystem",
      },
    );

    const quality = qualityFromIssues(issues);
    const model: WorkbookModel = {
      metadata: {
        id: `indicadores-${baseYear}`,
        name: "Indicadores de costos y sensibilidades Villas del Pinar",
        sourceFileName,
        version: `${baseYear}-import-1`,
        baseYear,
        currency: "COP",
        sheetNames: ALLOWED_WORKSHEET_NAMES,
      },
      costIndicators,
      references,
      scenarios,
      config: {
        calculationVersion: "mvp-1",
        currency: "COP",
        baseYear,
        administrationRate,
        includeExternalUrbanism: false,
        reconciliationTolerance: MONEY_TOLERANCE,
        areaToleranceM2: 0.01,
      },
      quality,
    };

    return { workbook: model, quality };
  } catch (error) {
    if (error instanceof WorkbookDataError) {
      issues.push(error.issue);
    } else if (error instanceof XlsxParseError) {
      issues.push({
        code: "xlsx-parse-error",
        severity: "error",
        message: error.message,
      });
    } else {
      issues.push({
        code: "unexpected-import-error",
        severity: "error",
        message:
          error instanceof Error
            ? `No se pudo importar el archivo: ${error.message}`
            : "No se pudo importar el archivo.",
      });
    }

    const quality = qualityFromIssues(issues);
    return { workbook: null, quality };
  }
}

export const importIndicadoresXlsx = importIndicadores;
