import type {
  BudgetDraft,
  BudgetIndicatorSnapshot,
  BudgetLine,
} from "./budget";

export const PROJECT_STORAGE_KEY = "cabida:active-projects";
export const PROJECT_STORAGE_SCHEMA_VERSION = 1;

/** Defensive limits keep malformed local data from blocking the application. */
export const PROJECT_STORAGE_LIMITS = {
  maxBytes: 1_500_000,
  maxProjects: 100,
  maxLinesPerProject: 500,
  maxIdLength: 160,
  maxNameLength: 200,
  maxProjectIdLength: 100,
  maxNumber: 1_000_000_000_000_000,
} as const;

export interface ProjectStorageState {
  projects: BudgetDraft[];
  /** ID of the active saved budget, not the historical catalogue selection. */
  activeProjectId: string | null;
}

export interface ProjectStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredProjectEnvelope {
  version: typeof PROJECT_STORAGE_SCHEMA_VERSION;
  projects: BudgetDraft[];
  activeProjectId: string | null;
}

const EMPTY_STATE: ProjectStorageState = {
  projects: [],
  activeProjectId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

function finiteNumber(
  value: unknown,
  options: { minimum: number; maximum: number; fallback: number },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return options.fallback;
  }
  return Math.min(options.maximum, Math.max(options.minimum, value));
}

function optionalIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 50) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

const INDICATOR_USAGES = new Set([
  "selectable",
  "partial",
  "administration",
  "unmapped",
]);

function sanitizeIndicatorSnapshot(
  value: unknown,
  indicatorId: string,
): BudgetIndicatorSnapshot | undefined {
  if (!isRecord(value)) return undefined;

  const id = boundedString(value.id, PROJECT_STORAGE_LIMITS.maxIdLength);
  const groupLabel = boundedString(value.groupLabel, 500);
  const project = boundedString(value.project, PROJECT_STORAGE_LIMITS.maxNameLength);
  const concept = boundedString(value.concept, 500);
  const originalUnit = boundedString(value.originalUnit, 50);
  const usage = typeof value.usage === "string" ? value.usage : "";
  const baseYear = value.baseYear;
  const finalRate = value.finalRate;

  if (
    id !== indicatorId ||
    !groupLabel ||
    !project ||
    !concept ||
    !originalUnit ||
    !INDICATOR_USAGES.has(usage) ||
    typeof baseYear !== "number" ||
    !Number.isInteger(baseYear) ||
    baseYear < 1900 ||
    baseYear > 3000 ||
    typeof finalRate !== "number" ||
    !Number.isFinite(finalRate) ||
    finalRate < 0 ||
    finalRate > PROJECT_STORAGE_LIMITS.maxNumber
  ) {
    return undefined;
  }

  return {
    id,
    groupLabel,
    project,
    baseYear,
    concept,
    originalUnit,
    finalRate,
    usage: usage as BudgetIndicatorSnapshot["usage"],
  };
}

function sanitizeLine(value: unknown): BudgetLine | null {
  if (!isRecord(value)) return null;

  const id = boundedString(value.id, PROJECT_STORAGE_LIMITS.maxIdLength);
  const indicatorId = boundedString(
    value.indicatorId,
    PROJECT_STORAGE_LIMITS.maxIdLength,
  );
  if (!id || !indicatorId) return null;

  const indicatorSnapshot = sanitizeIndicatorSnapshot(
    value.indicatorSnapshot,
    indicatorId,
  );

  return {
    id,
    indicatorId,
    ...(indicatorSnapshot === undefined ? {} : { indicatorSnapshot }),
    quantity: finiteNumber(value.quantity, {
      minimum: 0,
      maximum: PROJECT_STORAGE_LIMITS.maxNumber,
      fallback: 0,
    }),
    adjustmentPerUnit: finiteNumber(value.adjustmentPerUnit, {
      minimum: -PROJECT_STORAGE_LIMITS.maxNumber,
      maximum: PROJECT_STORAGE_LIMITS.maxNumber,
      fallback: 0,
    }),
  };
}

