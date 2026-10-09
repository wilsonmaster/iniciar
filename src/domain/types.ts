/** Stable identifiers shared by the estimator, importers and the UI. */
export const CHAPTER_KEYS = [
  "vis-towers",
  "non-vis-towers",
  "parking-building",
  "common-areas",
  "internal-urbanism",
  "preliminaries",
] as const;

export type ChapterKey = (typeof CHAPTER_KEYS)[number];
export type CostChapter = ChapterKey;

export type CurrencyCode = "COP" | (string & {});
export type QuantityUnit = "m2";
export type RateUnit = "COP/m2";

export type ReviewStatus =
  | "validated"
  | "needs-review"
  | "not-comparable";

export type CalculationStatus = "complete" | "needs-review" | "blocked";

/**
 * Trace back to the original workbook. `cachedValue` is documentary only: the
 * estimator always recomputes its result from inputs and never trusts it as a
 * formula result.
 */
export interface CellSource {
  workbook: string;
  sheet: string;
  cell: string;
  formula?: string;
  cachedValue?: number;
  note?: string;
}

export type SourceTrace = CellSource;

export interface SourcedNumber {
  value: number;
  source: CellSource;
}

interface AdjustmentMetadata {
  label: string;
  reason: string;
  source?: CellSource;
  authorizedBy?: string;
}

/** A percentage is expressed as a decimal: 5% is stored as `0.05`. */
export type RateAdjustment =
  | (AdjustmentMetadata & {
      kind: "absolute";
      /** COP/m2 added to the base rate. */
      value: number;
    })
  | (AdjustmentMetadata & {
      kind: "percentage";
      /** Decimal fraction applied to the base rate. */
      value: number;
    });

export interface ReferenceContext {
  assetClass: "residential" | "office" | "houses" | "mixed";
  product?: "VIS" | "non-VIS" | "mixed";
  floorCount?: number;
  basementLevels?: number;
  structuralSystem?: string;
}

/** A validated historic unit rate. Adjustments belong to each scenario. */
export interface CostReference {
  id: string;
  chapter: ChapterKey;
  /** Link to the original row in the complete historical catalogue. */
  catalogIndicatorId?: string;
  label: string;
  project: string;
  baseYear: number;
  currency: CurrencyCode;
  quantityUnit: QuantityUnit;
  rateUnit: RateUnit;
  baseRate: number;
  source: CellSource;
  scope: string;
  exclusions: readonly string[];
  context: ReferenceContext;
  reviewStatus: ReviewStatus;
}

export type ProjectType = "residential-tower" | "office" | "houses";

/**
 * How a row from `Indicadores costos` can participate in a budget.
 *
 * `partial`, `administration` and `unmapped` rows remain visible in the
 * catalogue, but are not silently offered as complete COP/m2 references.
 */
export type CostIndicatorUsage =
  | "selectable"
  | "partial"
  | "administration"
  | "unmapped";

/** A faithful, row-level representation of the historical cost catalogue. */
export interface CostIndicator {
  id: string;
  groupId: string;
  groupLabel: string;
  project: string;
  projectType: ProjectType;
  baseYear: number;
  floorCount?: number;
  concept: string;
  originalUnit: string;
  historicalAmount: number;
  basisQuantity: number;
  unitRate: number;
  adjustmentPerUnit: number;
  finalRate: number;
  usage: CostIndicatorUsage;
  compatibleChapters: readonly ChapterKey[];
  context: ReferenceContext;
  source: CellSource;
  amountSource: CellSource;
  quantitySource: CellSource;
}

export interface ScenarioAreas {
  constructedTotal: number;
  visBuilt: number;
  nonVisBuilt: number;
  parkingBuilt: number;
  commonBuilt: number;
  internalUrbanism: number;
  sellableVis?: number;
  sellableNonVis?: number;
}

export interface HousingUnits {
  vis: number;
  nonVis: number;
}

export interface ScenarioContext {
  assetClass: ReferenceContext["assetClass"];
  parkingFloorCount?: number;
  parkingBasementLevels?: number;
  structuralSystem?: string;
}

export interface ExternalUrbanismInput {
  amount: number;
  /** True only when the amount is already contained in one of the base rows. */
  includedInBase: boolean;
  source?: CellSource;
  note?: string;
}

export interface ScenarioSources {
  chapterQuantities?: Partial<Record<ChapterKey, CellSource>>;
  chapterAdjustments?: Partial<Record<ChapterKey, CellSource>>;
  administrationRate?: CellSource;
  constructedArea?: CellSource;
  sellableVisArea?: CellSource;
  sellableNonVisArea?: CellSource;
  visUnits?: CellSource;
  nonVisUnits?: CellSource;
}

