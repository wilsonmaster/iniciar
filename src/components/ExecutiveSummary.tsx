import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  CircleDollarSign,
  FileDown,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Pencil,
  Ruler,
  Sparkles,
  Trash2,
} from "lucide-react";

export type ExecutiveMetricTone = "blue" | "green" | "amber" | "ink";
export type ExecutiveMetricIcon =
  | "budget"
  | "area"
  | "unit-cost"
  | "variance"
  | "lines"
  | "project";

/**
 * Presentation-only metric. `value` and `note` should arrive formatted because
 * this component deliberately has no knowledge of currencies or calculations.
 */
export interface ExecutiveMetric {
  id: string;
  label: string;
  value: string;
  note?: string;
  tone?: ExecutiveMetricTone;
  icon?: ExecutiveMetricIcon;
}

export interface ExecutiveComparisonSeries {
  id: string;
  label: string;
}

export interface ExecutiveComparisonCategory {
  id: string;
  label: string;
  primaryValue: number;
  primaryLabel: string;
  secondaryValue: number;
  secondaryLabel: string;
}

/** Exactly two series are rendered for every comparison category. */
export interface ExecutiveComparison {
  title: string;
  description?: string;
  primarySeries: ExecutiveComparisonSeries;
  secondarySeries: ExecutiveComparisonSeries;
  categories: readonly ExecutiveComparisonCategory[];
}

export type ExecutiveLineStatusTone = "good" | "warning" | "danger" | "neutral";

export interface ExecutiveSummaryLine {
  id: string;
  chapter: string;
  referenceProject: string;
  referenceIndicator: string;
  quantity: string;
  unitRate: string;
  total: string;
  status?: {
    label: string;
    tone: ExecutiveLineStatusTone;
  };
}

export type ExecutiveAnalysisStatus = "idle" | "loading" | "ready" | "error";

/** Serializable result returned by the future analysis service. */
export interface ExecutiveAnalysis {
  status: ExecutiveAnalysisStatus;
  summary?: string;
  recommendations: readonly string[];
  clarifications: readonly string[];
  reviewPoints: readonly string[];
  errorMessage?: string;
  generatedAt?: string;
  methodologyNote?: string;
}

export interface ExecutiveSummaryProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  statusLabel?: string;
  metrics: readonly ExecutiveMetric[];
  comparison: ExecutiveComparison;
  lines: readonly ExecutiveSummaryLine[];
  analysis: ExecutiveAnalysis;
  onAnalyzeWithAi: () => void;
  onExportPdf: () => void;
  onEditProject?: () => void;
  onDeleteProject?: () => void;
  isExporting?: boolean;
  analysisDisabled?: boolean;
  exportDisabled?: boolean;
}

const METRIC_ICONS = {
  budget: CircleDollarSign,
  area: Ruler,
  "unit-cost": BarChart3,
  variance: AlertTriangle,
  lines: ListChecks,
  project: Building2,
} as const;

function ExecutiveMetricCard({ metric }: { metric: ExecutiveMetric }) {
  const MetricIcon = METRIC_ICONS[metric.icon ?? "budget"];

  return (
    <article className={`executive-metric executive-metric-${metric.tone ?? "blue"}`}>
      <div className="executive-metric-heading">
        <span>{metric.label}</span>
        <span className="executive-metric-icon" aria-hidden="true">
          <MetricIcon size={19} />
        </span>
      </div>
      <strong>{metric.value}</strong>
      {metric.note === undefined ? null : <p>{metric.note}</p>}
    </article>
  );
}

