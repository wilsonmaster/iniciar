import type { CostIndicator } from "../domain/types";

const WORKBOOK = "INDICADORES.xlsx";
const SHEET = "Indicadores costos";

type GroupSpec = Pick<
  CostIndicator,
  "groupLabel" | "project" | "projectType" | "baseYear" | "floorCount" | "context"
>;

const GROUPS = {
  "serraclara-2026": {
    groupLabel: "INDICADORES SERRACLARA-2026\n11 PISOS",
    project: "Serraclara",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 11,
    context: { assetClass: "residential", floorCount: 11 },
  },
  "serraclara-estructura-acabados": {
    groupLabel: "INDICADORES SERRACLARA- ESTRUCTURA Y ACABADOS (TORRE)",
    project: "Serraclara",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 11,
    context: { assetClass: "residential", floorCount: 11 },
  },
  "arbore-2026": {
    groupLabel: "INDICADORES ARBORE-2026\n12 PISOS",
    project: "Arbore",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 12,
    context: { assetClass: "residential", product: "non-VIS", floorCount: 12 },
  },
  "arbore-estructura-acabados": {
    groupLabel: "INDICADORES ARBORE- ESTRUCTURA Y ACABADOS",
    project: "Arbore",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 12,
    context: { assetClass: "residential", product: "non-VIS", floorCount: 12 },
  },
  "rocca-2026": {
    groupLabel: "INDICADORES ROCCA-2026\n22 PISOS",
    project: "Rocca",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 22,
    context: { assetClass: "residential", floorCount: 22 },
  },
  "rocca-estructura-acabados": {
    groupLabel: "INDICADORES ROCCA- ESTRUCTURA Y ACABADOS (TORRE)",
    project: "Rocca",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 22,
    context: { assetClass: "residential", floorCount: 22 },
  },
  "oficinas-rocca-2026": {
    groupLabel: "INDICADORES OFICINAS ROCCA-2026\n10 PISOS",
    project: "Oficinas Rocca",
    projectType: "office",
    baseYear: 2026,
    floorCount: 10,
    context: { assetClass: "office", floorCount: 10 },
  },
  "externo-casas-2026": {
    groupLabel: "INDICADORES EXTERNO CASAS-2026\n2 PISOS",
    project: "Externo Casas",
    projectType: "houses",
    baseYear: 2026,
    floorCount: 2,
    context: { assetClass: "houses", floorCount: 2 },
  },
  "oficinas-t6-2026": {
    groupLabel: "INDICADORES OFICINAS T6-2026\n16 PISOS",
    project: "Oficinas T6",
    projectType: "office",
    baseYear: 2026,
    floorCount: 16,
    context: { assetClass: "office", floorCount: 16 },
  },
  "pinar-vis-2026": {
    groupLabel: "INDICADORES PINAR VIS-2026\n13 PISOS",
    project: "Pinar VIS",
    projectType: "residential-tower",
    baseYear: 2026,
    floorCount: 13,
    context: { assetClass: "residential", product: "VIS", floorCount: 13 },
  },
} as const satisfies Record<string, GroupSpec>;

type GroupId = keyof typeof GROUPS;
type Usage = CostIndicator["usage"];
type Chapters = CostIndicator["compatibleChapters"];

type RowSpec = readonly [
  groupId: GroupId,
  row: number,
  concept: string,
  originalUnit: string,
  historicalAmount: number,
  basisQuantity: number,
  unitRate: number,
  usage: Usage,
  compatibleChapters: Chapters,
  amountFormula?: string,
  quantityFormula?: string,
  contextOverride?: Partial<CostIndicator["context"]>,
];

const PRELIMINARIES = ["preliminaries"] as const;
const PARKING = ["parking-building"] as const;
const NON_VIS_TOWERS = ["non-vis-towers"] as const;
const RESIDENTIAL_TOWERS = ["vis-towers", "non-vis-towers"] as const;
const VIS_TOWERS = ["vis-towers"] as const;
const COMMON_AREAS = ["common-areas"] as const;
const INTERNAL_URBANISM = ["internal-urbanism"] as const;
const NO_CHAPTERS = [] as const;

