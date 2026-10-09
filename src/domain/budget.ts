import type { CostIndicator } from "./types";
import { resolveCostProjectId } from "./catalogProjects";

/**
 * Minimal immutable copy of the selected catalogue row.
 *
 * Budgets keep this snapshot so an imported tariff remains reproducible after
 * the browser is reopened or a different catalogue is loaded.
 */
export interface BudgetIndicatorSnapshot {
  id: string;
  groupLabel: string;
  project: string;
  baseYear: number;
  concept: string;
  originalUnit: string;
  finalRate: number;
  usage: CostIndicator["usage"];
}

export type BudgetIndicatorReference = CostIndicator | BudgetIndicatorSnapshot;

export function snapshotBudgetIndicator(
  indicator: CostIndicator,
): BudgetIndicatorSnapshot {
  return {
    id: indicator.id,
    groupLabel: indicator.groupLabel,
    project: indicator.project,
    baseYear: indicator.baseYear,
    concept: indicator.concept,
    originalUnit: indicator.originalUnit,
    finalRate: indicator.finalRate,
    usage: indicator.usage,
  };
}

/** One editable row in a new budget. */
export interface BudgetLine {
  id: string;
  indicatorId: string;
  /** Frozen tariff and labels used when this line was selected. */
  indicatorSnapshot?: BudgetIndicatorSnapshot;
  quantity: number;
  /** Additional COP per unit applied on top of the catalogue final rate. */
  adjustmentPerUnit: number;
}

/**
 * A budget is independent from the historical workbook. `baseProjectId` is the
 * catalogue project key used to seed it (for example `Serraclara`).
 */
export interface BudgetDraft {
  id: string;
  name: string;
  baseProjectId: string;
  lines: BudgetLine[];
  /** Lifecycle in the user's project workspace. Older drafts may omit it. */
  status?: "draft" | "active";
  /** ISO timestamp set when a draft is first promoted to an active project. */
  savedAt?: string;
  /** ISO timestamp of the latest user edit. */
  updatedAt?: string;
  /** Optional total project area used by summaries and per-m2 comparisons. */
  areaM2?: number;
}

export type BudgetCalculationIssueCode =
  | "missing-indicator"
  | "invalid-quantity"
  | "invalid-adjustment"
  | "invalid-base-rate"
  | "invalid-final-rate"
  | "invalid-amount"
  | "invalid-total";

export interface BudgetCalculationIssue {
  code: BudgetCalculationIssueCode;
  lineId?: string;
  indicatorId?: string;
  message: string;
}

export interface CalculatedBudgetLine {
  id: string;
  indicatorId: string;
  indicator: BudgetIndicatorReference | null;
  /** Always finite and non-negative. Invalid input is reported and becomes 0. */
  quantity: number;
  baseRate: number | null;
  /** Always finite. Invalid input is reported and becomes 0. */
  adjustmentPerUnit: number;
  finalRate: number | null;
  /** Always finite and non-negative. A line that cannot be calculated is 0. */
  amount: number;
  issues: BudgetCalculationIssue[];
}

export interface CalculatedBudget {
  draftId: string;
  name: string;
  baseProjectId: string;
  lines: CalculatedBudgetLine[];
  /** Sum of every calculable line. It stays finite and non-negative. */
  total: number;
  status: "complete" | "needs-review";
  issues: BudgetCalculationIssue[];
}

export type BudgetDraftSeed = Pick<
  BudgetDraft,
  "id" | "name" | "baseProjectId"
>;

/**
 * Creates a safe starting point for a new budget.
 *
 * Only complete/selectable catalogue rows are included. Quantities deliberately
 * start at zero: `basisQuantity` describes the historical reference project and
 * must not be mistaken for the area of the new project being budgeted.
 */
export function createBudgetDraftFromProject(
  seed: BudgetDraftSeed,
  catalog: readonly CostIndicator[],
): BudgetDraft {
  const projectId = resolveCostProjectId(seed.baseProjectId);

  return {
    ...seed,
    lines: catalog
      .filter(
        (indicator) =>
          indicator.usage === "selectable" &&
          projectId !== undefined &&
          resolveCostProjectId(indicator.project) === projectId,
      )
      .map((indicator) => ({
        id: `${seed.id}:indicator:${indicator.id}`,
        indicatorId: indicator.id,
        indicatorSnapshot: snapshotBudgetIndicator(indicator),
        quantity: 0,
        adjustmentPerUnit: 0,
      })),
  };
}

