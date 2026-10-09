import type {
  CellSource,
  CostReference,
  EstimateConfig,
  ScenarioInput,
  WorkbookModel,
} from "../domain/types";
import { buildCandidateReferences } from "../domain/referenceCandidates";
import { DEFAULT_COST_INDICATORS } from "./defaultCostIndicators";

const SOURCE_FILE = "INDICADORES.xlsx";
const COST_SHEET = "Indicadores costos";
const BUDGET_SHEET = "Ppto ";
const PRESENTATION_SHEET = "Presentacion";

function source(
  sheet: string,
  cell: string,
  cachedValue?: number,
  formula?: string,
  note?: string,
): CellSource {
  return {
    workbook: SOURCE_FILE,
    sheet,
    cell,
    ...(formula === undefined ? {} : { formula }),
    ...(cachedValue === undefined ? {} : { cachedValue }),
    ...(note === undefined ? {} : { note }),
  };
}

export const DEFAULT_REFERENCE_IDS = {
  "vis-towers": "pinar-vis-towers-2026",
  "non-vis-towers": "arbore-non-vis-towers-2026",
  "parking-building": "pinar-parking-building-2026",
  "common-areas": "pinar-common-areas-2026",
  "internal-urbanism": "pinar-internal-urbanism-2026",
  preliminaries: "pinar-preliminaries-2026",
} as const;

const DEFAULT_PREFERRED_REFERENCES = [
  {
    id: DEFAULT_REFERENCE_IDS["vis-towers"],
    chapter: "vis-towers",
    catalogIndicatorId: "pinar-vis-2026-r70",
    label: "Torres VIS",
    project: "Pinar VIS",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 2_161_403.829541057,
    source: source(
      COST_SHEET,
      "H70",
      2_161_403.829541057,
      "=+F70+G70",
      "Ppto !E4 enlaza este indicador; Ppto !E17 enlaza E4.",
    ),
    scope: "TORRES VIS- 13 PISOS",
    exclusions: ["El archivo no documenta exclusiones detalladas."],
    context: {
      assetClass: "residential",
      product: "VIS",
      floorCount: 13,
    },
    reviewStatus: "validated",
  },
  {
    id: DEFAULT_REFERENCE_IDS["non-vis-towers"],
    chapter: "non-vis-towers",
    catalogIndicatorId: "arbore-2026-r19",
    label: "Torres No VIS",
    project: "Arbore",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 2_721_262.4202324734,
    source: source(
      COST_SHEET,
      "F19",
      2_721_262.4202324734,
      "=D19/E19",
      "Ppto !E5 enlaza este indicador; Ppto !E18 enlaza E5.",
    ),
    scope: "TORRES — Arbore 2026, 12 pisos",
    exclusions: ["El archivo no documenta exclusiones detalladas."],
    context: {
      assetClass: "residential",
      product: "non-VIS",
      floorCount: 12,
    },
    reviewStatus: "validated",
  },
  {
    id: DEFAULT_REFERENCE_IDS["parking-building"],
    chapter: "parking-building",
    catalogIndicatorId: "pinar-vis-2026-r68",
    label: "Edificio de parqueaderos",
    project: "Pinar VIS",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 2_232_473.959804815,
    source: source(
      COST_SHEET,
      "H68",
      2_232_473.959804815,
      "=+F68+G68",
      "Ppto !E6 enlaza este indicador; Ppto !E19 enlaza E6.",
    ),
    scope: "EDIFICIO DE PARQUEADEROS (5 PISOS SIN SOTANO)",
    exclusions: [
      "No incluye validación automática para edificios de distinta altura.",
    ],
    context: {
      assetClass: "residential",
      product: "mixed",
      floorCount: 5,
      basementLevels: 0,
    },
    reviewStatus: "validated",
  },
  {
    id: DEFAULT_REFERENCE_IDS["common-areas"],
    chapter: "common-areas",
    catalogIndicatorId: "pinar-vis-2026-r69",
    label: "Zonas comunes",
    project: "Pinar VIS",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 3_911_868.9524278906,
    source: source(
      COST_SHEET,
      "F69",
      3_911_868.9524278906,
      "=D69/E69",
      "Ppto !E7 enlaza este indicador; Ppto !E20 enlaza E7.",
    ),
    scope: "ZONAS CUMUNES ULTIMO PISO ED PARQUEADEROS",
    exclusions: ["El archivo no documenta exclusiones detalladas."],
    context: {
      assetClass: "residential",
      product: "VIS",
    },
    reviewStatus: "validated",
  },
  {
    id: DEFAULT_REFERENCE_IDS["internal-urbanism"],
    chapter: "internal-urbanism",
    catalogIndicatorId: "pinar-vis-2026-r71",
    label: "Urbanismo interno",
    project: "Pinar VIS",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 799_071.0528593011,
    source: source(
      COST_SHEET,
      "H71",
      799_071.0528593011,
      "=+F71+G71",
      "Ppto !E8 enlaza este indicador; Ppto !E21 enlaza E8.",
    ),
    scope: "URBANISMO INTERNO",
    exclusions: ["El archivo no documenta exclusiones detalladas."],
    context: {
      assetClass: "residential",
      product: "mixed",
    },
    reviewStatus: "validated",
  },
  {
    id: DEFAULT_REFERENCE_IDS.preliminaries,
    chapter: "preliminaries",
    catalogIndicatorId: "pinar-vis-2026-r67",
    label: "Preliminares",
    project: "Pinar VIS",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 39_084.576319232074,
    source: source(
      COST_SHEET,
      "H67",
      39_084.576319232074,
      "=+F67+G67",
      "Ppto !E9 enlaza este indicador; Ppto !E22 enlaza E9.",
    ),
    scope: "PRELIMINARES",
    exclusions: ["El archivo no documenta exclusiones detalladas."],
    context: {
      assetClass: "residential",
      product: "mixed",
    },
    reviewStatus: "validated",
  },
] as const satisfies readonly CostReference[];