function ComparisonChart({ comparison }: { comparison: ExecutiveComparison }) {
  const comparableMagnitude = (value: number): number =>
    Number.isFinite(value) ? Math.abs(value) : 0;
  const largestValue = Math.max(
    0,
    ...comparison.categories.flatMap((category) => [
      comparableMagnitude(category.primaryValue),
      comparableMagnitude(category.secondaryValue),
    ]),
  );

  const barWidth = (value: number): string =>
    largestValue === 0
      ? "0%"
      : `${Math.max(2, (comparableMagnitude(value) / largestValue) * 100)}%`;

  return (
    <section className="executive-panel executive-comparison" aria-labelledby="executive-chart-title">
      <header className="executive-panel-heading">
        <div>
          <span className="executive-section-kicker">Comparación</span>
          <h2 id="executive-chart-title">{comparison.title}</h2>
          {comparison.description === undefined ? null : <p>{comparison.description}</p>}
        </div>
        <BarChart3 size={22} aria-hidden="true" />
      </header>

      <div className="executive-chart-legend" aria-label="Series comparadas">
        <span>
          <i className="executive-legend-swatch executive-legend-primary" aria-hidden="true" />
          {comparison.primarySeries.label}
        </span>
        <span>
          <i className="executive-legend-swatch executive-legend-secondary" aria-hidden="true" />
          {comparison.secondarySeries.label}
        </span>
      </div>

      {comparison.categories.length === 0 ? (
        <p className="executive-empty-state">No hay valores comparables para este proyecto.</p>
      ) : (
        <div className="executive-chart" aria-label={comparison.title}>
          {comparison.categories.map((category) => (
            <div className="executive-chart-category" key={category.id}>
              <strong>{category.label}</strong>
              <div className="executive-bar-row">
                <span className="executive-bar-series-label">
                  {comparison.primarySeries.label}
                </span>
                <div className="executive-bar-track">
                  <span
                    className={`executive-bar executive-bar-primary${category.primaryValue < 0 ? " is-negative" : ""}`}
                    style={{ width: barWidth(category.primaryValue) }}
                  />
                </div>
                <span className="executive-bar-value">{category.primaryLabel}</span>
              </div>
              <div className="executive-bar-row">
                <span className="executive-bar-series-label">
                  {comparison.secondarySeries.label}
                </span>
                <div className="executive-bar-track">
                  <span
                    className={`executive-bar executive-bar-secondary${category.secondaryValue < 0 ? " is-negative" : ""}`}
                    style={{ width: barWidth(category.secondaryValue) }}
                  />
                </div>
                <span className="executive-bar-value">{category.secondaryLabel}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AnalysisList({
  title,
  items,
  icon,
}: {
  title: string;
  items: readonly string[];
  icon: "recommendation" | "clarification" | "review";
}) {
  const Icon =
    icon === "recommendation"
      ? Lightbulb
      : icon === "clarification"
        ? MessageCircleQuestion
        : AlertTriangle;

  return (
    <section className={`executive-analysis-group executive-analysis-${icon}`}>
      <h3>
        <Icon size={18} aria-hidden="true" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="executive-analysis-empty">Sin observaciones en esta categoría.</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${icon}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AnalysisPanel({ analysis }: { analysis: ExecutiveAnalysis }) {
  const isLoading = analysis.status === "loading";

  return (
    <section
      className="executive-panel executive-analysis"
      aria-labelledby="executive-analysis-title"
      aria-live="polite"
      aria-busy={isLoading}
    >
      <header className="executive-panel-heading">
        <div>
          <span className="executive-section-kicker">Asistencia para la decisión</span>
          <h2 id="executive-analysis-title">Análisis inteligente</h2>
        </div>
        <Sparkles size={22} aria-hidden="true" />
      </header>

      {analysis.status === "idle" ? (
        <div className="executive-analysis-placeholder">
          <Bot size={28} aria-hidden="true" />
          <p>
            Solicita un análisis para contrastar el presupuesto con sus indicadores y
            generar recomendaciones para el contexto colombiano.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="executive-analysis-placeholder">
          <span className="executive-loading-indicator" aria-hidden="true" />
          <p>Analizando valores, referentes y diferencias…</p>
        </div>
      ) : null}

      {analysis.status === "error" ? (
        <div className="executive-analysis-error" role="alert">
          <AlertTriangle size={19} aria-hidden="true" />
          <p>{analysis.errorMessage ?? "No fue posible completar el análisis."}</p>
        </div>
      ) : null}

      {analysis.status === "ready" ? (
        <div className="executive-analysis-result">
          {analysis.summary === undefined ? null : (
            <p className="executive-analysis-summary">{analysis.summary}</p>
          )}
          <div className="executive-analysis-columns">
            <AnalysisList
              title="Recomendaciones"
              items={analysis.recommendations}
              icon="recommendation"
            />
            <AnalysisList
              title="Aclaraciones"
              items={analysis.clarifications}
              icon="clarification"
            />
            <AnalysisList
              title="Puntos a revisar"
              items={analysis.reviewPoints}
              icon="review"
            />
          </div>
          {analysis.generatedAt === undefined ? null : (
            <p className="executive-analysis-date">Análisis generado: {analysis.generatedAt}</p>
          )}
          {analysis.methodologyNote === undefined ? null : (
            <p className="executive-analysis-note">{analysis.methodologyNote}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ExecutiveSummary({
  title,
  subtitle,
  eyebrow = "Resumen ejecutivo",
  statusLabel,
  metrics,
  comparison,
  lines,
  analysis,
  onAnalyzeWithAi,
  onExportPdf,
  onEditProject,
  onDeleteProject,
  isExporting = false,
  analysisDisabled = false,
  exportDisabled = false,
}: ExecutiveSummaryProps) {
  const isAnalyzing = analysis.status === "loading";

  return (
    <section className="executive-summary" aria-labelledby="executive-summary-title">
      <header className="executive-header">
        <div className="executive-title-block">
          <span className="executive-eyebrow">{eyebrow}</span>
          <h1 id="executive-summary-title">{title}</h1>
          {subtitle === undefined ? null : <p>{subtitle}</p>}
          {statusLabel === undefined ? null : (
            <span className="executive-status">{statusLabel}</span>
          )}
        </div>

        <div className="executive-actions" aria-label="Acciones del proyecto">
          {onEditProject === undefined ? null : (
            <button
              type="button"
              className="button button-secondary executive-action executive-action-secondary"
              onClick={onEditProject}
            >
              <Pencil size={17} aria-hidden="true" />
              Editar proyecto
            </button>
          )}
          {onDeleteProject === undefined ? null : (
            <button
              type="button"
              className="button button-danger-quiet executive-action executive-action-danger"
              onClick={onDeleteProject}
            >
              <Trash2 size={17} aria-hidden="true" />
              Eliminar proyecto
            </button>
          )}
          <button
            type="button"
            className="button button-secondary executive-action executive-action-secondary"
            onClick={onAnalyzeWithAi}
            disabled={analysisDisabled || isAnalyzing}
          >
            <Sparkles size={17} aria-hidden="true" />
            {isAnalyzing ? "Analizando…" : "Analizar con IA"}
          </button>
          <button
            type="button"
            className="button button-primary executive-action executive-action-primary"
            onClick={onExportPdf}
            disabled={exportDisabled || isExporting}
          >
            <FileDown size={17} aria-hidden="true" />
            {isExporting ? "Generando PDF…" : "Exportar informe PDF"}
          </button>
        </div>
      </header>

      {metrics.length === 0 ? null : (
        <div className="executive-metrics" aria-label="Indicadores principales">
          {metrics.map((metric) => (
            <ExecutiveMetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      )}

      <ComparisonChart comparison={comparison} />

      <section className="executive-panel executive-lines" aria-labelledby="executive-lines-title">
        <header className="executive-panel-heading">
          <div>
            <span className="executive-section-kicker">Trazabilidad</span>
            <h2 id="executive-lines-title">Partidas y referentes utilizados</h2>
          </div>
          <ListChecks size={22} aria-hidden="true" />
        </header>

        {lines.length === 0 ? (
          <p className="executive-empty-state">Este proyecto todavía no tiene partidas calculadas.</p>
        ) : (
          <div className="executive-table-wrap">
            <table className="executive-table">
              <caption className="sr-only">Partidas y referentes del proyecto {title}</caption>
              <thead>
                <tr>
                  <th scope="col">Partida</th>
                  <th scope="col">Proyecto referente</th>
                  <th scope="col">Indicador</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Tarifa final</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <th scope="row">{line.chapter}</th>
                    <td data-label="Proyecto referente">{line.referenceProject}</td>
                    <td data-label="Indicador">{line.referenceIndicator}</td>
                    <td data-label="Cantidad">{line.quantity}</td>
                    <td data-label="Tarifa final">{line.unitRate}</td>
                    <td data-label="Total"><strong>{line.total}</strong></td>
                    <td data-label="Estado">
                      {line.status === undefined ? (
                        <span className="executive-line-status executive-line-neutral">Sin clasificar</span>
                      ) : (
                        <span className={`executive-line-status executive-line-${line.status.tone}`}>
                          {line.status.label}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AnalysisPanel analysis={analysis} />
    </section>
  );
}
