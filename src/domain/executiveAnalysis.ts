import type {
  BudgetDraft,
  BudgetIndicatorReference,
  CalculatedBudget,
  CalculatedBudgetLine,
} from "./budget";
import {
  filterCostIndicatorsByProject,
  projectDisplayName,
} from "./catalogProjects";
import type {
  CostIndicator,
  CostIndicatorUsage,
} from "./types";

const DEFAULT_CONCENTRATION_THRESHOLD = 0.5;
const DEFAULT_HIGH_ADJUSTMENT_THRESHOLD = 0.1;

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type ExecutiveAnalysisKind = "active-budget" | "historical-project";

export interface ExecutiveAnalysisOptions {
  /** Share of the total that triggers a concentration warning. Default: 50%. */
  concentrationThreshold?: number;
  /** Absolute rate change that triggers a review warning. Default: 10%. */
  highAdjustmentThreshold?: number;
}

export interface ExecutiveAnalysisMetrics {
  /** Evaluated total for a budget, or source-scale total for a historic project. */
  totalAmount: number;
  /** Total obtained before the editable per-unit adjustments. */
  referenceBaseAmount: number;
  adjustmentAmount: number;
  adjustmentRate: number | null;
  /** A project denominator supplied by the user. Never inferred from line quantities. */
  areaM2: number | null;
  costPerM2: number | null;
  lineCount: number;
  pricedLineCount: number;
  referenceProjectCount: number;
  largestLineShare: number | null;
  highAdjustmentLineCount: number;
  nonSelectableLineCount: number;
}

export interface ExecutiveAnalysisComparison {
  id: string;
  label: string;
  referenceProject: string;
  unit: string;
  referenceRate: number | null;
  evaluatedRate: number | null;
  differencePerUnit: number | null;
  differenceRate: number | null;
}

export interface ExecutiveCompositionLine {
  id: string;
  indicatorId: string;
  label: string;
  referenceProject: string;
  usage: CostIndicatorUsage | "missing";
  quantity: number;
  unit: string;
  referenceRate: number | null;
  evaluatedRate: number | null;
  referenceAmount: number;
  adjustmentAmount: number;
  amount: number;
  share: number | null;
  hasCalculationIssues: boolean;
}

/**
 * Serializable, presentation-neutral output for both the screen and the PDF.
 * `status`, summary and the three text arrays are directly consumable by the
 * executive-summary component. No generated timestamp is added so equal input
 * always produces equal output.
 */
export interface ExecutiveAnalysisReport {
  status: "ready";
  kind: ExecutiveAnalysisKind;
  subjectId: string;
  subjectName: string;
  summary: string;
  recommendations: readonly string[];
  clarifications: readonly string[];
  reviewPoints: readonly string[];
  methodologyNote: string;
  metrics: ExecutiveAnalysisMetrics;
  comparisons: readonly ExecutiveAnalysisComparison[];
  composition: readonly ExecutiveCompositionLine[];
  sourceYears: readonly number[];
  referenceProjects: readonly string[];
}

interface AnalysisThresholds {
  concentration: number;
  highAdjustment: number;
}

