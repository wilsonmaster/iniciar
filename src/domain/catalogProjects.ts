import type { CostIndicator } from "./types";

/** Stable project identifiers, in the order requested by the product. */
export const COST_PROJECT_IDS = [
  "serraclara",
  "arbore",
  "rocca",
  "oficinas-rocca",
  "urbanismo-casas",
  "oficinas-t6",
  "pinar-vis",
] as const;

export type CostProjectId = (typeof COST_PROJECT_IDS)[number];

export interface CostProjectDefinition {
  id: CostProjectId;
  label: string;
  /** Names accepted from historical workbooks and previous app versions. */
  aliases: readonly string[];
}

export interface CostIndicatorBlock {
  id: string;
  label: string;
  indicators: readonly CostIndicator[];
}

export interface CostProjectCatalogEntry {
  id: CostProjectId;
  label: string;
  indicators: readonly CostIndicator[];
  blocks: readonly CostIndicatorBlock[];
}

export const COST_PROJECTS: readonly CostProjectDefinition[] = [
  { id: "serraclara", label: "Serraclara", aliases: ["Serraclara"] },
  { id: "arbore", label: "Arbore", aliases: ["Arbore", "Arboré"] },
  { id: "rocca", label: "Rocca", aliases: ["Rocca"] },
  {
    id: "oficinas-rocca",
    label: "Oficinas Rocca",
    aliases: ["Oficinas Rocca"],
  },
  {
    id: "urbanismo-casas",
    label: "Urbanismo Casas",
    aliases: ["Urbanismo Casas", "Externo Casas"],
  },
  { id: "oficinas-t6", label: "Oficinas T6", aliases: ["Oficinas T6"] },
  { id: "pinar-vis", label: "Pinar VIS", aliases: ["Pinar VIS"] },
] as const;

function normalizeProjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const PROJECT_BY_ID = new Map(
  COST_PROJECTS.map((project) => [project.id, project] as const),
);

const PROJECT_ID_BY_NAME = new Map<string, CostProjectId>();

for (const project of COST_PROJECTS) {
  PROJECT_ID_BY_NAME.set(normalizeProjectName(project.id), project.id);
  PROJECT_ID_BY_NAME.set(normalizeProjectName(project.label), project.id);
  for (const alias of project.aliases) {
    PROJECT_ID_BY_NAME.set(normalizeProjectName(alias), project.id);
  }
}

/** Resolves a stable ID, a display label or a historical workbook alias. */
export function resolveCostProjectId(
  project: string,
): CostProjectId | undefined {
  return PROJECT_ID_BY_NAME.get(normalizeProjectName(project));
}

/** Returns the product label while preserving unknown external project names. */
export function projectDisplayName(project: string): string {
  const projectId = resolveCostProjectId(project);
  return projectId === undefined
    ? project.trim()
    : (PROJECT_BY_ID.get(projectId)?.label ?? project.trim());
}

/** Selects rows for one project, accepting either its ID, label or an alias. */
export function filterCostIndicatorsByProject(
  indicators: readonly CostIndicator[],
  project: string,
): CostIndicator[] {
  const projectId = resolveCostProjectId(project);
  if (projectId === undefined) return [];

  return indicators.filter(
    (indicator) => resolveCostProjectId(indicator.project) === projectId,
  );
}

/**
 * Builds the seven-project catalogue. Projects use the requested product order;
 * blocks and rows retain their first-seen order from the workbook.
 */
export function buildCostProjectCatalog(
  indicators: readonly CostIndicator[],
): CostProjectCatalogEntry[] {
  return COST_PROJECTS.map((project) => {
    const projectIndicators = filterCostIndicatorsByProject(
      indicators,
      project.id,
    );
    const indicatorsByBlock = new Map<string, CostIndicator[]>();

    for (const indicator of projectIndicators) {
      const block = indicatorsByBlock.get(indicator.groupId);
      if (block === undefined) {
        indicatorsByBlock.set(indicator.groupId, [indicator]);
      } else {
        block.push(indicator);
      }
    }

    const blocks = Array.from(
      indicatorsByBlock,
      ([id, blockIndicators]): CostIndicatorBlock => ({
        id,
        label: blockIndicators[0]?.groupLabel ?? id,
        indicators: blockIndicators,
      }),
    );

    return {
      id: project.id,
      label: project.label,
      indicators: projectIndicators,
      blocks,
    };
  });
}