function sanitizeProject(value: unknown): BudgetDraft | null {
  if (!isRecord(value)) return null;

  const id = boundedString(value.id, PROJECT_STORAGE_LIMITS.maxIdLength);
  const baseProjectId = boundedString(
    value.baseProjectId,
    PROJECT_STORAGE_LIMITS.maxProjectIdLength,
  );
  if (!id || !baseProjectId) return null;

  const name =
    boundedString(value.name, PROJECT_STORAGE_LIMITS.maxNameLength) ??
    "Proyecto sin nombre";
  const rawLines = Array.isArray(value.lines) ? value.lines : [];
  const lineIds = new Set<string>();
  const lines: BudgetLine[] = [];

  for (const rawLine of rawLines) {
    if (lines.length >= PROJECT_STORAGE_LIMITS.maxLinesPerProject) break;
    const line = sanitizeLine(rawLine);
    if (!line || lineIds.has(line.id)) continue;
    lineIds.add(line.id);
    lines.push(line);
  }

  const project: BudgetDraft = {
    id,
    name,
    baseProjectId,
    lines,
    status: value.status === "active" ? "active" : "draft",
  };

  const savedAt = optionalIsoDate(value.savedAt);
  const updatedAt = optionalIsoDate(value.updatedAt);
  if (savedAt) project.savedAt = savedAt;
  if (updatedAt) project.updatedAt = updatedAt;

  if (Object.prototype.hasOwnProperty.call(value, "areaM2")) {
    project.areaM2 = finiteNumber(value.areaM2, {
      minimum: 0,
      maximum: PROJECT_STORAGE_LIMITS.maxNumber,
      fallback: 0,
    });
  }

  return project;
}

function sanitizeState(value: unknown): ProjectStorageState {
  if (!isRecord(value) || !Array.isArray(value.projects)) {
    return { ...EMPTY_STATE };
  }

  const projects: BudgetDraft[] = [];
  const projectIds = new Set<string>();
  for (const rawProject of value.projects) {
    if (projects.length >= PROJECT_STORAGE_LIMITS.maxProjects) break;
    const project = sanitizeProject(rawProject);
    if (!project || projectIds.has(project.id)) continue;
    projectIds.add(project.id);
    projects.push(project);
  }

  const requestedActiveId = boundedString(
    value.activeProjectId,
    PROJECT_STORAGE_LIMITS.maxIdLength,
  );

  return {
    projects,
    activeProjectId:
      requestedActiveId && projectIds.has(requestedActiveId)
        ? requestedActiveId
        : null,
  };
}

function defaultStorage(): ProjectStorageAdapter | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    let bytes = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 &&
        value.charCodeAt(index + 1) <= 0xdfff
      ) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }
}

/**
 * Loads only the current, valid schema. Corrupt, oversized or incompatible
 * local data is deliberately ignored so it can never prevent app startup.
 */
export function loadProjectStorage(
  storage: ProjectStorageAdapter | null = defaultStorage(),
): ProjectStorageState {
  if (!storage) return { ...EMPTY_STATE };

  try {
    const raw = storage.getItem(PROJECT_STORAGE_KEY);
    if (!raw || byteLength(raw) > PROJECT_STORAGE_LIMITS.maxBytes) {
      return { ...EMPTY_STATE };
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== PROJECT_STORAGE_SCHEMA_VERSION
    ) {
      return { ...EMPTY_STATE };
    }

    return sanitizeState(parsed);
  } catch {
    return { ...EMPTY_STATE };
  }
}

/**
 * Persists a sanitized schema snapshot. Returns false for unavailable storage,
 * quota/security failures, or a payload that still exceeds the size limit.
 */
export function saveProjectStorage(
  state: ProjectStorageState,
  storage: ProjectStorageAdapter | null = defaultStorage(),
): boolean {
  if (!storage) return false;

  try {
    const sanitized = sanitizeState(state);
    const envelope: StoredProjectEnvelope = {
      version: PROJECT_STORAGE_SCHEMA_VERSION,
      ...sanitized,
    };
    const serialized = JSON.stringify(envelope);
    if (byteLength(serialized) > PROJECT_STORAGE_LIMITS.maxBytes) return false;
    storage.setItem(PROJECT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