interface BudgetLineFacts {
  calculatedLine: CalculatedBudgetLine;
  indicator: BudgetIndicatorReference | null;
  referenceAmount: number;
  adjustmentAmount: number;
  adjustmentRate: number | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeProduct(left: number, right: number): number {
  const result = left * right;
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function safeSum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    const candidate = total + finiteNonNegative(value);
    if (!Number.isFinite(candidate)) return Number.MAX_VALUE;
    total = candidate;
  }
  return total;
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

function normalizedDifference(value: number, basis: number): number {
  const tolerance = Math.max(0.005, Math.abs(basis) * 1e-12);
  return Math.abs(value) < tolerance ? 0 : value;
}

function threshold(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : fallback;
}

function thresholds(options: ExecutiveAnalysisOptions): AnalysisThresholds {
  return {
    concentration: threshold(
      options.concentrationThreshold,
      DEFAULT_CONCENTRATION_THRESHOLD,
    ),
    highAdjustment: threshold(
      options.highAdjustmentThreshold,
      DEFAULT_HIGH_ADJUSTMENT_THRESHOLD,
    ),
  };
}

function formatCop(value: number): string {
  return `${copFormatter.format(finiteNonNegative(value))} COP`;
}

function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  return percentFormatter.format(Number.isFinite(value) ? value : 0);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function displayList(values: readonly string[], limit = 3): string {
  const shown = values.slice(0, limit);
  const remainder = values.length - shown.length;
  if (remainder <= 0) return shown.join(", ");
  return `${shown.join(", ")} y ${remainder} más`;
}

function commonRecommendations(sourceYears: readonly number[]): string[] {
  const yearLabel =
    sourceYears.length === 0
      ? "el año base documentado"
      : sourceYears.length === 1
        ? `${sourceYears[0]}`
        : `los años base ${sourceYears.join(", ")}`;

  return [
    `Actualizar las tarifas desde ${yearLabel} hasta el mes de corte con la serie oficial pertinente publicada por el DANE, incluido el ICOCED cuando aplique; documentar índice inicial, índice final y fórmula utilizada.`,
    "Incorporar una contingencia explícita y trazable según la madurez de diseños, cantidades y riesgos; no asumir que ya está incluida en los indicadores históricos.",
  ];
}

function commonClarifications(): string[] {
  return [
    "Este análisis es automático y determinístico: aplica reglas a los datos cargados y no consulta precios, normas ni índices en tiempo real.",
    "Los indicadores son referencias históricas; su uso no sustituye cotizaciones, cantidades de obra, diseños ni validación profesional del alcance.",
  ];
}

function commonColombiaReviewPoints(): string[] {
  return [
    "Ubicación: validar diferencias regionales de mano de obra, transporte, disponibilidad de materiales, accesos y restricciones logísticas frente a los proyectos referentes.",
    "Suelo: contrastar cimentación, excavaciones, contenciones, nivel freático y mejoramientos con el estudio geotécnico específico del predio.",
    "Licencias y servicios: confirmar costos y condiciones de licencia urbanística, curaduría o autoridad competente, conexiones y disponibilidades de servicios públicos.",
    "Impuestos y cargas: documentar si el presupuesto incluye IVA aplicable, delineación urbana, estampillas, plusvalía, valorización u otras obligaciones nacionales o territoriales.",
    "Contingencias y escalación: separar la reserva de riesgos y la actualización de precios para evitar que queden implícitas o se contabilicen dos veces.",
  ];
}

function baseMethodology(kind: ExecutiveAnalysisKind): string {
  return kind === "active-budget"
    ? "Análisis determinístico basado en cantidades, tarifas del catálogo y ajustes registrados. Las diferencias se calculan contra la tarifa base seleccionada y no constituyen una predicción de mercado."
    : "Análisis determinístico del catálogo histórico. El total excluye renglones marcados como parciales para evitar doble conteo y se presenta como escala de la fuente, no como presupuesto directamente comparable.";
}

function factsForBudget(
  calculated: CalculatedBudget,
  catalog: readonly CostIndicator[],
): BudgetLineFacts[] {
  const catalogById = new Map(
    catalog.map((indicator) => [indicator.id, indicator] as const),
  );

  return calculated.lines.map((calculatedLine) => {
    const indicator =
      calculatedLine.indicator ??
      catalogById.get(calculatedLine.indicatorId) ??
      null;
    const referenceAmount =
      calculatedLine.baseRate === null
        ? 0
        : safeProduct(calculatedLine.quantity, calculatedLine.baseRate);
    const adjustmentAmount = normalizedDifference(
      calculatedLine.amount - referenceAmount,
      referenceAmount,
    );
    const adjustmentRate =
      calculatedLine.baseRate !== null && calculatedLine.baseRate > 0
        ? calculatedLine.adjustmentPerUnit / calculatedLine.baseRate
        : null;

    return {
      calculatedLine,
      indicator,
      referenceAmount,
      adjustmentAmount,
      adjustmentRate:
        adjustmentRate !== null && Number.isFinite(adjustmentRate)
          ? adjustmentRate
          : null,
    };
  });
}

/** Creates the deterministic executive analysis for an editable/saved budget. */
export function analyzeCalculatedBudget(
  draft: BudgetDraft,
  calculated: CalculatedBudget,
  catalog: readonly CostIndicator[],
  options: ExecutiveAnalysisOptions = {},
): ExecutiveAnalysisReport {
  const limits = thresholds(options);
  const facts = factsForBudget(calculated, catalog);
  const quantifiedFacts = facts.filter(
    ({ calculatedLine }) => calculatedLine.quantity > 0,
  );
  const totalAmount = finiteNonNegative(calculated.total);
  const referenceBaseAmount = safeSum(
    facts.map(({ referenceAmount }) => referenceAmount),
  );
  const adjustmentAmount = normalizedDifference(
    totalAmount - referenceBaseAmount,
    referenceBaseAmount,
  );
  const adjustmentRate = safeRatio(adjustmentAmount, referenceBaseAmount);
  const areaM2 =
    draft.areaM2 !== undefined &&
    Number.isFinite(draft.areaM2) &&
    draft.areaM2 > 0
      ? draft.areaM2
      : null;
  const costPerM2 = areaM2 === null ? null : safeRatio(totalAmount, areaM2);
  const referenceProjects = unique(
    quantifiedFacts.flatMap(({ indicator }) =>
      indicator === null ? [] : [projectDisplayName(indicator.project)],
    ),
  );
  const sourceYears = unique(
    quantifiedFacts.flatMap(({ indicator }) =>
      indicator === null ? [] : [indicator.baseYear],
    ),
  ).sort((left, right) => left - right);

  const composition: ExecutiveCompositionLine[] = facts.map(
    ({ calculatedLine, indicator, referenceAmount, adjustmentAmount: lineAdjustment }) => ({
      id: calculatedLine.id,
      indicatorId: calculatedLine.indicatorId,
      label: indicator?.concept ?? `Indicador no encontrado (${calculatedLine.indicatorId})`,
      referenceProject: indicator === null ? "Sin referente" : projectDisplayName(indicator.project),
      usage: indicator?.usage ?? "missing",
      quantity: calculatedLine.quantity,
      unit: indicator?.originalUnit ?? "unidad",
      referenceRate: calculatedLine.baseRate,
      evaluatedRate: calculatedLine.finalRate,
      referenceAmount,
      adjustmentAmount: lineAdjustment,
      amount: calculatedLine.amount,
      share: safeRatio(calculatedLine.amount, totalAmount),
      hasCalculationIssues: calculatedLine.issues.length > 0,
    }),
  );

  const comparisons: ExecutiveAnalysisComparison[] = facts.map(
    ({ calculatedLine, indicator, adjustmentRate: lineAdjustmentRate }) => ({
      id: calculatedLine.id,
      label: indicator?.concept ?? calculatedLine.indicatorId,
      referenceProject: indicator === null ? "Sin referente" : projectDisplayName(indicator.project),
      unit: indicator?.originalUnit ?? "unidad",
      referenceRate: calculatedLine.baseRate,
      evaluatedRate: calculatedLine.finalRate,
      differencePerUnit:
        calculatedLine.baseRate === null || calculatedLine.finalRate === null
          ? null
          : normalizedDifference(
              calculatedLine.finalRate - calculatedLine.baseRate,
              calculatedLine.baseRate,
            ),
      differenceRate: lineAdjustmentRate,
    }),
  );

  const highAdjustments = quantifiedFacts.filter(
    ({ adjustmentRate: lineAdjustmentRate }) =>
      lineAdjustmentRate !== null &&
      Math.abs(lineAdjustmentRate) >= limits.highAdjustment,
  );
  const nonSelectable = quantifiedFacts.filter(
    ({ indicator }) => indicator !== null && indicator.usage !== "selectable",
  );
  const largestLine = [...composition]
    .filter(({ share }) => share !== null)
    .sort((left, right) => (right.share ?? 0) - (left.share ?? 0))[0];
  const largestLineShare = largestLine?.share ?? null;

  const recommendations = commonRecommendations(sourceYears);
  const clarifications = commonClarifications();
  const reviewPoints = commonColombiaReviewPoints();

  if (areaM2 === null) {
    recommendations.unshift(
      "Registrar el área total construida del proyecto para calcular y comparar el costo global por m².",
    );
    reviewPoints.unshift(
      "Falta el área total construida: no se calculó ni se infirió un costo global por m² a partir de cantidades de capítulos que pueden superponerse.",
    );
  }

  if (areaM2 !== null && costPerM2 === null) {
    reviewPoints.unshift(
      "No fue posible calcular un costo global por m² finito; revisar la escala del presupuesto y el área registrada.",
    );
  }

  if (totalAmount === 0) {
    reviewPoints.unshift(
      "El presupuesto no tiene valor calculado; revisar cantidades, tarifas y errores antes de usar el resumen para una decisión.",
    );
  }

  if (calculated.issues.length > 0) {
    reviewPoints.unshift(
      `Hay ${calculated.issues.length} incidencia${calculated.issues.length === 1 ? "" : "s"} de cálculo. Las líneas afectadas aportan cero hasta que se corrijan.`,
    );
  }

  if (calculated.draftId !== draft.id) {
    reviewPoints.unshift(
      "El cálculo recibido no corresponde al identificador del proyecto; regenerar el cálculo antes de exportar el informe.",
    );
  }

  if (
    largestLine !== undefined &&
    largestLineShare !== null &&
    largestLineShare >= limits.concentration
  ) {
    recommendations.unshift(
      `Validar cantidades, alcance y soporte de ${largestLine.label}, que concentra ${formatPercent(largestLineShare)} del total.`,
    );
    reviewPoints.unshift(
      `Concentración: ${largestLine.label} representa ${formatPercent(largestLineShare)} del presupuesto y puede dominar cualquier desviación.`,
    );
  }

  if (highAdjustments.length > 0) {
    const labels = highAdjustments.map(
      ({ indicator, calculatedLine }) =>
        indicator?.concept ?? calculatedLine.indicatorId,
    );
    recommendations.unshift(
      `Sustentar con cotizaciones, fecha y responsable los ajustes iguales o superiores a ${formatPercent(limits.highAdjustment)}: ${displayList(labels)}.`,
    );
    reviewPoints.unshift(
      `${highAdjustments.length} línea${highAdjustments.length === 1 ? " tiene" : "s tienen"} un ajuste alto frente a su tarifa base.`,
    );
  }

  if (nonSelectable.length > 0) {
    const labels = nonSelectable.map(
      ({ indicator }) => indicator?.concept ?? "Indicador sin clasificar",
    );
    reviewPoints.unshift(
      `Se usaron ${nonSelectable.length} indicador${nonSelectable.length === 1 ? "" : "es"} no clasificado${nonSelectable.length === 1 ? "" : "s"} como referente completo (${displayList(labels)}); revisar solapamientos y alcance antes de aprobar.`,
    );
  }

  if (referenceProjects.length > 1) {
    recommendations.unshift(
      "Documentar por qué cada referente es comparable en tipología, altura, especificación, localización, fecha y alcance.",
    );
    reviewPoints.unshift(
      `El presupuesto mezcla indicadores de ${referenceProjects.length} proyectos (${displayList(referenceProjects)}); la mezcla no garantiza comparabilidad por sí sola.`,
    );
  }

  if (sourceYears.length > 1) {
    clarifications.push(
      `Las referencias combinan años base distintos (${sourceYears.join(", ")}); deben llevarse a un mismo mes de corte antes de compararlas.`,
    );
  } else if (sourceYears.length === 1) {
    clarifications.push(
      `Las tarifas provienen de referencias con año base ${sourceYears[0]}; no se asumió actualización automática al mes actual.`,
    );
  }

  const summary =
    totalAmount === 0
      ? `${draft.name} aún no tiene un valor calculado utilizable. El análisis identificó los datos que deben completarse antes de comparar o exportar.`
      : areaM2 === null
        ? `${draft.name} suma ${formatCop(totalAmount)} en ${composition.length} línea${composition.length === 1 ? "" : "s"}. No se calculó costo global por m² porque falta un área total independiente.`
        : costPerM2 === null
          ? `${draft.name} suma ${formatCop(totalAmount)}, pero la relación con ${formatNumber(areaM2)} m² excede el rango numérico utilizable y debe revisarse.`
          : `${draft.name} suma ${formatCop(totalAmount)} para ${formatNumber(areaM2)} m², equivalente a ${formatCop(costPerM2)} por m². El ajuste neto frente a las tarifas base es ${adjustmentRate === null ? "no calculable" : formatPercent(adjustmentRate)}.`;

  return {
    status: "ready",
    kind: "active-budget",
    subjectId: draft.id,
    subjectName: draft.name,
    summary,
    recommendations,
    clarifications,
    reviewPoints,
    methodologyNote: baseMethodology("active-budget"),
    metrics: {
      totalAmount,
      referenceBaseAmount,
      adjustmentAmount,
      adjustmentRate,
      areaM2,
      costPerM2,
      lineCount: composition.length,
      pricedLineCount: composition.filter(({ amount }) => amount > 0).length,
      referenceProjectCount: referenceProjects.length,
      largestLineShare,
      highAdjustmentLineCount: highAdjustments.length,
      nonSelectableLineCount: nonSelectable.length,
    },
    comparisons,
    composition,
    sourceYears,
    referenceProjects,
  };
}

/**
 * Creates a summary for one historical project in the indicator catalogue.
 * Partial rows are still acknowledged but excluded from the rollup because
 * they are breakdowns of complete rows and would otherwise be double-counted.
 */
export function analyzeHistoricalProject(
  project: string,
  catalog: readonly CostIndicator[],
  options: ExecutiveAnalysisOptions = {},
): ExecutiveAnalysisReport {
  const limits = thresholds(options);
  const projectName = projectDisplayName(project) || "Proyecto histórico";
  const projectIndicators = filterCostIndicatorsByProject(catalog, project);
  const includedIndicators = projectIndicators.filter(
    ({ usage }) => usage !== "partial",
  );
  const partialIndicators = projectIndicators.filter(
    ({ usage }) => usage === "partial",
  );
  const totalAmount = safeSum(
    includedIndicators.map(({ historicalAmount }) => historicalAmount),
  );
  const sourceYears = unique(
    projectIndicators.map(({ baseYear }) => baseYear),
  ).sort((left, right) => left - right);

  const composition: ExecutiveCompositionLine[] = includedIndicators.map(
    (indicator) => {
      const amount = finiteNonNegative(indicator.historicalAmount);
      return {
        id: indicator.id,
        indicatorId: indicator.id,
        label: indicator.concept,
        referenceProject: projectDisplayName(indicator.project),
        usage: indicator.usage,
        quantity: finiteNonNegative(indicator.basisQuantity),
        unit: indicator.originalUnit,
        referenceRate: finiteNonNegative(indicator.unitRate),
        evaluatedRate: finiteNonNegative(indicator.finalRate),
        referenceAmount: amount,
        adjustmentAmount: 0,
        amount,
        share: safeRatio(amount, totalAmount),
        hasCalculationIssues: false,
      };
    },
  );

  const comparisons: ExecutiveAnalysisComparison[] = includedIndicators.map(
    (indicator) => {
      const referenceRate = finiteNonNegative(indicator.unitRate);
      const evaluatedRate = finiteNonNegative(indicator.finalRate);
      const differencePerUnit = normalizedDifference(
        evaluatedRate - referenceRate,
        referenceRate,
      );
      return {
        id: indicator.id,
        label: indicator.concept,
        referenceProject: projectDisplayName(indicator.project),
        unit: indicator.originalUnit,
        referenceRate,
        evaluatedRate,
        differencePerUnit,
        differenceRate:
          referenceRate > 0 ? differencePerUnit / referenceRate : null,
      };
    },
  );

  const largestLine = [...composition]
    .filter(({ share }) => share !== null)
    .sort((left, right) => (right.share ?? 0) - (left.share ?? 0))[0];
  const largestLineShare = largestLine?.share ?? null;
  const nonSelectable = includedIndicators.filter(
    ({ usage }) => usage !== "selectable",
  );
  const recommendations = commonRecommendations(sourceYears);
  const clarifications = commonClarifications();
  const reviewPoints = commonColombiaReviewPoints();

  recommendations.unshift(
    "Registrar un área total construida y homologar alcance, unidad y fecha antes de convertir esta referencia histórica en costo por m² de un proyecto nuevo.",
  );
  reviewPoints.unshift(
    "No se infirió un área total del proyecto histórico: las cantidades de sus capítulos pueden tener bases distintas o superponerse.",
  );
  clarifications.push(
    "El total mostrado es una escala de los valores registrados en la fuente y no un presupuesto directamente comparable ni una oferta vigente.",
  );

  if (projectIndicators.length === 0) {
    reviewPoints.unshift(
      `No se encontraron indicadores para ${projectName}; verificar la selección o volver a importar el catálogo.`,
    );
  }

  if (partialIndicators.length > 0) {
    clarifications.push(
      `Se excluyeron ${partialIndicators.length} ${partialIndicators.length === 1 ? "renglón parcial" : "renglones parciales"} del total para evitar doble conteo con capítulos completos.`,
    );
  }

  if (nonSelectable.length > 0) {
    reviewPoints.unshift(
      `${nonSelectable.length} ${nonSelectable.length === 1 ? "renglón" : "renglones"} de la fuente tiene${nonSelectable.length === 1 ? "" : "n"} uso administrativo o no mapeado; no debe${nonSelectable.length === 1 ? "" : "n"} tratarse automáticamente como tarifa completa por m².`,
    );
  }

  if (
    largestLine !== undefined &&
    largestLineShare !== null &&
    largestLineShare >= limits.concentration
  ) {
    recommendations.unshift(
      `Revisar el alcance de ${largestLine.label}, que concentra ${formatPercent(largestLineShare)} del valor histórico incluido.`,
    );
    reviewPoints.unshift(
      `Concentración histórica: ${largestLine.label} representa ${formatPercent(largestLineShare)} del total de escala de la fuente.`,
    );
  }

  if (sourceYears.length === 1) {
    clarifications.push(
      `Los indicadores tienen año base ${sourceYears[0]}; no se asumió actualización automática al mes actual.`,
    );
  } else if (sourceYears.length > 1) {
    clarifications.push(
      `El proyecto combina años base ${sourceYears.join(", ")}; deben homologarse antes de cualquier comparación.`,
    );
  }

  const summary =
    includedIndicators.length === 0
      ? `No hay información histórica utilizable para ${projectName}.`
      : `${projectName} registra ${formatCop(totalAmount)} como escala de la fuente en ${includedIndicators.length} ${includedIndicators.length === 1 ? "renglón" : "renglones"}, sin duplicar desgloses parciales. No se interpreta como presupuesto vigente.`;

  return {
    status: "ready",
    kind: "historical-project",
    subjectId: project,
    subjectName: projectName,
    summary,
    recommendations,
    clarifications,
    reviewPoints,
    methodologyNote: baseMethodology("historical-project"),
    metrics: {
      totalAmount,
      referenceBaseAmount: totalAmount,
      adjustmentAmount: 0,
      adjustmentRate: totalAmount > 0 ? 0 : null,
      areaM2: null,
      costPerM2: null,
      lineCount: composition.length,
      pricedLineCount: composition.filter(({ amount }) => amount > 0).length,
      referenceProjectCount: projectIndicators.length > 0 ? 1 : 0,
      largestLineShare,
      highAdjustmentLineCount: 0,
      nonSelectableLineCount: nonSelectable.length,
    },
    comparisons,
    composition,
    sourceYears,
    referenceProjects: projectIndicators.length > 0 ? [projectName] : [],
  };
}