export const DEFAULT_REFERENCES = buildCandidateReferences(
  DEFAULT_COST_INDICATORS,
  DEFAULT_PREFERRED_REFERENCES,
);

export const DEFAULT_ESTIMATE_CONFIG: EstimateConfig = {
  calculationVersion: "indicadores-2026-v1",
  currency: "COP",
  baseYear: 2026,
  administrationRate: 0.11,
  includeExternalUrbanism: false,
  reconciliationTolerance: 0.01,
  areaToleranceM2: 0.01,
};

const PARKING_ADJUSTMENT_VALUE = 122_185.41222257512;
const EXTERNAL_URBANISM_VALUE = 16_318_079_700;

const scenario2: ScenarioInput = {
  id: "scenario-2",
  name: "Escenario 2 · 724 VIS / 284 No VIS",
  description: "Sensibilidad Villas del Pinar — 1.008 viviendas.",
  housingUnits: { vis: 724, nonVis: 284 },
  areas: {
    constructedTotal: 53_285.94000000001,
    visBuilt: 24_043.059999999998,
    nonVisBuilt: 18_973.95000000001,
    parkingBuilt: 9_576,
    commonBuilt: 692.9300000000003,
    internalUrbanism: 12_963.250000000002,
    sellableVis: 20_493.529999999995,
    sellableNonVis: 15_040.709736238285,
  },
  referenceIds: { ...DEFAULT_REFERENCE_IDS },
  adjustments: {
    "parking-building": {
      kind: "absolute",
      value: PARKING_ADJUSTMENT_VALUE,
      label: "Ajuste por tres pisos adicionales",
      reason: "Ajuste en CIM + estructura: de 5 a 8 pisos.",
      source: source(
        BUDGET_SHEET,
        "F6",
        PARKING_ADJUSTMENT_VALUE,
        undefined,
        "Comentario: AJUSTE EN CIM + ESTRUCTURA -3 PISOS ADICIONALES DE 5 A 8 PISOS.",
      ),
    },
    "internal-urbanism": {
      kind: "percentage",
      value: 0.05,
      label: "Ajuste de redes",
      reason:
        "Redes con mayores diámetros por área, tamaño de apartamentos No VIS y carga eléctrica.",
      source: source(
        BUDGET_SHEET,
        "F8",
        39_953.552642965056,
        "=E8*5%",
      ),
    },
  },
  externalUrbanism: {
    amount: EXTERNAL_URBANISM_VALUE,
    includedInBase: false,
    source: source(PRESENTATION_SHEET, "F20", EXTERNAL_URBANISM_VALUE),
    note: "Valor fijo presentado por separado del presupuesto base.",
  },
  context: {
    assetClass: "residential",
    parkingFloorCount: 8,
    parkingBasementLevels: 0,
  },
  assumptions: [
    "Las cantidades de vivienda se extrajeron del texto de Presentacion!D3.",
    "El ajuste de parqueaderos corresponde a pasar de 5 a 8 pisos y requiere validación técnica.",
    "El urbanismo externo no está incluido en Ppto !I11.",
  ],
  sources: {
    chapterQuantities: {
      "vis-towers": source(BUDGET_SHEET, "H4", 24_043.059999999998),
      "non-vis-towers": source(
        BUDGET_SHEET,
        "H5",
        18_973.95000000001,
      ),
      "parking-building": source(BUDGET_SHEET, "H6", 9_576),
      "common-areas": source(BUDGET_SHEET, "H7", 692.9300000000003),
      "internal-urbanism": source(
        BUDGET_SHEET,
        "H8",
        12_963.250000000002,
      ),
      preliminaries: source(BUDGET_SHEET, "H9", 53_285.94000000001),
    },
    chapterAdjustments: {
      "parking-building": source(
        BUDGET_SHEET,
        "F6",
        PARKING_ADJUSTMENT_VALUE,
      ),
      "internal-urbanism": source(
        BUDGET_SHEET,
        "F8",
        39_953.552642965056,
        "=E8*5%",
      ),
    },
    administrationRate: source(
      BUDGET_SHEET,
      "H10",
      0.11,
      undefined,
      "Comentario: % ACTUAL PINAR.",
    ),
    constructedArea: source(
      PRESENTATION_SHEET,
      "D23",
      53_285.94000000001,
    ),
    sellableVisArea: source(
      PRESENTATION_SHEET,
      "D24",
      20_493.529999999995,
    ),
    sellableNonVisArea: source(
      PRESENTATION_SHEET,
      "D25",
      15_040.709736238285,
    ),
    visUnits: source(
      PRESENTATION_SHEET,
      "D3",
      undefined,
      undefined,
      "724 VIS en el texto de la celda.",
    ),
    nonVisUnits: source(
      PRESENTATION_SHEET,
      "D3",
      undefined,
      undefined,
      "284 NO VIS en el texto de la celda.",
    ),
  },
  reportedResults: {
    baseBudget: {
      value: 157_417_838_654.75873,
      source: source(
        BUDGET_SHEET,
        "I11",
        157_417_838_654.75873,
        "=SUM(I4:I10)",
      ),
    },
    costPerConstructedM2: {
      value: 2_954_209.6593352524,
      source: source(
        BUDGET_SHEET,
        "I13",
        2_954_209.6593352524,
        "=I11/I12",
      ),
    },
  },
};

