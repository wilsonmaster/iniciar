import { describe, expect, it } from "vitest";
import { DEFAULT_COST_INDICATORS } from "../data/defaultCostIndicators";
import {
  buildCostProjectCatalog,
  COST_PROJECT_IDS,
  COST_PROJECTS,
  filterCostIndicatorsByProject,
  projectDisplayName,
  resolveCostProjectId,
} from "./catalogProjects";

describe("catálogo de proyectos de indicadores", () => {
  it("define los siete proyectos en el orden de producto", () => {
    expect(COST_PROJECT_IDS).toEqual([
      "serraclara",
      "arbore",
      "rocca",
      "oficinas-rocca",
      "urbanismo-casas",
      "oficinas-t6",
      "pinar-vis",
    ]);
    expect(COST_PROJECTS.map(({ label }) => label)).toEqual([
      "Serraclara",
      "Arbore",
      "Rocca",
      "Oficinas Rocca",
      "Urbanismo Casas",
      "Oficinas T6",
      "Pinar VIS",
    ]);
  });

  it("resuelve IDs, etiquetas y aliases sin depender de mayúsculas o tildes", () => {
    expect(resolveCostProjectId("serraclara")).toBe("serraclara");
    expect(resolveCostProjectId("  OFICINAS ROCCA  ")).toBe("oficinas-rocca");
    expect(resolveCostProjectId("Arboré")).toBe("arbore");
    expect(resolveCostProjectId("Externo Casas")).toBe("urbanismo-casas");
    expect(resolveCostProjectId("urbanismo_casas")).toBe("urbanismo-casas");
    expect(resolveCostProjectId("Proyecto nuevo")).toBeUndefined();
  });

  it("muestra Externo Casas con el nombre de producto Urbanismo Casas", () => {
    expect(projectDisplayName("Externo Casas")).toBe("Urbanismo Casas");
    expect(projectDisplayName("urbanismo-casas")).toBe("Urbanismo Casas");
    expect(projectDisplayName(" Proyecto nuevo ")).toBe("Proyecto nuevo");
  });

  it("agrupa los 45 indicadores en siete proyectos y conserva sus cuadros", () => {
    const catalog = buildCostProjectCatalog(DEFAULT_COST_INDICATORS);

    expect(catalog.map(({ id }) => id)).toEqual(COST_PROJECT_IDS);
    expect(catalog.map(({ indicators }) => indicators.length)).toEqual([
      9, 6, 9, 5, 5, 5, 6,
    ]);
    expect(catalog.map(({ blocks }) => blocks.length)).toEqual([
      2, 2, 2, 1, 1, 1, 1,
    ]);
    expect(catalog[0]?.blocks.map(({ id }) => id)).toEqual([
      "serraclara-2026",
      "serraclara-estructura-acabados",
    ]);
    expect(catalog[2]?.blocks.map(({ id }) => id)).toEqual([
      "rocca-2026",
      "rocca-estructura-acabados",
    ]);
    expect(catalog[4]).toMatchObject({
      id: "urbanismo-casas",
      label: "Urbanismo Casas",
    });
    expect(catalog[4]?.indicators[0]?.project).toBe("Externo Casas");
  });

  it("conserva el orden de entrada de los cuadros y de sus filas", () => {
    const serraclara = DEFAULT_COST_INDICATORS.filter(
      ({ project }) => project === "Serraclara",
    );
    const reordered = [
      ...serraclara.slice(7),
      serraclara[1],
      serraclara[0],
      ...serraclara.slice(2, 7),
    ].filter((indicator) => indicator !== undefined);
    const project = buildCostProjectCatalog(reordered)[0];

    expect(project?.blocks.map(({ id }) => id)).toEqual([
      "serraclara-estructura-acabados",
      "serraclara-2026",
    ]);
    expect(project?.blocks[1]?.indicators.map(({ id }) => id)).toEqual([
      "serraclara-2026-r5",
      "serraclara-2026-r4",
      "serraclara-2026-r6",
      "serraclara-2026-r7",
      "serraclara-2026-r8",
      "serraclara-2026-r9",
      "serraclara-2026-r10",
    ]);
  });

  it("filtra por ID, etiqueta o alias histórico", () => {
    const byId = filterCostIndicatorsByProject(
      DEFAULT_COST_INDICATORS,
      "urbanismo-casas",
    );
    const byAlias = filterCostIndicatorsByProject(
      DEFAULT_COST_INDICATORS,
      "Externo Casas",
    );

    expect(byId).toHaveLength(5);
    expect(byAlias.map(({ id }) => id)).toEqual(byId.map(({ id }) => id));
    expect(
      filterCostIndicatorsByProject(DEFAULT_COST_INDICATORS, "desconocido"),
    ).toEqual([]);
  });
});