function issue(
  code: BudgetCalculationIssueCode,
  line: BudgetLine,
  message: string,
): BudgetCalculationIssue {
  return {
    code,
    lineId: line.id,
    indicatorId: line.indicatorId,
    message,
  };
}

/** Calculates a budget without mutating the draft or the catalogue. */
export function calculateBudget(
  draft: BudgetDraft,
  catalog: readonly CostIndicator[],
): CalculatedBudget {
  const indicatorById = new Map(
    catalog.map((indicator) => [indicator.id, indicator] as const),
  );
  const issues: BudgetCalculationIssue[] = [];

  const lines = draft.lines.map((line): CalculatedBudgetLine => {
    const lineIssues: BudgetCalculationIssue[] = [];
    const indicator =
      (line.indicatorSnapshot?.id === line.indicatorId
        ? line.indicatorSnapshot
        : undefined) ??
      indicatorById.get(line.indicatorId) ??
      null;

    const quantityIsValid =
      Number.isFinite(line.quantity) && line.quantity >= 0;
    const quantity = quantityIsValid ? line.quantity : 0;
    if (!quantityIsValid) {
      lineIssues.push(
        issue(
          "invalid-quantity",
          line,
          "La cantidad debe ser un número finito mayor o igual a cero.",
        ),
      );
    }

    const adjustmentIsValid = Number.isFinite(line.adjustmentPerUnit);
    const adjustmentPerUnit = adjustmentIsValid ? line.adjustmentPerUnit : 0;
    if (!adjustmentIsValid) {
      lineIssues.push(
        issue(
          "invalid-adjustment",
          line,
          "El ajuste unitario debe ser un número finito.",
        ),
      );
    }

    let baseRate: number | null = null;
    let finalRate: number | null = null;
    let amount = 0;

    if (indicator === null) {
      lineIssues.push(
        issue(
          "missing-indicator",
          line,
          `No existe el indicador ${line.indicatorId} en el catálogo.`,
        ),
      );
    } else if (
      !Number.isFinite(indicator.finalRate) ||
      indicator.finalRate < 0
    ) {
      lineIssues.push(
        issue(
          "invalid-base-rate",
          line,
          "La tarifa base del indicador debe ser finita y no negativa.",
        ),
      );
    } else {
      baseRate = indicator.finalRate;
      const candidateFinalRate = baseRate + adjustmentPerUnit;

      if (!Number.isFinite(candidateFinalRate) || candidateFinalRate < 0) {
        lineIssues.push(
          issue(
            "invalid-final-rate",
            line,
            "La tarifa final debe ser finita y no negativa.",
          ),
        );
      } else {
        finalRate = candidateFinalRate;
        const candidateAmount = quantity * finalRate;

        if (!Number.isFinite(candidateAmount) || candidateAmount < 0) {
          lineIssues.push(
            issue(
              "invalid-amount",
              line,
              "El total de la línea excede el rango numérico permitido.",
            ),
          );
        } else {
          amount = candidateAmount;
        }
      }
    }

    issues.push(...lineIssues);

    return {
      id: line.id,
      indicatorId: line.indicatorId,
      indicator,
      quantity,
      baseRate,
      adjustmentPerUnit,
      finalRate,
      amount,
      issues: lineIssues,
    };
  });

  let total = 0;
  for (const line of lines) {
    const candidateTotal = total + line.amount;
    if (!Number.isFinite(candidateTotal) || candidateTotal < 0) {
      issues.push({
        code: "invalid-total",
        message:
          "El total del presupuesto excede el rango numérico permitido.",
      });
      break;
    }
    total = candidateTotal;
  }

  return {
    draftId: draft.id,
    name: draft.name,
    baseProjectId: draft.baseProjectId,
    lines,
    total,
    status: issues.length === 0 ? "complete" : "needs-review",
    issues,
  };
}