const scenario3: ScenarioInput = {
  id: "scenario-3",
  name: "Escenario 3 · 982 VIS / 181 No VIS",
  description: "Sensibilidad Villas del Pinar — 1.163 viviendas.",
  housingUnits: { vis: 982, nonVis: 181 },
  areas: {
    constructedTotal: 53_285.939999999995,
    visBuilt: 32_575.579999999994,
    nonVisBuilt: 11_587.68,
    parkingBuilt: 8_136,
    commonBuilt: 986.6800000000003,
    internalUrbanism: 12_963.250000000002,
    sellableVis: 27_810.479999999992,
    sellableNonVis: 9_065.64,
  },
  referenceIds: { ...DEFAULT_REFERENCE_IDS },
  adjustments: {
    "parking-building": {
      kind: "absolute",
      value: PARKING_ADJUSTMENT_VALUE,
      label: "Ajuste por tres pisos adicionales",
      reason: "Ajuste en CIM + estructura: de 5 a 8 pisos.",
      source: source(
        BUDGET_SHEET,
        "F19",
        PARKING_ADJUSTMENT_VALUE,
        undefined,
        "Comentario: AJUSTE EN CIM + ESTRUCTURA -3 PISOS ADICIONALES DE 5 A 8 PISOS.",
      ),
    },
    "internal-urbanism": {
      kind: "percentage",
      value: 0.05,
      label: "Ajuste de redes",
      reason:
        "Redes con mayores diámetros por área, tamaño de apartamentos No VIS y carga eléctrica.",
      source: source(
        BUDGET_SHEET,
        "F21",
        39_953.552642965056,
        "=E21*5%",
      ),
    },
  },
  externalUrbanism: {
    amount: EXTERNAL_URBANISM_VALUE,
    includedInBase: false,
    source: source(PRESENTATION_SHEET, "L20", EXTERNAL_URBANISM_VALUE),
    note: "Valor fijo presentado por separado del presupuesto base.",
  },
  context: {
    assetClass: "residential",
    parkingFloorCount: 8,
    parkingBasementLevels: 0,
  },
  assumptions: [
    "Las cantidades de vivienda se extrajeron del texto de Presentacion!J3.",
    "El ajuste de parqueaderos corresponde a pasar de 5 a 8 pisos y requiere validación técnica.",
    "El urbanismo externo no está incluido en Ppto !I24 ni Presentacion!L16.",
  ],
  sources: {
    chapterQuantities: {
      "vis-towers": source(BUDGET_SHEET, "H17", 32_575.579999999994),
      "non-vis-towers": source(BUDGET_SHEET, "H18", 11_587.68),
      "parking-building": source(BUDGET_SHEET, "H19", 8_136),
      "common-areas": source(BUDGET_SHEET, "H20", 986.6800000000003),
      "internal-urbanism": source(
        BUDGET_SHEET,
        "H21",
        12_963.250000000002,
      ),
      preliminaries: source(BUDGET_SHEET, "H22", 53_285.939999999995),
    },
    chapterAdjustments: {
      "parking-building": source(
        BUDGET_SHEET,
        "F19",
        PARKING_ADJUSTMENT_VALUE,
      ),
      "internal-urbanism": source(
        BUDGET_SHEET,
        "F21",
        39_953.552642965056,
        "=E21*5%",
      ),
    },
    administrationRate: source(
      BUDGET_SHEET,
      "H23",
      0.11,
      undefined,
      "Comentario: % ACTUAL PINAR.",
    ),
    constructedArea: source(
      PRESENTATION_SHEET,
      "J23",
      53_285.939999999995,
    ),
    sellableVisArea: source(
      PRESENTATION_SHEET,
      "J24",
      27_810.479999999992,
    ),
    sellableNonVisArea: source(PRESENTATION_SHEET, "J25", 9_065.64),
    visUnits: source(
      PRESENTATION_SHEET,
      "J3",
      undefined,
      undefined,
      "982 VIS en el texto de la celda.",
    ),
    nonVisUnits: source(
      PRESENTATION_SHEET,
      "J3",
      undefined,
      undefined,
      "181 NO VIS en el texto de la celda.",
    ),
  },
  reportedResults: {
    baseBudget: {
      value: 153_089_553_978.72025,
      source: source(
        PRESENTATION_SHEET,
        "L16",
        153_089_553_978.72025,
        "=SUM(L14,L11)",
        "Ppto !I24 conserva 153089553978.72021; la diferencia es 0.00004 COP por orden de suma binaria.",
      ),
    },
    costPerConstructedM2: {
      value: 2_872_982.140855923,
      source: source(
        PRESENTATION_SHEET,
        "M16",
        2_872_982.140855923,
        "=L16/$J$23",
      ),
    },
  },
};

