import { describe, expect, it } from "vitest";
import {
  buildCandidateReferences,
  suggestReferenceIds,
} from "./referenceCandidates";
import {
  CHAPTER_KEYS,
  type ChapterKey,
  type CostIndicator,
  type CostReference,
  type CostIndicatorUsage,
} from "./types";

function source(cell: string, sheet = "Indicadores costos") {
  return {
    workbook: "INDICADORES.xlsx",
    sheet,
    cell,
  };
}

function indicator(
  id: string,
  overrides: Partial<CostIndicator> = {},
): CostIndicator {
  const row = overrides.source?.cell.match(/\d+$/)?.[0] ?? "10";

  return {
    id,
    groupId: "grupo-vivienda",
    groupLabel: "Vivienda",
    project: "Proyecto histórico",
    projectType: "residential-tower",
    baseYear: 2026,
    concept: `Indicador ${id}`,
    originalUnit: "m2",
    historicalAmount: 10_000_000,
    basisQuantity: 10,
    unitRate: 1_000_000,
    adjustmentPerUnit: 0,
    finalRate: 1_000_000,
    usage: "selectable",
    compatibleChapters: ["common-areas"],
    context: {
      assetClass: "residential",
      product: "mixed",
    },
    source: source(`H${row}`),
    amountSource: source(`E${row}`),
    quantitySource: source(`F${row}`),
    ...overrides,
  };
}

function reference(
  id: string,
  chapter: ChapterKey,
  overrides: Partial<CostReference> = {},
): CostReference {
  return {
    id,
    chapter,
    label: `Referente ${id}`,
    project: "Proyecto preferido",
    baseYear: 2026,
    currency: "COP",
    quantityUnit: "m2",
    rateUnit: "COP/m2",
    baseRate: 1_000_000,
    source: source("H100"),
    scope: "Capítulo completo",
    exclusions: [],
    context: {
      assetClass: "residential",
      product:
        chapter === "vis-towers"
          ? "VIS"
          : chapter === "non-vis-towers"
            ? "non-VIS"
            : "mixed",
    },
    reviewStatus: "needs-review",
    ...overrides,
  };
}

function completeReferences(): CostReference[] {
  return CHAPTER_KEYS.map((chapter, index) =>
    reference(`base-${chapter}`, chapter, {
      source: source(`H${100 + index}`),
    }),
  );
}

describe("buildCandidateReferences", () => {
  it("conserva primero los referentes preferidos, con sus IDs y objetos intactos", () => {
    const first = reference("preferred-original-id", "common-areas", {
      source: source("H8"),
      catalogIndicatorId: "preferred-indicator",
    });
    const second = reference("another-preferred-id", "preliminaries", {
      source: source("H9"),
    });
    const generated = indicator("new-catalog-row", {
      source: source("H10"),
      compatibleChapters: ["common-areas"],
    });

    const result = buildCandidateReferences([generated], [first, second]);

    expect(result.slice(0, 2)).toEqual([first, second]);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(second);
    expect(result.map(({ id }) => id)).toEqual([
      "preferred-original-id",
      "another-preferred-id",
      "catalog-reference:new-catalog-row:common-areas",
    ]);
  });

  it("solo convierte filas seleccionables cuya unidad es m2", () => {
    const usages: CostIndicatorUsage[] = [
      "partial",
      "administration",
      "unmapped",
    ];
    const rejectedByUsage = usages.map((usage, index) =>
      indicator(`rejected-${usage}`, {
        usage,
        source: source(`H${20 + index}`),
      }),
    );

    const result = buildCandidateReferences(
      [
        indicator("plain-m2", { source: source("H30") }),
        indicator("superscript-m2", {
          originalUnit: " m² ",
          source: source("H31"),
        }),
        indicator("wrong-unit", {
          originalUnit: "unidad",
          source: source("H32"),
        }),
        ...rejectedByUsage,
      ],
      [],
    );

    expect(result.map(({ catalogIndicatorId }) => catalogIndicatorId)).toEqual([
      "plain-m2",
      "superscript-m2",
    ]);
    expect(result.every(({ quantityUnit }) => quantityUnit === "m2")).toBe(true);
  });

  it("deduplica la misma fila dentro del mismo capítulo, incluso si cambia la columna", () => {
    const result = buildCandidateReferences(
      [
        indicator("first-row-40", {
          source: source("H40"),
          compatibleChapters: ["common-areas"],
        }),
        indicator("duplicate-row-40", {
          source: source("G40"),
          compatibleChapters: ["common-areas"],
        }),
        indicator("same-row-other-chapter", {
          source: source("F40"),
          compatibleChapters: ["internal-urbanism"],
        }),
      ],
      [],
    );

    expect(
      result.map(({ catalogIndicatorId, chapter }) => [
        catalogIndicatorId,
        chapter,
      ]),
    ).toEqual([
      ["first-row-40", "common-areas"],
      ["same-row-other-chapter", "internal-urbanism"],
    ]);
  });

  it("no recrea una fila/capítulo ya representada por un referente preferido", () => {
    const preferred = reference("preferred-row", "parking-building", {
      source: source("H50"),
    });
    const duplicate = indicator("catalog-row-50", {
      source: source("F50"),
      compatibleChapters: ["parking-building"],
    });

    expect(buildCandidateReferences([duplicate], [preferred])).toEqual([
      preferred,
    ]);
  });

  it("crea una opción independiente por cada capítulo compatible", () => {
    const result = buildCandidateReferences(
      [
        indicator("tower-row", {
          source: source("H60"),
          compatibleChapters: ["vis-towers", "non-vis-towers"],
        }),
      ],
      [],
    );

    expect(
      result.map(({ id, chapter, catalogIndicatorId }) => ({
        id,
        chapter,
        catalogIndicatorId,
      })),
    ).toEqual([
      {
        id: "catalog-reference:tower-row:vis-towers",
        chapter: "vis-towers",
        catalogIndicatorId: "tower-row",
      },
      {
        id: "catalog-reference:tower-row:non-vis-towers",
        chapter: "non-vis-towers",
        catalogIndicatorId: "tower-row",
      },
    ]);
  });
});

