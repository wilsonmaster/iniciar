import {
  AlertTriangle,
  Calculator,
  Copy,
  FileSpreadsheet,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { calculateBudget, type BudgetDraft, type BudgetLine } from "../domain/budget";
import {
  filterCostIndicatorsByProject,
  projectDisplayName,
  resolveCostProjectId,
  type CostProjectDefinition,
  type CostProjectId,
} from "../domain/catalogProjects";
import type { CostIndicator, CostIndicatorUsage } from "../domain/types";
import { formatCurrency, formatNumber } from "../utils/format";

export type BudgetLineUpdate = Partial<
  Pick<BudgetLine, "indicatorId" | "quantity" | "adjustmentPerUnit">
>;

export interface BudgetWorkspaceProps {
  drafts: readonly BudgetDraft[];
  activeDraftId: string | null;
  catalog: readonly CostIndicator[];
  projectDefinitions: readonly CostProjectDefinition[];
  onSelectDraft: (draftId: string) => void;
  onRenameDraft: (draftId: string, name: string) => void;
  onCreateDraft: () => void;
  onDuplicateDraft: (draftId: string) => void;
  onAddLine: (draftId: string) => void;
  onUpdateLine: (
    draftId: string,
    lineId: string,
    changes: BudgetLineUpdate,
  ) => void;
  onRemoveLine: (draftId: string, lineId: string) => void;
  onImportAreas: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
  isImporting?: boolean;
}

const USAGE_LABELS: Record<CostIndicatorUsage, string> = {
  selectable: "Referente completo",
  partial: "Indicador parcial",
  administration: "Administración",
  unmapped: "Sin clasificación",
};

const USAGE_WARNINGS: Partial<Record<CostIndicatorUsage, string>> = {
  partial: "Indicador parcial: valide su alcance antes de aprobar el presupuesto.",
  administration: "Administración y gastos generales: ingrese la cantidad en meses.",
  unmapped: "Indicador sin clasificación: revise su alcance y unidad antes de usarlo.",
};

function toFiniteNumber(rawValue: string): number {
  if (rawValue.trim() === "") return 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function projectLabel(
  projectId: string,
  projectDefinitions: readonly CostProjectDefinition[],
): string {
  return (
    projectDefinitions.find((project) => project.id === projectId)?.label ??
    projectDisplayName(projectId)
  );
}

function firstIndicatorForProject(
  catalog: readonly CostIndicator[],
  projectId: CostProjectId,
): CostIndicator | undefined {
  const indicators = filterCostIndicatorsByProject(catalog, projectId);
  return indicators.find((indicator) => indicator.usage === "selectable") ?? indicators[0];
}

function EmptyBudgetWorkspace({ onCreateDraft }: Pick<BudgetWorkspaceProps, "onCreateDraft">) {
  return (
    <section className="budget-workspace budget-workspace-empty">
      <div className="budget-empty-icon" aria-hidden="true">
        <Calculator size={28} />
      </div>
      <h2>Crea tu primer presupuesto</h2>
      <p>
        Selecciona indicadores históricos, ingresa las áreas y ajusta las tarifas sin
        modificar el catálogo original.
      </p>
      <button type="button" className="button button-primary" onClick={onCreateDraft}>
        <Plus size={17} aria-hidden="true" />
        Nuevo presupuesto
      </button>
    </section>
  );
}

export function BudgetWorkspace({
  drafts,
  activeDraftId,
  catalog,
  projectDefinitions,
  onSelectDraft,
  onRenameDraft,
  onCreateDraft,
  onDuplicateDraft,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onImportAreas,
  onDeleteDraft,
  isImporting = false,
}: BudgetWorkspaceProps) {
  const activeDraft =
    drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0];

  if (activeDraft === undefined) {
    return <EmptyBudgetWorkspace onCreateDraft={onCreateDraft} />;
  }

  const calculated = calculateBudget(activeDraft, catalog);
  const calculatedLines = new Map(calculated.lines.map((line) => [line.id, line]));
  const indicatorById = new Map(catalog.map((indicator) => [indicator.id, indicator]));
  const reviewCount = calculated.lines.filter(
    (line) => line.indicator !== null && line.indicator.usage !== "selectable",
  ).length;
  const missingCount = calculated.lines.filter((line) => line.indicator === null).length;
  const baseProjectName = projectLabel(activeDraft.baseProjectId, projectDefinitions);

  return (
    <section className="budget-workspace" aria-labelledby="budget-workspace-heading">
      <div className="budget-tabs-row">
        <div className="budget-tabs" role="tablist" aria-label="Presupuestos abiertos">
          {drafts.map((draft) => {
            const draftCalculation = calculateBudget(draft, catalog);
            const selected = draft.id === activeDraft.id;

            return (
              <button
                key={draft.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`budget-tab${selected ? " is-active" : ""}`}
                onClick={() => onSelectDraft(draft.id)}
              >
                <span>{draft.name}</span>
                <small>{formatCurrency(draftCalculation.total)}</small>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="button button-primary budget-new-button"
          onClick={onCreateDraft}
        >
          <Plus size={17} aria-hidden="true" />
          Nuevo presupuesto
        </button>
      </div>

      <div className="budget-editor-card" role="tabpanel">
        <header className="budget-editor-header">
          <div className="budget-title-field">
            <h2 id="budget-workspace-heading" className="sr-only">
              Editor del presupuesto {activeDraft.name}
            </h2>
            <label htmlFor={`budget-name-${activeDraft.id}`}>Nombre del presupuesto</label>
            <input
              id={`budget-name-${activeDraft.id}`}
              type="text"
              value={activeDraft.name}
              onChange={(event) => onRenameDraft(activeDraft.id, event.target.value)}
            />
            <p>
              Proyecto inicial: <strong>{baseProjectName}</strong>. Puedes mezclar referentes
              de los siete proyectos.
            </p>
          </div>

          <div className="budget-header-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onImportAreas(activeDraft.id)}
              disabled={isImporting}
            >
              <FileSpreadsheet size={17} aria-hidden="true" />
              {isImporting ? "Importando…" : "Subir cuadro de áreas"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onDuplicateDraft(activeDraft.id)}
            >
              <Copy size={17} aria-hidden="true" />
              Duplicar
            </button>
            {onDeleteDraft === undefined ? null : (
              <button
                type="button"
                className="button button-danger-quiet"
                onClick={() => onDeleteDraft(activeDraft.id)}
                aria-label={`Eliminar presupuesto ${activeDraft.name}`}
              >
                <Trash2 size={17} aria-hidden="true" />
                Eliminar
              </button>
            )}
          </div>
        </header>

        {reviewCount + missingCount === 0 ? null : (
          <div className="budget-review-alert" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              {missingCount > 0
                ? `${missingCount} ${missingCount === 1 ? "línea no tiene" : "líneas no tienen"} un indicador válido. `
                : ""}
              {reviewCount > 0
                ? `${reviewCount} ${reviewCount === 1 ? "indicador requiere" : "indicadores requieren"} revisión de alcance.`
                : ""}
            </span>
          </div>
        )}

        <div className="budget-table-wrap">
          <table className="budget-lines-table">
            <caption className="sr-only">Líneas editables del presupuesto {activeDraft.name}</caption>
            <thead>
              <tr>
                <th scope="col">Proyecto referente</th>
                <th scope="col">Indicador</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Ajuste unitario</th>
                <th scope="col">Tarifa final</th>
                <th scope="col">Total</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {activeDraft.lines.map((line, index) => {
                const indicator = indicatorById.get(line.indicatorId);
                const calculatedLine = calculatedLines.get(line.id);
                const lineProjectId = indicator
                  ? resolveCostProjectId(indicator.project)
                  : undefined;
                const availableIndicators = lineProjectId
                  ? filterCostIndicatorsByProject(catalog, lineProjectId)
                  : [];
                const usageWarning = indicator ? USAGE_WARNINGS[indicator.usage] : undefined;

                return (
                  <tr key={line.id} className={usageWarning ? "budget-line-needs-review" : undefined}>
                    <td data-label="Proyecto referente">
                      <select
                        value={lineProjectId ?? ""}
                        aria-label={`Proyecto referente de la línea ${index + 1}`}
                        onChange={(event) => {
                          const projectId = event.target.value as CostProjectId;
                          const nextIndicator = firstIndicatorForProject(catalog, projectId);
                          onUpdateLine(activeDraft.id, line.id, {
                            indicatorId: nextIndicator?.id ?? "",
                          });
                        }}
                      >
                        {lineProjectId === undefined ? (
                          <option value="">Selecciona un proyecto</option>
                        ) : null}
                        {projectDefinitions.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Indicador">
                      <select
                        value={indicator?.id ?? ""}
                        aria-label={`Indicador de la línea ${index + 1}`}
                        disabled={lineProjectId === undefined}
                        onChange={(event) =>
                          onUpdateLine(activeDraft.id, line.id, {
                            indicatorId: event.target.value,
                          })
                        }
                      >
                        {indicator === undefined ? (
                          <option value="">Selecciona un indicador</option>
                        ) : null}
                        {availableIndicators.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.concept} · {USAGE_LABELS[option.usage]}
                          </option>
                        ))}
                      </select>
                      {usageWarning === undefined ? null : (
                        <span className={`budget-line-warning usage-${indicator?.usage ?? "unknown"}`}>
                          <AlertTriangle size={14} aria-hidden="true" />
                          {usageWarning}
                        </span>
                      )}
                      {indicator === undefined ? (
                        <span className="budget-line-warning usage-missing">
                          <AlertTriangle size={14} aria-hidden="true" />
                          El indicador ya no existe en el catálogo. Selecciona otro referente.
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Cantidad">
                      <div className="budget-number-field">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={line.quantity}
                          aria-label={`Cantidad de la línea ${index + 1}`}
                          onChange={(event) =>
                            onUpdateLine(activeDraft.id, line.id, {
                              quantity: toFiniteNumber(event.target.value),
                            })
                          }
                        />
                        <small>{indicator?.originalUnit ?? "unidad"}</small>
                      </div>
                    </td>
                    <td data-label="Ajuste unitario">
                      <div className="budget-number-field">
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={line.adjustmentPerUnit}
                          aria-label={`Ajuste unitario de la línea ${index + 1}`}
                          onChange={(event) =>
                            onUpdateLine(activeDraft.id, line.id, {
                              adjustmentPerUnit: toFiniteNumber(event.target.value),
                            })
                          }
                        />
                        <small>COP/{indicator?.originalUnit ?? "unidad"}</small>
                      </div>
                    </td>
                    <td data-label="Tarifa final" className="budget-money-cell">
                      <strong>
                        {calculatedLine?.finalRate === null || calculatedLine === undefined
                          ? "—"
                          : formatCurrency(calculatedLine.finalRate)}
                      </strong>
                      {indicator === undefined ? null : (
                        <small>Base {formatCurrency(calculatedLine?.baseRate ?? 0)}</small>
                      )}
                    </td>
                    <td data-label="Total" className="budget-money-cell budget-line-total">
                      <strong>{formatCurrency(calculatedLine?.amount ?? 0)}</strong>
                    </td>
                    <td className="budget-line-actions">
                      <button
                        type="button"
                        className="icon-button icon-button-danger"
                        aria-label={`Quitar línea ${index + 1}`}
                        onClick={() => onRemoveLine(activeDraft.id, line.id)}
                      >
                        <X size={17} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {activeDraft.lines.length === 0 ? (
            <div className="budget-lines-empty">
              <p>Este presupuesto todavía no tiene indicadores.</p>
              <span>Agrega una línea o sube el cuadro de áreas para comenzar.</span>
            </div>
          ) : null}
        </div>

        <footer className="budget-editor-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onAddLine(activeDraft.id)}
          >
            <Plus size={17} aria-hidden="true" />
            Agregar indicador
          </button>

          <div className="budget-summary" aria-label="Resumen del presupuesto">
            <span>
              <small>Indicadores</small>
              <strong>{formatNumber(activeDraft.lines.length)}</strong>
            </span>
            <span>
              <small>Por revisar</small>
              <strong>{formatNumber(reviewCount + missingCount)}</strong>
            </span>
            <span className="budget-grand-total">
              <small>Total del presupuesto</small>
              <strong>{formatCurrency(calculated.total)}</strong>
            </span>
          </div>
        </footer>
      </div>
    </section>
  );
}