export const DEFAULT_SCENARIOS = [scenario2, scenario3] as const satisfies
  readonly ScenarioInput[];

export type DefaultScenarioId = (typeof DEFAULT_SCENARIOS)[number]["id"];

export const DEFAULT_WORKBOOK: WorkbookModel = {
  metadata: {
    id: "indicadores-cabidas-2026",
    name: "Indicadores y sensibilidades Villas del Pinar",
    sourceFileName: SOURCE_FILE,
    version: "2026.1",
    baseYear: 2026,
    currency: "COP",
    sheetNames: [PRESENTATION_SHEET, BUDGET_SHEET, COST_SHEET],
  },
  costIndicators: DEFAULT_COST_INDICATORS,
  references: DEFAULT_REFERENCES,
  scenarios: DEFAULT_SCENARIOS,
  config: DEFAULT_ESTIMATE_CONFIG,
  quality: {
    status: "needs-review",
    issues: [
      {
        code: "scenario-3-cached-total-difference",
        severity: "info",
        scenarioId: "scenario-3",
        sheet: BUDGET_SHEET,
        cell: "I24",
        message:
          "Ppto !I24 y Presentacion!L16 difieren 0.00004 COP por el orden de suma; se adopta L16 como valor canónico solicitado.",
      },
      {
        code: "parking-height-review",
        severity: "warning",
        chapter: "parking-building",
        sheet: BUDGET_SHEET,
        cell: "F6",
        message:
          "El referente tiene 5 pisos y el ajuste literal documenta 8; requiere validación técnica y no debe extrapolarse automáticamente.",
      },
      {
        code: "housing-units-embedded-in-text",
        severity: "info",
        sheet: PRESENTATION_SHEET,
        cell: "D3/J3",
        message:
          "Las cantidades VIS y No VIS están embebidas en texto, no en celdas numéricas estructuradas.",
      },
    ],
  },
};