const ROWS = [
  ["serraclara-2026", 4, "PRELIMINARES", "m2", 2_641_335_174.9879704, 12_096, 218_364.3497840584, "selectable", PRELIMINARIES],
  ["serraclara-2026", 5, "SOTANO + 1 PISO PARQUEADEROS", "m2", 37_092_982_518.555405, 13_497, 2_748_239.054497696, "selectable", PARKING, undefined, undefined, { basementLevels: 1 }],
  ["serraclara-2026", 6, "TORRE (SOT + PNH + TORRE)", "m2", 140_592_266_013.1757, 56_007, 2_510_262.3960072077, "selectable", RESIDENTIAL_TOWERS],
  ["serraclara-2026", 7, "COMERCIO", "m2", 1_224_758_043.356665, 500, 2_449_516.08671333, "unmapped", NO_CHAPTERS],
  ["serraclara-2026", 8, "ED AMENIDADES", "m2", 7_153_997_452.115585, 2_058, 3_476_189.238151402, "selectable", COMMON_AREAS],
  ["serraclara-2026", 9, "URBANISMO INTERNO", "m2", 5_381_294_347.890665, 12_096, 444_882.13854916213, "selectable", INTERNAL_URBANISM],
  ["serraclara-2026", 10, "ADMON Y GG", "mes", 17_089_954_713.531673, 53, 322_451_975.7270127, "administration", NO_CHAPTERS],

  ["serraclara-estructura-acabados", 13, "TORRE (SOT \"E+A\"+ PNH \"E+A\" + TORRE \"E + MUROS MAM\"", "m2", 87_733_614_314.73148, 56_007, 1_566_475.874707295, "partial", NON_VIS_TOWERS, "=D6-D14", "=+E6"],
  ["serraclara-estructura-acabados", 14, "TORRE ACABADOS OBRA GRIS (TORRE)", "m2", 52_858_651_698.44422, 45_723, 1_156_062.6314643444, "partial", NON_VIS_TOWERS],

  ["arbore-2026", 18, "SOTANO - 1 NIVEL", "m2", 4_355_384_211.316841, 1_577, 2_761_816.240530654, "selectable", PARKING, undefined, undefined, { basementLevels: 1 }],
  ["arbore-2026", 19, "TORRES", "m2", 60_414_746_991.58114, 22_201, 2_721_262.4202324734, "selectable", NON_VIS_TOWERS],
  ["arbore-2026", 20, "ED PARQUEADEROS + 1 NIVEL SOTANO (4PISOS)", "m2", 19_878_081_773.30961, 9_285, 2_140_881.1818319447, "selectable", PARKING, undefined, undefined, { basementLevels: 1 }],
  ["arbore-2026", 21, "URBANISMO INTERNO ", "m2", 2_769_673_344.4142876, 6_328, 437_685.42105156253, "selectable", INTERNAL_URBANISM],

  ["arbore-estructura-acabados", 24, "TORRE ESTRUCTURA", "M2", 33_382_421_113.37703, 22_201, 1_503_644.931011082, "partial", NON_VIS_TOWERS, "=D19-D25", "=+E19"],
  ["arbore-estructura-acabados", 25, "TORRE ACABADOS (TORRE)", "m2", 27_032_325_878.20411, 22_201, 1_217_617.4892213913, "partial", NON_VIS_TOWERS],

  ["rocca-2026", 29, "PRELIMINARES", "m2", 762_869_642.313814, 4_037.33, 188_953.99739773912, "selectable", PRELIMINARIES],
  ["rocca-2026", 30, "SOTANO (SOTANO + SEMISOTANO)", "m2", 13_285_734_480.388645, 4_974.639999999999, 2_670_692.6491944436, "selectable", PARKING, undefined, undefined, { basementLevels: 1 }],
  ["rocca-2026", 31, "TORRE (SOT + SEM + PNH + TORRE )", "m2", 112_939_815_012.2728, 34_836.36, 3_242_009.642002574, "selectable", RESIDENTIAL_TOWERS],
  ["rocca-2026", 32, "ZONAS COMUNES", "m2", 7_067_179_550.466588, 2_058, 3_434_003.6688370206, "selectable", COMMON_AREAS],
  ["rocca-2026", 33, "COMERCIO", "m2", 419_331_946.088439, 588, 713_149.5681776173, "unmapped", NO_CHAPTERS],
  ["rocca-2026", 34, "URBANISMO INTERNO", "m2", 1_824_937_265.6981392, 4_037.33, 452_015.87824085203, "selectable", INTERNAL_URBANISM, undefined, "=+E29"],
  ["rocca-2026", 35, "ADMON Y GG", "mes", 14_569_403_728.78662, 35, 416_268_677.965332, "administration", NO_CHAPTERS],

  ["rocca-estructura-acabados", 38, "TORRE (SOT \"E+A\"+ PNH \"E+A\" + TORRE \"E + MUROS\"", "m2", 64_489_197_678.232216, 34_836.36, 1_851_203.675649012, "partial", NON_VIS_TOWERS, "=D31-D39", "=+E31"],
  ["rocca-estructura-acabados", 39, "TORRE ACABADOS OBRA GRIS (TORRE)", "m2", 48_450_617_334.04058, 29_185, 1_660_120.518555442, "partial", NON_VIS_TOWERS],

  ["oficinas-rocca-2026", 43, "PRELIMINARES", "m2", 996_188_748.5107051, 2_640.89, 377_217.0550498904, "selectable", PRELIMINARIES],
  ["oficinas-rocca-2026", 44, "OFICINAS + COMERCIO 10 PISOS- SIN ACABADOS", "m2", 77_509_732_595.44577, 19_376, 4_000_295.8606237494, "selectable", NON_VIS_TOWERS],
  ["oficinas-rocca-2026", 45, "SOTANOS (3 NIVELES)", "m2", 21_055_787_568.70543, 7_156, 2_942_396.2505178074, "selectable", PARKING, undefined, undefined, { basementLevels: 3 }],
  ["oficinas-rocca-2026", 46, "URBANISMO INTERNO ", "m2", 1_827_834_890.3063087, 2_640.89, 692_128.3697186589, "selectable", INTERNAL_URBANISM],
  ["oficinas-rocca-2026", 47, "ADMON Y GG", "mes", 9_229_160_360.148338, 26, 354_967_706.1595515, "administration", NO_CHAPTERS],

  ["externo-casas-2026", 51, "PRELIMINARES", "m2", 1_833_216_402.4680967, 107_950.56, 16_981.999930969294, "selectable", PRELIMINARIES],
  ["externo-casas-2026", 52, "CASAS ", "m2", 125_961_592_048.61293, 40_117.84, 3_139_789.9799344367, "selectable", NON_VIS_TOWERS],
  ["externo-casas-2026", 53, "CLUB HOUSE", "m2", 7_298_798_596.936001, 1_710, 4_268_303.273061989, "selectable", COMMON_AREAS, undefined, "=+(840+652+218)"],
  ["externo-casas-2026", 54, "URBANISMO INTERNO ", "m2", 39_791_768_700.86703, 107_950.56, 368_611.044730727, "selectable", INTERNAL_URBANISM],
  ["externo-casas-2026", 55, "ADMON Y GG", "mes", 18_592_813_003.243042, 57, 326_189_701.81128144, "administration", NO_CHAPTERS],

  ["oficinas-t6-2026", 59, "PRELIMINARES", "m2", 2_298_136_182.5337257, 8_744, 262_824.35756332637, "selectable", PRELIMINARIES],
  ["oficinas-t6-2026", 60, "OFICINAS + COMERCIO 16 PISOS- SIN ACABADOS", "m2", 233_613_016_365.88422, 55_583.84, 4_202_894.516929457, "selectable", NON_VIS_TOWERS],
  ["oficinas-t6-2026", 61, "SOTANOS (3 NIVELES + 1 SEMISOTANO)", "m2", 103_259_957_508.28944, 34_585.57, 2_985_637.0014514565, "selectable", PARKING, undefined, undefined, { basementLevels: 3 }],
  ["oficinas-t6-2026", 62, "URBANISMO INTERNO ", "m2", 13_585_165_053.57079, 8_744, 1_553_655.655714866, "selectable", INTERNAL_URBANISM],
  ["oficinas-t6-2026", 63, "ADMON Y GG", "mes", 18_822_813_306.40653, 45, 418_284_740.1423673, "administration", NO_CHAPTERS],

  ["pinar-vis-2026", 67, "PRELIMINARES", "m2", 2_020_516_257.3990211, 51_696, 39_084.576319232074, "selectable", PRELIMINARIES],
  ["pinar-vis-2026", 68, "EDIFICIO DE PARQUEADEROS (5 PISOS SIN SOTANO)", "m2", 12_131_263_497.579363, 5_434, 2_232_473.959804815, "selectable", PARKING, undefined, undefined, { basementLevels: 0 }],
  ["pinar-vis-2026", 69, "ZONAS CUMUNES ULTIMO PISO ED PARQUEADEROS", "m2", 5_629_179_422.543735, 1_439, 3_911_868.9524278906, "selectable", COMMON_AREAS],
  ["pinar-vis-2026", 70, "TORRES VIS- 13 PISOS", "m2", 96_880_603_851.5188, 44_823, 2_161_403.829541057, "selectable", VIS_TOWERS],
  ["pinar-vis-2026", 71, "URBANISMO INTERNO ", "m2", 10_358_358_058.21512, 12_963, 799_071.0528593011, "selectable", INTERNAL_URBANISM],
  ["pinar-vis-2026", 72, "ADMON Y GG", "mes", 16_035_622_253.590855, 28, 572_700_794.771102, "administration", NO_CHAPTERS],
] as const satisfies readonly RowSpec[];

