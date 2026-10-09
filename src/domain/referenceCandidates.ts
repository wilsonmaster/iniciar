import {
  CHAPTER_KEYS,
  type ChapterKey,
  type CostIndicator,
  type CostReference,
  type ScenarioContext,
} from "./types";

const CATALOG_REFERENCE_PREFIX = "catalog-reference";

function normalizedUnit(unit: string): string {
  return unit.trim().toLowerCase().replaceAll("²", "2").replace(/\s+/g, "");
}

function sourceRowKey(
  chapter: ChapterKey,
  source: CostReference["source"],
): string {
  const row = source.cell.match(/\d+$/)?.[0];
  const cellOrRow = row === undefined ? source.cell.toUpperCase() : `row-${row}`;

  return [
    chapter,
    source.workbook.trim().toLowerCase(),
    source.sheet.trim().toLowerCase(),
    cellOrRow,
  ].join("::");
}

function indicatorChapterKey(
  chapter: ChapterKey,
  indicatorId: string,
): string {
  return `${chapter}::${indicatorId}`;
}

function candidateId(indicatorId: string, chapter: ChapterKey): string {
  return `${CATALOG_REFERENCE_PREFIX}:${indicatorId}:${chapter}`;
}

function referenceFromIndicator(
  indicator: CostIndicator,
  chapter: ChapterKey,
): CostReference {
  const context = {
    ...indicator.context,
    ...(indicator.context.floorCount === undefined &&
    indicator.floorCount !== undefined
      ? { floorCount: indicator.floorCount }
      : {}),
  };

  return {
    id: candidateId(indicator.id, chapter),
    chapter,
    catalogIndicatorId: indicator.id,
    label: indicator.concept,
    project: indicator.project,
    baseYear: indicator.baseYear,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: indicator.finalRate,
    source: { ...indicator.source },
    scope: `${indicator.groupLabel}: ${indicator.concept}`,
    exclusions: [],
    context,
    reviewStatus: "needs-review",
  };
}

/**
 * Adds every complete m2 catalogue row as an alternative for its compatible
 * chapters. Preferred references retain their identity and always come first.
 */
export function buildCandidateReferences(
  indicators: readonly CostIndicator[],
  preferred: readonly CostReference[],
): CostReference[] {
  const references = [...preferred];
  const occupiedIndicatorChapters = new Set<string>();
  const occupiedSourceRows = new Set<string>();
  const occupiedIds = new Set(preferred.map((reference) => reference.id));

  for (const reference of preferred) {
    if (reference.catalogIndicatorId !== undefined) {
      occupiedIndicatorChapters.add(
        indicatorChapterKey(reference.chapter, reference.catalogIndicatorId),
      );
    }
    occupiedSourceRows.add(sourceRowKey(reference.chapter, reference.source));
  }

  for (const indicator of indicators) {
    if (
      indicator.usage !== "selectable" ||
      normalizedUnit(indicator.originalUnit) !== "m2"
    ) {
      continue;
    }

    for (const chapter of indicator.compatibleChapters) {
      const indicatorKey = indicatorChapterKey(chapter, indicator.id);
      const rowKey = sourceRowKey(chapter, indicator.source);
      const id = candidateId(indicator.id, chapter);

      if (
        occupiedIndicatorChapters.has(indicatorKey) ||
        occupiedSourceRows.has(rowKey) ||
        occupiedIds.has(id)
      ) {
        continue;
      }

      references.push(referenceFromIndicator(indicator, chapter));
      occupiedIndicatorChapters.add(indicatorKey);
      occupiedSourceRows.add(rowKey);
      occupiedIds.add(id);
    }
  }

  return references;
}

function expectedProduct(
  chapter: ChapterKey,
): CostReference["context"]["product"] | undefined {
  if (chapter === "vis-towers") return "VIS";
  if (chapter === "non-vis-towers") return "non-VIS";
  return undefined;
}

function assetCompatibilityRank(
  reference: CostReference,
  scenarioContext: ScenarioContext | undefined,
): number {
  if (scenarioContext === undefined) return 1;

  const scenarioClass = scenarioContext.assetClass;
  const referenceClass = reference.context.assetClass;
  if (scenarioClass === referenceClass) return 2;
  if (scenarioClass === "mixed" || referenceClass === "mixed") return 1;
  return 0;
}

function productCompatibilityRank(reference: CostReference): number {
  const product = expectedProduct(reference.chapter);
  if (product === undefined) return 1;
  if (reference.context.product === product) return 2;
  if (
    reference.context.product === undefined ||
    reference.context.product === "mixed"
  ) {
    return 1;
  }
  return 0;
}

function reviewRank(reference: CostReference): number {
  if (reference.reviewStatus === "validated") return 2;
  if (reference.reviewStatus === "needs-review") return 1;
  return 0;
}

function isBetterSuggestion(
  candidate: CostReference,
  current: CostReference,
  scenarioContext: ScenarioContext | undefined,
): boolean {
  const candidateAsset = assetCompatibilityRank(candidate, scenarioContext);
  const currentAsset = assetCompatibilityRank(current, scenarioContext);
  const candidateProduct = productCompatibilityRank(candidate);
  const currentProduct = productCompatibilityRank(current);
  const candidateCompatible = candidateAsset > 0 && candidateProduct > 0;
  const currentCompatible = currentAsset > 0 && currentProduct > 0;

  if (candidateCompatible !== currentCompatible) return candidateCompatible;

  const ranks: readonly [number, number][] = [
    [reviewRank(candidate), reviewRank(current)],
    [candidateAsset, currentAsset],
    [candidateProduct, currentProduct],
  ];

  for (const [candidateRank, currentRank] of ranks) {
    if (candidateRank !== currentRank) return candidateRank > currentRank;
  }

  return false;
}

/**
 * Chooses one initial reference per chapter. Compatibility is a hard priority;
 * among compatible choices, validated and more specific references win. Ties
 * retain input order so preferred references remain stable.
 */
export function suggestReferenceIds(
  references: readonly CostReference[],
  scenarioContext?: ScenarioContext,
): Record<ChapterKey, string> {
  const suggestions = {} as Partial<Record<ChapterKey, string>>;

  for (const chapter of CHAPTER_KEYS) {
    let selected: CostReference | undefined;

    for (const reference of references) {
      if (reference.chapter !== chapter) continue;
      if (
        selected === undefined ||
        isBetterSuggestion(reference, selected, scenarioContext)
      ) {
        selected = reference;
      }
    }

    if (selected === undefined) {
      throw new Error(`No hay un referente disponible para ${chapter}.`);
    }
    suggestions[chapter] = selected.id;
  }

  return suggestions as Record<ChapterKey, string>;
}
