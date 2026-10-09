import { describe, expect, it } from "vitest";

import type { BudgetDraft } from "./budget";
import {
  loadProjectStorage,
  PROJECT_STORAGE_KEY,
  PROJECT_STORAGE_LIMITS,
  PROJECT_STORAGE_SCHEMA_VERSION,
  saveProjectStorage,
  type ProjectStorageAdapter,
} from "./projectStorage";

class MemoryStorage implements ProjectStorageAdapter {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function project(overrides: Partial<BudgetDraft> = {}): BudgetDraft {
  return {
    id: "proyecto-1",
    name: "Parque 175",
    baseProjectId: "arbore",
    status: "active",
    savedAt: "2026-10-09T15:00:00.000Z",
    updatedAt: "2026-10-09T16:00:00.000Z",
    areaM2: 42_500,
    lines: [
      {
        id: "linea-1",
        indicatorId: "arbore:torres",
        quantity: 35_000,
        adjustmentPerUnit: 150_000,
      },
    ],
    ...overrides,
  };
}

describe("projectStorage", () => {
  it("round-trips active projects and their lifecycle metadata", () => {
    const storage = new MemoryStorage();
    const state = {
      projects: [project()],
      activeProjectId: "proyecto-1",
    };

    expect(saveProjectStorage(state, storage)).toBe(true);
    expect(loadProjectStorage(storage)).toEqual(state);

    const raw = JSON.parse(storage.getItem(PROJECT_STORAGE_KEY) ?? "{}");
    expect(raw.version).toBe(PROJECT_STORAGE_SCHEMA_VERSION);
  });

  it("conserva el snapshot mínimo del indicador para reproducir tarifas importadas", () => {
    const storage = new MemoryStorage();
    const state = {
      projects: [
        project({
          lines: [
            {
              id: "linea-importada",
              indicatorId: "catalogo-importado-r19",
              indicatorSnapshot: {
                id: "catalogo-importado-r19",
                groupLabel: "Indicadores Arbore actualizados",
                project: "Arbore",
                baseYear: 2027,
                concept: "TORRES",
                originalUnit: "m2",
                finalRate: 3_100_000,
                usage: "selectable",
              },
              quantity: 25_000,
              adjustmentPerUnit: 50_000,
            },
          ],
        }),
      ],
      activeProjectId: "proyecto-1",
    };

    expect(saveProjectStorage(state, storage)).toBe(true);
    expect(loadProjectStorage(storage)).toEqual(state);
  });

  it("keeps older drafts compatible and supplies safe optional defaults", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        version: PROJECT_STORAGE_SCHEMA_VERSION,
        projects: [
          {
            id: "legacy",
            name: "Presupuesto anterior",
            baseProjectId: "rocca",
            lines: [],
          },
        ],
        activeProjectId: "legacy",
      }),
    );