describe("suggestReferenceIds", () => {
  it("prefiere la clase de activo compatible aunque la alternativa incompatible esté validada", () => {
    const references = completeReferences();
    const chapter = "common-areas";
    const incompatibleValidated = reference(
      "office-validated",
      chapter,
      {
        context: { assetClass: "office", product: "mixed" },
        reviewStatus: "validated",
        source: source("H200"),
      },
    );
    const compatibleNeedsReview = reference(
      "residential-needs-review",
      chapter,
      {
        context: { assetClass: "residential", product: "mixed" },
        reviewStatus: "needs-review",
        source: source("H201"),
      },
    );

    const suggestions = suggestReferenceIds(
      [
        ...references.filter((item) => item.chapter !== chapter),
        incompatibleValidated,
        compatibleNeedsReview,
      ],
      { assetClass: "residential" },
    );

    expect(suggestions[chapter]).toBe("residential-needs-review");
  });

  it("prefiere el producto compatible del capítulo aunque el incompatible esté validado", () => {
    const references = completeReferences();
    const chapter = "vis-towers";
    const incompatibleValidated = reference(
      "non-vis-validated",
      chapter,
      {
        context: { assetClass: "residential", product: "non-VIS" },
        reviewStatus: "validated",
        source: source("H210"),
      },
    );
    const compatibleNeedsReview = reference("vis-needs-review", chapter, {
      context: { assetClass: "residential", product: "VIS" },
      reviewStatus: "needs-review",
      source: source("H211"),
    });

    const suggestions = suggestReferenceIds(
      [
        ...references.filter((item) => item.chapter !== chapter),
        incompatibleValidated,
        compatibleNeedsReview,
      ],
      { assetClass: "residential" },
    );

    expect(suggestions[chapter]).toBe("vis-needs-review");
  });

  it("entre referentes compatibles selecciona el validado", () => {
    const references = completeReferences();
    const chapter = "non-vis-towers";
    const compatibleNeedsReview = reference("compatible-draft", chapter, {
      context: { assetClass: "residential", product: "non-VIS" },
      reviewStatus: "needs-review",
      source: source("H220"),
    });
    const compatibleValidated = reference("compatible-validated", chapter, {
      context: { assetClass: "residential", product: "non-VIS" },
      reviewStatus: "validated",
      source: source("H221"),
    });

    const suggestions = suggestReferenceIds(
      [
        ...references.filter((item) => item.chapter !== chapter),
        compatibleNeedsReview,
        compatibleValidated,
      ],
      { assetClass: "residential" },
    );

    expect(suggestions[chapter]).toBe("compatible-validated");
  });
});