function source(
  column: "D" | "E" | "H",
  row: number,
  value: number,
  formula?: string,
): CostIndicator["source"] {
  return {
    workbook: WORKBOOK,
    sheet: SHEET,
    cell: `${column}${row}`,
    ...(formula === undefined ? {} : { formula, cachedValue: value }),
  };
}

export const DEFAULT_COST_INDICATORS: readonly CostIndicator[] = ROWS.map(
  ([
    groupId,
    row,
    concept,
    originalUnit,
    historicalAmount,
    basisQuantity,
    unitRate,
    usage,
    compatibleChapters,
    amountFormula,
    quantityFormula,
    contextOverride,
  ]) => {
    const group = GROUPS[groupId];

    return {
      id: `${groupId}-r${row}`,
      groupId,
      ...group,
      concept,
      originalUnit,
      historicalAmount,
      basisQuantity,
      unitRate,
      adjustmentPerUnit: 0,
      finalRate: unitRate,
      usage,
      compatibleChapters,
      context: { ...group.context, ...contextOverride },
      source: source("H", row, unitRate, `=+F${row}+G${row}`),
      amountSource: source("D", row, historicalAmount, amountFormula),
      quantitySource: source("E", row, basisQuantity, quantityFormula),
    } satisfies CostIndicator;
  },
);