    expect(loadProjectStorage(storage)).toEqual({
      projects: [
        {
          id: "legacy",
          name: "Presupuesto anterior",
          baseProjectId: "rocca",
          lines: [],
          status: "draft",
        },
      ],
      activeProjectId: "legacy",
    });
  });

  it.each([
    "{not-json",
    JSON.stringify({ version: 999, projects: [] }),
    JSON.stringify({ version: PROJECT_STORAGE_SCHEMA_VERSION, projects: {} }),
  ])("ignores corrupt or incompatible data", (raw) => {
    const storage = new MemoryStorage();
    storage.setItem(PROJECT_STORAGE_KEY, raw);

    expect(loadProjectStorage(storage)).toEqual({
      projects: [],
      activeProjectId: null,
    });
  });

  it("sanitizes strings, dates, duplicate IDs and unsafe numbers", () => {
    const storage = new MemoryStorage();
    const longName = ` Proyecto ${"x".repeat(400)} `;

    expect(
      saveProjectStorage(
        {
          projects: [
            project({
              name: longName,
              status: "unexpected" as BudgetDraft["status"],
              savedAt: "not-a-date",
              updatedAt: "2026-10-09T16:00:00Z",
              areaM2: Number.NaN,
              lines: [
                {
                  id: "linea-repetida",
                  indicatorId: "indicador-1",
                  quantity: -10,
                  adjustmentPerUnit: Number.POSITIVE_INFINITY,
                },
                {
                  id: "linea-repetida",
                  indicatorId: "indicador-2",
                  quantity: 20,
                  adjustmentPerUnit: 30,
                },
                {
                  id: "linea-grande",
                  indicatorId: "indicador-3",
                  quantity: Number.MAX_VALUE,
                  adjustmentPerUnit: -Number.MAX_VALUE,
                },
                {
                  id: "",
                  indicatorId: "sin-id-valido",
                  quantity: 1,
                  adjustmentPerUnit: 0,
                },
              ],
            }),
            project({ id: "proyecto-1", name: "Duplicado" }),
          ],
          activeProjectId: "no-existe",
        },
        storage,
      ),
    ).toBe(true);

    const loaded = loadProjectStorage(storage);
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.activeProjectId).toBeNull();
    expect(loaded.projects[0]).toMatchObject({
      status: "draft",
      updatedAt: "2026-10-09T16:00:00.000Z",
      areaM2: 0,
    });
    expect(loaded.projects[0].name).toHaveLength(
      PROJECT_STORAGE_LIMITS.maxNameLength,
    );
    expect(loaded.projects[0].savedAt).toBeUndefined();
    expect(loaded.projects[0].lines).toEqual([
      {
        id: "linea-repetida",
        indicatorId: "indicador-1",
        quantity: 0,
        adjustmentPerUnit: 0,
      },
      {
        id: "linea-grande",
        indicatorId: "indicador-3",
        quantity: PROJECT_STORAGE_LIMITS.maxNumber,
        adjustmentPerUnit: -PROJECT_STORAGE_LIMITS.maxNumber,
      },
    ]);
  });

  it("enforces project and line count limits", () => {
    const projectStorage = new MemoryStorage();
    const projects = Array.from(
      { length: PROJECT_STORAGE_LIMITS.maxProjects + 10 },
      (_, projectIndex) =>
        project({
          id: `proyecto-${projectIndex}`,
          lines: [],
        }),
    );

    expect(
      saveProjectStorage({ projects, activeProjectId: null }, projectStorage),
    ).toBe(true);
    expect(loadProjectStorage(projectStorage).projects).toHaveLength(
      PROJECT_STORAGE_LIMITS.maxProjects,
    );

    const lineStorage = new MemoryStorage();
    const lines = Array.from(
      { length: PROJECT_STORAGE_LIMITS.maxLinesPerProject + 10 },
      (_, lineIndex) => ({
        id: `linea-${lineIndex}`,
        indicatorId: `indicador-${lineIndex}`,
        quantity: lineIndex,
        adjustmentPerUnit: 0,
      }),
    );
    expect(
      saveProjectStorage(
        { projects: [project({ lines })], activeProjectId: null },
        lineStorage,
      ),
    ).toBe(true);
    expect(loadProjectStorage(lineStorage).projects[0].lines).toHaveLength(
      PROJECT_STORAGE_LIMITS.maxLinesPerProject,
    );
  });

  it("refuses to write a sanitized snapshot that exceeds the byte limit", () => {
    const storage = new MemoryStorage();
    const repeated = "x".repeat(PROJECT_STORAGE_LIMITS.maxIdLength - 20);
    const projects = Array.from({ length: 30 }, (_, projectIndex) =>
      project({
        id: `proyecto-${projectIndex}-${repeated}`,
        lines: Array.from(
          { length: PROJECT_STORAGE_LIMITS.maxLinesPerProject },
          (_, lineIndex) => ({
            id: `l-${projectIndex}-${lineIndex}-${repeated}`,
            indicatorId: `i-${projectIndex}-${lineIndex}-${repeated}`,
            quantity: 1,
            adjustmentPerUnit: 0,
          }),
        ),
      }),
    );

    expect(
      saveProjectStorage({ projects, activeProjectId: null }, storage),
    ).toBe(false);
    expect(storage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
  });

  it("rejects an oversized stored payload before parsing it", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PROJECT_STORAGE_KEY,
      "x".repeat(PROJECT_STORAGE_LIMITS.maxBytes + 1),
    );

    expect(loadProjectStorage(storage)).toEqual({
      projects: [],
      activeProjectId: null,
    });
  });

  it("does not mutate caller state while sanitizing", () => {
    const storage = new MemoryStorage();
    const original = {
      projects: [
        project({
          name: `Nombre ${"x".repeat(400)}`,
          areaM2: -20,
          lines: [
            {
              id: "linea-1",
              indicatorId: "indicador-1",
              quantity: -100,
              adjustmentPerUnit: 0,
            },
          ],
        }),
      ],
      activeProjectId: "proyecto-1",
    };
    const snapshot = structuredClone(original);

    saveProjectStorage(original, storage);

    expect(original).toEqual(snapshot);
  });

  it("returns a safe result when storage access throws", () => {
    const unavailable: ProjectStorageAdapter = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };

    expect(loadProjectStorage(unavailable)).toEqual({
      projects: [],
      activeProjectId: null,
    });
    expect(
      saveProjectStorage(
        { projects: [project()], activeProjectId: "proyecto-1" },
        unavailable,
      ),
    ).toBe(false);
  });
});