export interface ScenarioReportedResults {
  baseBudget?: SourcedNumber;
  costPerConstructedM2?: SourcedNumber;
}

export interface ScenarioInput {
  id: string;
  name: string;
  description?: string;
  housingUnits: HousingUnits;
  parkingSpaces?: number;
  areas: ScenarioAreas;
  referenceIds: Record<ChapterKey, string>;
  adjustments: Partial<Record<ChapterKey, RateAdjustment>>;
  externalUrbanism?: ExternalUrbanismInput;
  context: ScenarioContext;
  assumptions: readonly string[];
  sources?: ScenarioSources;
  reportedResults?: ScenarioReportedResults;
}

export interface EstimateConfig {
  calculationVersion: string;
  currency: CurrencyCode;
  baseYear: number;
  /** Decimal fraction applied once to the six direct chapters. */
  administrationRate: number;
  /** Selects the reported total; both base and consolidated totals are returned. */
  includeExternalUrbanism: boolean;
  /** Maximum accepted difference when reconciling a workbook cached result. */
  reconciliationTolerance: number;
  /** Tolerance used when checking that component built areas reconcile. */
  areaToleranceM2: number;
}

export interface EstimateLineItem {
  chapter: ChapterKey;
  label: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  baseRate: number;
  adjustment: RateAdjustment | null;
  adjustmentPerUnit: number;
  finalRate: number;
  rateUnit: RateUnit;
  amount: number;
  referenceId: string;
  referenceProject: string;
  rateSource: CellSource;
  quantitySource?: CellSource;
  reviewStatus: ReviewStatus;
  scope: string;
  exclusions: readonly string[];
}

export interface AdministrationAndGeneral {
  rate: number;
  basis: number;
  amount: number;
  source?: CellSource;
}

export interface ExternalUrbanismResult {
  amount: number;
  alreadyIncludedInBase: boolean;
  addedToConsolidatedBudget: number;
  includedInSelectedBudget: boolean;
  source?: CellSource;
}

export interface EstimateIndicators {
  basis: "base-budget";
  constructedArea: number;
  sellableArea: number | null;
  housingUnits: number | null;
  costPerConstructedM2: number | null;
  costPerSellableM2: number | null;
  costPerHousingUnit: number | null;
  parkingCostPerSpace: number | null;
}

export type EstimateWarningCode =
  | "missing-reference"
  | "duplicate-reference"
  | "invalid-reference"
  | "unvalidated-reference"
  | "incompatible-reference"
  | "invalid-input"
  | "area-mismatch"
  | "sellable-area-missing"
  | "sellable-area-exceeds-constructed"
  | "housing-units-missing"
  | "product-area-without-units"
  | "product-units-without-area"
  | "parking-spaces-missing"
  | "parking-reference-floor-mismatch"
  | "external-urbanism-already-included"
  | "source-reconciliation-difference";

export interface EstimateWarning {
  code: EstimateWarningCode;
  severity: "info" | "warning" | "error";
  message: string;
  field?: string;
  chapter?: ChapterKey;
  source?: CellSource;
  difference?: number;
}

export interface EstimateResult {
  scenarioId: string;
  scenarioName: string;
  calculationVersion: string;
  currency: CurrencyCode;
  status: CalculationStatus;
  lineItems: readonly EstimateLineItem[];
  directCostSubtotal: number;
  administrationAndGeneral: AdministrationAndGeneral;
  baseBudget: number;
  externalUrbanism: ExternalUrbanismResult;
  budgetWithExternalUrbanism: number;
  selectedBudget: number;
  indicators: EstimateIndicators;
  warnings: readonly EstimateWarning[];
}

export type DataQualitySeverity = "info" | "warning" | "error";

export interface DataQualityIssue {
  code: string;
  severity: DataQualitySeverity;
  message: string;
  sheet?: string;
  cell?: string;
  scenarioId?: string;
  chapter?: ChapterKey;
  field?: string;
}

export interface WorkbookMetadata {
  id: string;
  name: string;
  sourceFileName: string;
  version: string;
  baseYear: number;
  currency: CurrencyCode;
  sheetNames: readonly string[];
}

export interface WorkbookQuality {
  status: "validated" | "needs-review" | "invalid";
  issues: readonly DataQualityIssue[];
}

export interface WorkbookModel {
  metadata: WorkbookMetadata;
  /** All rows found in the `Indicadores costos` sheet. */
  costIndicators: readonly CostIndicator[];
  /** Normalized, selectable references used by the estimator. */
  references: readonly CostReference[];
  scenarios: readonly ScenarioInput[];
  config: EstimateConfig;
  quality: WorkbookQuality;
}

export type WorkbookData = WorkbookModel;

export interface WorkbookImportResult {
  workbook: WorkbookModel | null;
  quality: WorkbookQuality;
}
