import { CHAPTER_KEYS } from "./types";
import type {
  CellSource,
  ChapterKey,
  CostReference,
  EstimateConfig,
  EstimateIndicators,
  EstimateLineItem,
  EstimateResult,
  EstimateWarning,
  ExternalUrbanismResult,
  RateAdjustment,
  ScenarioAreas,
  ScenarioInput,
} from "./types";

type ChapterAreaField =
  | "constructedTotal"
  | "visBuilt"
  | "nonVisBuilt"
  | "parkingBuilt"
  | "commonBuilt"
  | "internalUrbanism";

const AREA_FIELD_BY_CHAPTER: Record<ChapterKey, ChapterAreaField> = {
  "vis-towers": "visBuilt",
  "non-vis-towers": "nonVisBuilt",
  "parking-building": "parkingBuilt",
  "common-areas": "commonBuilt",
  "internal-urbanism": "internalUrbanism",
  preliminaries: "constructedTotal",
};

/**
 * Neumaier compensated summation keeps the result independent of accidental
 * loss of low-order digits while retaining normal JavaScript `number` output.
 */
function sumPrecisely(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;

  for (const value of values) {
    const next = sum + value;
    compensation +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }

  return sum + compensation;
}

function cloneSource(source: CellSource | undefined): CellSource | undefined {
  return source ? { ...source } : undefined;
}

function cloneAdjustment(
  adjustment: RateAdjustment | undefined,
): RateAdjustment | null {
  if (!adjustment) return null;

  return {
    ...adjustment,
    source: cloneSource(adjustment.source),
  };
}

export function applyAdjustment(
  baseRate: number,
  adjustment?: RateAdjustment | null,
): number {
  if (!adjustment) return baseRate;

  return adjustment.kind === "absolute"
    ? baseRate + adjustment.value
    : baseRate + baseRate * adjustment.value;
}

function adjustmentPerUnit(
  baseRate: number,
  adjustment?: RateAdjustment | null,
): number {
  if (!adjustment) return 0;
  return adjustment.kind === "absolute"
    ? adjustment.value
    : baseRate * adjustment.value;
}

function addWarning(
  warnings: EstimateWarning[],
  warning: EstimateWarning,
): void {
  warnings.push(warning);
}

function nonNegativeInput(
  value: number,
  field: string,
  warnings: EstimateWarning[],
): number {
  if (!Number.isFinite(value)) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "error",
      field,
      message: `${field} debe ser un número finito. Se usó 0 para bloquear un resultado no numérico.`,
    });
    return 0;
  }

  if (value < 0) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "error",
      field,
      message: `${field} no puede ser negativo.`,
    });
  }

  return value;
}

function optionalNonNegativeInput(
  value: number | undefined,
  field: string,
  warnings: EstimateWarning[],
): number | undefined {
  return value === undefined
    ? undefined
    : nonNegativeInput(value, field, warnings);
}

function validateReferenceCompatibility(
  scenario: ScenarioInput,
  chapter: ChapterKey,
  reference: CostReference,
  warnings: EstimateWarning[],
): void {
  const scenarioClass = scenario.context.assetClass;
  const referenceClass = reference.context.assetClass;
  const compatibleClass =
    scenarioClass === referenceClass ||
    scenarioClass === "mixed" ||
    referenceClass === "mixed";

  if (!compatibleClass) {
    addWarning(warnings, {
      code: "incompatible-reference",
      severity: "error",
      chapter,
      source: cloneSource(reference.source),
      message: `El referente ${reference.project} (${referenceClass}) no es compatible con un escenario ${scenarioClass}.`,
    });
  }

  const expectedProduct =
    chapter === "vis-towers"
      ? "VIS"
      : chapter === "non-vis-towers"
        ? "non-VIS"
        : undefined;

  if (
    expectedProduct &&
    reference.context.product &&
    reference.context.product !== expectedProduct &&
    reference.context.product !== "mixed"
  ) {
    addWarning(warnings, {
      code: "incompatible-reference",
      severity: "error",
      chapter,
      source: cloneSource(reference.source),
      message: `El referente ${reference.project} no corresponde al producto ${expectedProduct}.`,
    });
  }

  if (
    chapter === "parking-building" &&
    scenario.context.parkingFloorCount !== undefined &&
    reference.context.floorCount !== undefined &&
    scenario.context.parkingFloorCount !== reference.context.floorCount
  ) {
    addWarning(warnings, {
      code: "parking-reference-floor-mismatch",
      severity: "warning",
      chapter,
      source: cloneSource(reference.source),
      message: `El escenario tiene ${scenario.context.parkingFloorCount} pisos de parqueaderos y el referente ${reference.context.floorCount}; el ajuste debe conservar validación técnica.`,
    });
  }
}