function cloneCellSource(value: CellSource | undefined): CellSource | undefined {
  return value ? { ...value } : undefined;
}

function cloneScenario(value: ScenarioInput): ScenarioInput {
  return {
    ...value,
    housingUnits: { ...value.housingUnits },
    areas: { ...value.areas },
    referenceIds: { ...value.referenceIds },
    adjustments: Object.fromEntries(
      Object.entries(value.adjustments).map(([chapter, adjustment]) => [
        chapter,
        adjustment
          ? { ...adjustment, source: cloneCellSource(adjustment.source) }
          : adjustment,
      ]),
    ) as ScenarioInput["adjustments"],
    externalUrbanism: value.externalUrbanism
      ? {
          ...value.externalUrbanism,
          source: cloneCellSource(value.externalUrbanism.source),
        }
      : undefined,
    context: { ...value.context },
    assumptions: [...value.assumptions],
    sources: value.sources
      ? {
          chapterQuantities: value.sources.chapterQuantities
            ? Object.fromEntries(
                Object.entries(value.sources.chapterQuantities).map(
                  ([chapter, cellSource]) => [
                    chapter,
                    cloneCellSource(cellSource),
                  ],
                ),
              )
            : undefined,
          chapterAdjustments: value.sources.chapterAdjustments
            ? Object.fromEntries(
                Object.entries(value.sources.chapterAdjustments).map(
                  ([chapter, cellSource]) => [
                    chapter,
                    cloneCellSource(cellSource),
                  ],
                ),
              )
            : undefined,
          administrationRate: cloneCellSource(
            value.sources.administrationRate,
          ),
          constructedArea: cloneCellSource(value.sources.constructedArea),
          sellableVisArea: cloneCellSource(value.sources.sellableVisArea),
          sellableNonVisArea: cloneCellSource(
            value.sources.sellableNonVisArea,
          ),
          visUnits: cloneCellSource(value.sources.visUnits),
          nonVisUnits: cloneCellSource(value.sources.nonVisUnits),
        }
      : undefined,
    reportedResults: value.reportedResults
      ? {
          baseBudget: value.reportedResults.baseBudget
            ? {
                ...value.reportedResults.baseBudget,
                source: { ...value.reportedResults.baseBudget.source },
              }
            : undefined,
          costPerConstructedM2:
            value.reportedResults.costPerConstructedM2
              ? {
                  ...value.reportedResults.costPerConstructedM2,
                  source: {
                    ...value.reportedResults.costPerConstructedM2.source,
                  },
                }
              : undefined,
        }
      : undefined,
  };
}

/** Returns a mutable deep copy suitable for forms and scenario editing. */
export function getDefaultScenario(id: DefaultScenarioId): ScenarioInput {
  const scenario = DEFAULT_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown default scenario: ${id}`);
  }
  return cloneScenario(scenario);
}