function buildIndicators(
  baseBudget: number,
  lineItems: readonly EstimateLineItem[],
  constructedArea: number,
  sellableArea: number | null,
  housingUnits: number | null,
  parkingSpaces: number | undefined,
): EstimateIndicators {
  const parkingAmount = lineItems.find(
    ({ chapter }) => chapter === "parking-building",
  )?.amount;

  return {
    basis: "base-budget",
    constructedArea,
    sellableArea,
    housingUnits,
    costPerConstructedM2:
      constructedArea > 0 ? baseBudget / constructedArea : null,
    costPerSellableM2:
      sellableArea !== null && sellableArea > 0
        ? baseBudget / sellableArea
        : null,
    costPerHousingUnit:
      housingUnits !== null && housingUnits > 0
        ? baseBudget / housingUnits
        : null,
    parkingCostPerSpace:
      parkingAmount !== undefined &&
      parkingSpaces !== undefined &&
      parkingSpaces > 0
        ? parkingAmount / parkingSpaces
        : null,
  };
}

/**
 * Pure Fase 1 estimator. It does not round, mutate inputs, read the clock or
 * use cached spreadsheet totals as calculation inputs.
 */
export function estimateScenario(
  scenario: ScenarioInput,
  references: readonly CostReference[],
  config: EstimateConfig,
): EstimateResult {
  const warnings: EstimateWarning[] = [];

  const areas: ScenarioAreas = {
    constructedTotal: nonNegativeInput(
      scenario.areas.constructedTotal,
      "areas.constructedTotal",
      warnings,
    ),
    visBuilt: nonNegativeInput(
      scenario.areas.visBuilt,
      "areas.visBuilt",
      warnings,
    ),
    nonVisBuilt: nonNegativeInput(
      scenario.areas.nonVisBuilt,
      "areas.nonVisBuilt",
      warnings,
    ),
    parkingBuilt: nonNegativeInput(
      scenario.areas.parkingBuilt,
      "areas.parkingBuilt",
      warnings,
    ),
    commonBuilt: nonNegativeInput(
      scenario.areas.commonBuilt,
      "areas.commonBuilt",
      warnings,
    ),
    internalUrbanism: nonNegativeInput(
      scenario.areas.internalUrbanism,
      "areas.internalUrbanism",
      warnings,
    ),
    sellableVis: optionalNonNegativeInput(
      scenario.areas.sellableVis,
      "areas.sellableVis",
      warnings,
    ),
    sellableNonVis: optionalNonNegativeInput(
      scenario.areas.sellableNonVis,
      "areas.sellableNonVis",
      warnings,
    ),
  };

  const visUnits = nonNegativeInput(
    scenario.housingUnits.vis,
    "housingUnits.vis",
    warnings,
  );
  const nonVisUnits = nonNegativeInput(
    scenario.housingUnits.nonVis,
    "housingUnits.nonVis",
    warnings,
  );
  const parkingSpaces = optionalNonNegativeInput(
    scenario.parkingSpaces,
    "parkingSpaces",
    warnings,
  );

  const areaTolerance =
    Number.isFinite(config.areaToleranceM2) && config.areaToleranceM2 >= 0
      ? config.areaToleranceM2
      : 0;
  if (areaTolerance !== config.areaToleranceM2) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "error",
      field: "config.areaToleranceM2",
      message: "La tolerancia de áreas debe ser un número finito no negativo.",
    });
  }

  const componentBuiltArea = sumPrecisely([
    areas.visBuilt,
    areas.nonVisBuilt,
    areas.parkingBuilt,
    areas.commonBuilt,
  ]);
  const builtAreaDifference = componentBuiltArea - areas.constructedTotal;
  if (Math.abs(builtAreaDifference) > areaTolerance) {
    addWarning(warnings, {
      code: "area-mismatch",
      severity: "warning",
      field: "areas.constructedTotal",
      difference: builtAreaDifference,
      message: `Las áreas construidas por componente difieren del total en ${builtAreaDifference} m2.`,
    });
  }

  if (visUnits === 0 && areas.visBuilt > areaTolerance) {
    addWarning(warnings, {
      code: "product-area-without-units",
      severity: "warning",
      field: "areas.visBuilt",
      chapter: "vis-towers",
      message: "Hay área VIS construida, pero no hay viviendas VIS.",
    });
  } else if (visUnits > 0 && areas.visBuilt <= areaTolerance) {
    addWarning(warnings, {
      code: "product-units-without-area",
      severity: "warning",
      field: "housingUnits.vis",
      chapter: "vis-towers",
      message: "Hay viviendas VIS, pero no hay área VIS construida.",
    });
  }

  if (nonVisUnits === 0 && areas.nonVisBuilt > areaTolerance) {
    addWarning(warnings, {
      code: "product-area-without-units",
      severity: "warning",
      field: "areas.nonVisBuilt",
      chapter: "non-vis-towers",
      message: "Hay área No VIS construida, pero no hay viviendas No VIS.",
    });
  } else if (nonVisUnits > 0 && areas.nonVisBuilt <= areaTolerance) {
    addWarning(warnings, {
      code: "product-units-without-area",
      severity: "warning",
      field: "housingUnits.nonVis",
      chapter: "non-vis-towers",
      message: "Hay viviendas No VIS, pero no hay área No VIS construida.",
    });
  }

  const requiresSellableVis = visUnits > 0;
  const requiresSellableNonVis = nonVisUnits > 0;
  const hasRequiredSellableAreas =
    (!requiresSellableVis || areas.sellableVis !== undefined) &&
    (!requiresSellableNonVis || areas.sellableNonVis !== undefined);
  // Mirror the workbook denominator exactly: VIS vendible + No VIS vendible.
  const rawSellableArea = hasRequiredSellableAreas
    ? (areas.sellableVis ?? 0) + (areas.sellableNonVis ?? 0)
    : 0;
  const sellableArea =
    hasRequiredSellableAreas && rawSellableArea > 0 ? rawSellableArea : null;

  if (sellableArea === null) {
    addWarning(warnings, {
      code: "sellable-area-missing",
      severity: "warning",
      field: "areas.sellableVis",
      message:
        "Falta un área vendible aplicable; el indicador COP/m2 vendible no se calculó.",
    });
  } else if (sellableArea - areas.constructedTotal > areaTolerance) {
    addWarning(warnings, {
      code: "sellable-area-exceeds-constructed",
      severity: "warning",
      field: "areas.sellableVis",
      difference: sellableArea - areas.constructedTotal,
      message: "El área vendible supera el área construida total.",
    });
  }

  const totalHousingUnits = visUnits + nonVisUnits;
  const housingUnits = totalHousingUnits > 0 ? totalHousingUnits : null;
  if (housingUnits === null) {
    addWarning(warnings, {
      code: "housing-units-missing",
      severity: "warning",
      field: "housingUnits",
      message: "No hay viviendas; el indicador COP/vivienda no se calculó.",
    });
  }

  if (areas.parkingBuilt > 0 && !(parkingSpaces !== undefined && parkingSpaces > 0)) {
    addWarning(warnings, {
      code: "parking-spaces-missing",
      severity: "info",
      field: "parkingSpaces",
      chapter: "parking-building",
      message:
        "No se informó la cantidad de cupos; el indicador COP/parqueadero no se calculó.",
    });
  }

  const lineItems: EstimateLineItem[] = [];

  for (const chapter of CHAPTER_KEYS) {
    const referenceId = scenario.referenceIds[chapter];
    const matchingReferences = references.filter(
      (reference) => reference.id === referenceId,
    );

    if (matchingReferences.length === 0) {
      addWarning(warnings, {
        code: "missing-reference",
        severity: "error",
        chapter,
        message: `No existe el referente ${referenceId || "(sin id)"} para ${chapter}.`,
      });
      continue;
    }

    if (matchingReferences.length > 1) {
      addWarning(warnings, {
        code: "duplicate-reference",
        severity: "error",
        chapter,
        message: `El id de referente ${referenceId} está duplicado.`,
      });
    }

    const reference = matchingReferences[0];
    if (reference.chapter !== chapter) {
      addWarning(warnings, {
        code: "invalid-reference",
        severity: "error",
        chapter,
        source: cloneSource(reference.source),
        message: `El referente ${reference.id} pertenece a ${reference.chapter}, no a ${chapter}.`,
      });
    }

    if (
      reference.currency !== config.currency ||
      reference.quantityUnit !== "m2" ||
      reference.rateUnit !== "COP/m2"
    ) {
      addWarning(warnings, {
        code: "invalid-reference",
        severity: "error",
        chapter,
        source: cloneSource(reference.source),
        message: `El referente ${reference.id} tiene moneda o unidades incompatibles.`,
      });
    }

    if (!Number.isFinite(reference.baseRate) || reference.baseRate < 0) {
      addWarning(warnings, {
        code: "invalid-reference",
        severity: "error",
        chapter,
        source: cloneSource(reference.source),
        message: `La tarifa base de ${reference.id} debe ser finita y no negativa.`,
      });
    }

    if (reference.reviewStatus !== "validated") {
      addWarning(warnings, {
        code: "unvalidated-reference",
        severity:
          reference.reviewStatus === "not-comparable" ? "error" : "warning",
        chapter,
        source: cloneSource(reference.source),
        message: `El referente ${reference.id} tiene estado ${reference.reviewStatus}.`,
      });
    }

    validateReferenceCompatibility(scenario, chapter, reference, warnings);

    const adjustment = scenario.adjustments[chapter];
    const adjustmentIsFinite =
      adjustment === undefined || Number.isFinite(adjustment.value);
    if (!adjustmentIsFinite) {
      addWarning(warnings, {
        code: "invalid-input",
        severity: "error",
        field: `adjustments.${chapter}`,
        chapter,
        source: cloneSource(adjustment?.source),
        message: `El ajuste de ${chapter} debe ser un número finito.`,
      });
    }

    const usableBaseRate = Number.isFinite(reference.baseRate)
      ? reference.baseRate
      : 0;
    const usableAdjustment = adjustmentIsFinite ? adjustment : undefined;
    const finalRate = applyAdjustment(usableBaseRate, usableAdjustment);
    if (!Number.isFinite(finalRate) || finalRate < 0) {
      addWarning(warnings, {
        code: "invalid-input",
        severity: "error",
        field: `adjustments.${chapter}`,
        chapter,
        source: cloneSource(adjustment?.source),
        message: `La tarifa final de ${chapter} debe ser finita y no negativa.`,
      });
    }

    const quantity = areas[AREA_FIELD_BY_CHAPTER[chapter]];
    const safeFinalRate = Number.isFinite(finalRate) ? finalRate : 0;
    const amount = safeFinalRate * quantity;

    lineItems.push({
      chapter,
      label: reference.label,
      quantity,
      quantityUnit: reference.quantityUnit,
      baseRate: usableBaseRate,
      adjustment: cloneAdjustment(usableAdjustment),
      adjustmentPerUnit: adjustmentPerUnit(
        usableBaseRate,
        usableAdjustment,
      ),
      finalRate: safeFinalRate,
      rateUnit: reference.rateUnit,
      amount,
      referenceId: reference.id,
      referenceProject: reference.project,
      rateSource: { ...reference.source },
      quantitySource: cloneSource(
        scenario.sources?.chapterQuantities?.[chapter],
      ),
      reviewStatus: reference.reviewStatus,
      scope: reference.scope,
      exclusions: [...reference.exclusions],
    });
  }

  const directCostSubtotal = sumPrecisely(
    lineItems.map(({ amount }) => amount),
  );
  const administrationRate = Number.isFinite(config.administrationRate)
    ? config.administrationRate
    : 0;
  if (!Number.isFinite(config.administrationRate) || administrationRate < 0) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "error",
      field: "config.administrationRate",
      message: "La tasa de administración y GG debe ser finita y no negativa.",
    });
  } else if (administrationRate > 1) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "warning",
      field: "config.administrationRate",
      message:
        "La tasa de administración y GG supera 100%; confirme que está expresada como decimal.",
    });
  }

  const administrationAmount = directCostSubtotal * administrationRate;
  const baseBudget = sumPrecisely([
    directCostSubtotal,
    administrationAmount,
  ]);

  const externalInput = scenario.externalUrbanism;
  const externalAmount = externalInput
    ? nonNegativeInput(
        externalInput.amount,
        "externalUrbanism.amount",
        warnings,
      )
    : 0;
  const alreadyIncludedInBase = externalInput?.includedInBase ?? false;
  const externalAdded = alreadyIncludedInBase ? 0 : externalAmount;
  if (alreadyIncludedInBase && externalAmount > 0) {
    addWarning(warnings, {
      code: "external-urbanism-already-included",
      severity: "info",
      field: "externalUrbanism.includedInBase",
      source: cloneSource(externalInput?.source),
      message:
        "El urbanismo externo ya está contenido en el presupuesto base y no se sumó otra vez.",
    });
  }

  const budgetWithExternalUrbanism = sumPrecisely([
    baseBudget,
    externalAdded,
  ]);
  const selectedBudget = config.includeExternalUrbanism
    ? budgetWithExternalUrbanism
    : baseBudget;
  const externalUrbanism: ExternalUrbanismResult = {
    amount: externalAmount,
    alreadyIncludedInBase,
    addedToConsolidatedBudget: externalAdded,
    includedInSelectedBudget:
      alreadyIncludedInBase || config.includeExternalUrbanism,
    source: cloneSource(externalInput?.source),
  };

  const indicators = buildIndicators(
    baseBudget,
    lineItems,
    areas.constructedTotal,
    sellableArea,
    housingUnits,
    parkingSpaces,
  );

  const reconciliationTolerance =
    Number.isFinite(config.reconciliationTolerance) &&
    config.reconciliationTolerance >= 0
      ? config.reconciliationTolerance
      : 0;
  if (reconciliationTolerance !== config.reconciliationTolerance) {
    addWarning(warnings, {
      code: "invalid-input",
      severity: "error",
      field: "config.reconciliationTolerance",
      message:
        "La tolerancia de conciliación debe ser un número finito no negativo.",
    });
  }

  const reportedBudget = scenario.reportedResults?.baseBudget;
  if (reportedBudget) {
    const difference = baseBudget - reportedBudget.value;
    if (Math.abs(difference) > reconciliationTolerance) {
      addWarning(warnings, {
        code: "source-reconciliation-difference",
        severity: "warning",
        field: "reportedResults.baseBudget",
        source: cloneSource(reportedBudget.source),
        difference,
        message: `El cálculo difiere del total informado en ${difference} COP.`,
      });
    }
  }

  const reportedConstructedIndicator =
    scenario.reportedResults?.costPerConstructedM2;
  if (
    reportedConstructedIndicator &&
    indicators.costPerConstructedM2 !== null
  ) {
    const difference =
      indicators.costPerConstructedM2 - reportedConstructedIndicator.value;
    if (Math.abs(difference) > reconciliationTolerance) {
      addWarning(warnings, {
        code: "source-reconciliation-difference",
        severity: "warning",
        field: "reportedResults.costPerConstructedM2",
        source: cloneSource(reportedConstructedIndicator.source),
        difference,
        message: `El indicador calculado difiere del valor informado en ${difference} COP/m2.`,
      });
    }
  }

  const status = warnings.some(({ severity }) => severity === "error")
    ? "blocked"
    : warnings.some(({ severity }) => severity === "warning")
      ? "needs-review"
      : "complete";

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    calculationVersion: config.calculationVersion,
    currency: config.currency,
    status,
    lineItems,
    directCostSubtotal,
    administrationAndGeneral: {
      rate: administrationRate,
      basis: directCostSubtotal,
      amount: administrationAmount,
      source: cloneSource(scenario.sources?.administrationRate),
    },
    baseBudget,
    externalUrbanism,
    budgetWithExternalUrbanism,
    selectedBudget,
    indicators,
    warnings,
  };
}
