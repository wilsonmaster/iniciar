import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpenText,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  Copy,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  UploadCloud,
  X,
} from "lucide-react";
import { Fragment, type ChangeEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKBOOK } from "./data/defaultWorkbook";
import { estimateScenario } from "./domain/estimate";
import { suggestReferenceIds } from "./domain/referenceCandidates";
import type {
  ChapterKey,
  CostIndicator,
  CostReference,
  EstimateConfig,
  EstimateLineItem,
  EstimateResult,
  EstimateWarning,
  ScenarioAreas,
  ScenarioInput,
  ProjectType,
  WorkbookModel,
} from "./domain/types";
import { downloadCsv } from "./utils/csv";
import {
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedNumber,
} from "./utils/format";

type View = "overview" | "scenarios" | "references" | "import";
type ProjectTypeFilter = "all" | ProjectType;
type UploadState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "success"; fileName: string; message: string }
  | { status: "error"; fileName?: string; message: string };

const CHAPTER_LABELS: Record<ChapterKey, string> = {
  "vis-towers": "Torres VIS",
  "non-vis-towers": "Torres No VIS",
  "parking-building": "Edificio de parqueaderos",
  "common-areas": "Zonas comunes",
  "internal-urbanism": "Urbanismo interno",
  preliminaries: "Preliminares",
};

const AREA_FIELD_BY_CHAPTER: Record<ChapterKey, keyof ScenarioAreas> = {
  "vis-towers": "visBuilt",
  "non-vis-towers": "nonVisBuilt",
  "parking-building": "parkingBuilt",
  "common-areas": "commonBuilt",
  "internal-urbanism": "internalUrbanism",
  preliminaries: "constructedTotal",
};

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  "residential-tower": "Vivienda en torre",
  office: "Oficinas",
  houses: "Casas",
};

const ASSET_CLASS_LABELS: Record<CostReference["context"]["assetClass"], string> = {
  residential: "vivienda",
  office: "oficinas",
  houses: "casas",
  mixed: "uso mixto",
};

const INDICATOR_USAGE_LABELS: Record<CostIndicator["usage"], string> = {
  selectable: "Disponible como referente",
  partial: "Indicador parcial",
  administration: "Administración",
  unmapped: "Requiere clasificación",
};

const NAV_ITEMS: Array<{
  id: View;
  label: string;
  caption: string;
  icon: typeof Home;
}> = [
  { id: "overview", label: "Resumen ejecutivo", caption: "Decisión y comparación", icon: LayoutDashboard },
  { id: "scenarios", label: "Escenarios", caption: "Cantidades y supuestos", icon: SlidersHorizontal },
  { id: "references", label: "Indicadores", caption: "Biblioteca trazable", icon: Database },
  { id: "import", label: "Importar Excel", caption: "Conciliación de fuente", icon: FileSpreadsheet },
];

function cloneScenario(scenario: ScenarioInput): ScenarioInput {
  return structuredClone(scenario);
}

function safeNumber(rawValue: string): number {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function chapterAdjustmentPerUnit(line: EstimateLineItem): number {
  return line.adjustmentPerUnit;
}

function percentageDifference(value: number, baseline: number): number {
  return baseline === 0 ? 0 : (value - baseline) / baseline;
}

function severityLabel(warnings: readonly EstimateWarning[]): string {
  if (warnings.some((warning) => warning.severity === "error")) return "Requiere corrección";
  if (warnings.some((warning) => warning.severity === "warning")) return "Revisar supuestos";
  return "Datos conciliados";
}

function isReferenceAssetCompatible(reference: CostReference, scenario: ScenarioInput): boolean {
  const referenceClass = reference.context.assetClass;
  const scenarioClass = scenario.context.assetClass;
  return referenceClass === scenarioClass || referenceClass === "mixed" || scenarioClass === "mixed";
}

function MetricCard({
  label,
  value,
  note,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  note: ReactNode;
  icon: ReactNode;
  tone?: "blue" | "green" | "amber" | "ink";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-head">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function StatusDot({ status }: { status: "good" | "warning" | "muted" }) {
  return <span className={`status-dot status-${status}`} aria-hidden="true" />;
}

function App() {
  const [workbook, setWorkbook] = useState<WorkbookModel>(DEFAULT_WORKBOOK);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(() =>
    DEFAULT_WORKBOOK.scenarios.map(cloneScenario),
  );
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    DEFAULT_WORKBOOK.scenarios[0]?.id ?? "",
  );
  const [comparisonScenarioId, setComparisonScenarioId] = useState(
    DEFAULT_WORKBOOK.scenarios[1]?.id ?? DEFAULT_WORKBOOK.scenarios[0]?.id ?? "",
  );
  const [scenarioConfigs, setScenarioConfigs] = useState<Record<string, EstimateConfig>>(() =>
    Object.fromEntries(
      DEFAULT_WORKBOOK.scenarios.map((scenario) => [scenario.id, { ...DEFAULT_WORKBOOK.config }]),
    ),
  );
  const [referenceSearch, setReferenceSearch] = useState("");
  const [projectTypeFilter, setProjectTypeFilter] = useState<ProjectTypeFilter>("all");
  const [selectedChapter, setSelectedChapter] = useState<ChapterKey>("vis-towers");
  const [manualReferenceSelections, setManualReferenceSelections] = useState<Set<string>>(
    () => new Set(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const configFor = (scenarioId: string): EstimateConfig =>
    scenarioConfigs[scenarioId] ?? workbook.config;

  const estimates = useMemo(
    () =>
      new Map(
        scenarios.map((scenario) => [
          scenario.id,
          estimateScenario(scenario, workbook.references, configFor(scenario.id)),
        ]),
      ),
    [scenarios, scenarioConfigs, workbook],
  );

  const selectedScenario =
    scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  const comparisonScenario =
    scenarios.find((scenario) => scenario.id === comparisonScenarioId) ?? scenarios[1] ?? scenarios[0];
  const selectedEstimate = selectedScenario ? estimates.get(selectedScenario.id) : undefined;
  const comparisonEstimate = comparisonScenario ? estimates.get(comparisonScenario.id) : undefined;

  const updateScenario = (scenarioId: string, updater: (scenario: ScenarioInput) => ScenarioInput) => {
    setScenarios((current) =>
      current.map((scenario) => (scenario.id === scenarioId ? updater(scenario) : scenario)),
    );
  };

  const updateArea = (chapter: ChapterKey, value: number) => {
    if (!selectedScenario) return;
    const field = AREA_FIELD_BY_CHAPTER[chapter];
    updateScenario(selectedScenario.id, (scenario) => ({
      ...scenario,
      areas: { ...scenario.areas, [field]: Math.max(0, value) },
      reportedResults: undefined,
    }));
  };

  const updateAdjustment = (chapter: ChapterKey, value: number) => {
    if (!selectedScenario) return;
    updateScenario(selectedScenario.id, (scenario) => ({
      ...scenario,
      adjustments: {
        ...scenario.adjustments,
        [chapter]: {
          kind: "absolute",
          value,
          label: "Ajuste manual",
          reason: "Ajuste editable del escenario; requiere validación de Presupuestos.",
        },
      },
      reportedResults: undefined,
    }));
  };

  const updateReference = (chapter: ChapterKey, referenceId: string) => {
    if (!selectedScenario) return;
    updateScenario(selectedScenario.id, (scenario) => ({
      ...scenario,
      referenceIds: { ...scenario.referenceIds, [chapter]: referenceId },
      reportedResults: undefined,
    }));
    setManualReferenceSelections((current) => {
      const next = new Set(current);
      next.add(`${selectedScenario.id}::${chapter}`);
      return next;
    });
    setSelectedChapter(chapter);
  };

  const updateConfig = (scenarioId: string, patch: Partial<EstimateConfig>) => {
    setScenarioConfigs((current) => ({
      ...current,
      [scenarioId]: { ...configFor(scenarioId), ...patch },
    }));
  };

  const duplicateScenario = () => {
    if (!selectedScenario) return;
    const copy = cloneScenario(selectedScenario);
    copy.id = `custom-${Date.now()}`;
    copy.name = `${selectedScenario.name} · copia`;
    copy.description = "Escenario editable creado a partir de una sensibilidad importada.";
    copy.sources = undefined;
    copy.reportedResults = undefined;
    setScenarios((current) => [...current, copy]);
    setScenarioConfigs((current) => ({
      ...current,
      [copy.id]: { ...configFor(selectedScenario.id) },
    }));
    setSelectedScenarioId(copy.id);
    setActiveView("scenarios");
  };

  const createManualScenario = () => {
    if (!selectedScenario) return;
    const id = `manual-${Date.now()}`;
    const manualScenario: ScenarioInput = {
      id,
      name: `Escenario manual ${scenarios.filter((scenario) => scenario.id.startsWith("manual-")).length + 1}`,
      description: "Escenario vacío para ingresar áreas y elegir referentes de costos.",
      housingUnits: { vis: 0, nonVis: 0 },
      parkingSpaces: 0,
      areas: {
        constructedTotal: 0,
        visBuilt: 0,
        nonVisBuilt: 0,
        parkingBuilt: 0,
        commonBuilt: 0,
        internalUrbanism: 0,
        sellableVis: 0,
        sellableNonVis: 0,
      },
      referenceIds: suggestReferenceIds(workbook.references, selectedScenario.context),
      adjustments: {},
      externalUrbanism: { amount: 0, includedInBase: false },
      context: { ...selectedScenario.context },
      assumptions: [],
    };
    setScenarios((current) => [...current, manualScenario]);
    setScenarioConfigs((current) => ({
      ...current,
      [id]: { ...configFor(selectedScenario.id) },
    }));
    setSelectedScenarioId(id);
    setActiveView("scenarios");
  };

  const resetWorkbook = () => {
    setWorkbook(DEFAULT_WORKBOOK);
    setScenarios(DEFAULT_WORKBOOK.scenarios.map(cloneScenario));
    setScenarioConfigs(
      Object.fromEntries(
        DEFAULT_WORKBOOK.scenarios.map((scenario) => [scenario.id, { ...DEFAULT_WORKBOOK.config }]),
      ),
    );
    setSelectedScenarioId(DEFAULT_WORKBOOK.scenarios[0]?.id ?? "");
    setComparisonScenarioId(
      DEFAULT_WORKBOOK.scenarios[1]?.id ?? DEFAULT_WORKBOOK.scenarios[0]?.id ?? "",
    );
    setManualReferenceSelections(new Set());
    setUploadState({ status: "idle" });
  };

  const exportSelectedScenario = () => {
    if (!selectedScenario || !selectedEstimate) return;
    const rows: Array<Array<string | number>> = [
      ["Escenario", selectedScenario.name],
      ["Versión de cálculo", selectedEstimate.calculationVersion],
      ["Estado", severityLabel(selectedEstimate.warnings)],
      [],
      ["Capítulo", "Cantidad m²", "Tarifa base", "Ajuste /m²", "Tarifa final", "Valor", "Referente", "Origen"],
      ...selectedEstimate.lineItems.map((line) => [
        line.label,
        line.quantity,
        line.baseRate,
        line.adjustmentPerUnit,
        line.finalRate,
        line.amount,
        line.referenceProject,
        `${line.rateSource.sheet}!${line.rateSource.cell}`,
      ]),
      [],
      ["Subtotal directo", selectedEstimate.directCostSubtotal],
      ["Administración y GG", selectedEstimate.administrationAndGeneral.amount],
      ["Presupuesto base", selectedEstimate.baseBudget],
      ["Urbanismo externo", selectedEstimate.externalUrbanism.amount],
      ["Presupuesto consolidado", selectedEstimate.budgetWithExternalUrbanism],
    ];
    downloadCsv(`${selectedScenario.id}-presupuesto.csv`, rows);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setUploadState({ status: "error", fileName: file.name, message: "Selecciona un archivo .xlsx." });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadState({ status: "error", fileName: file.name, message: "El archivo supera el límite de 20 MB del piloto." });
      return;
    }
    setUploadState({ status: "loading", fileName: file.name });
    try {
      const { importIndicadores } = await import("./import/indicadoresImporter");
      const result = importIndicadores(await file.arrayBuffer(), file.name);
      if (!result.workbook) {
        throw new Error(result.quality.issues[0]?.message ?? "No fue posible importar el libro.");
      }
      const imported = result.workbook;
      setWorkbook(imported);
      setScenarios(imported.scenarios.map(cloneScenario));
      setScenarioConfigs(
        Object.fromEntries(imported.scenarios.map((scenario) => [scenario.id, { ...imported.config }])),
      );
      setSelectedScenarioId(imported.scenarios[0]?.id ?? "");
      setComparisonScenarioId(imported.scenarios[1]?.id ?? imported.scenarios[0]?.id ?? "");
      setManualReferenceSelections(new Set());
      setUploadState({
        status: "success",
        fileName: file.name,
        message: `${imported.costIndicators.length} indicadores y ${imported.scenarios.length} escenarios importados.`,
      });
    } catch (error) {
      setUploadState({
        status: "error",
        fileName: file.name,
        message: error instanceof Error ? error.message : "Error inesperado al importar el libro.",
      });
    } finally {
      event.target.value = "";
    }
  };

  if (!selectedScenario || !selectedEstimate || !comparisonScenario || !comparisonEstimate) {
    return <main className="fatal-state">No hay escenarios válidos para mostrar.</main>;
  }

  // Preserve the narrowed values for the nested view renderers.
  const currentEstimate: EstimateResult = selectedEstimate;
  const comparedEstimate: EstimateResult = comparisonEstimate;

  const currentTitle = NAV_ITEMS.find((item) => item.id === activeView)?.label ?? "Cabidas";

  return (
    <div className="app-shell">
      <button
        className={`sidebar-backdrop ${sidebarOpen ? "is-visible" : ""}`}
        aria-label="Cerrar navegación"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><Building2 size={22} strokeWidth={2.2} /></span>
          <span><strong>Cabida</strong><small>Presupuesto inteligente</small></span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><PanelLeftClose size={19} /></button>
        </div>

        <div className="workspace-card">
          <div className="workspace-icon"><Home size={18} /></div>
          <div><span>Proyecto activo</span><strong>Villas del Pinar</strong></div>
          <ChevronDown size={16} />
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          <span className="nav-label">Espacio de trabajo</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? "is-active" : ""}`}
                onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
              >
                <Icon size={19} />
                <span><strong>{item.label}</strong><small>{item.caption}</small></span>
                {item.id === "import" && workbook.quality.status === "validated" ? <Check size={15} /> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="method-card">
          <span className="method-icon"><ShieldCheck size={18} /></span>
          <div><strong>Cálculo explicable</strong><p>Indicadores históricos, sin predicción opaca.</p></div>
        </div>
        <div className="sidebar-profile">
          <span className="avatar">PR</span>
          <div><strong>Equipo Presupuestos</strong><small>Responsable de revisión</small></div>
          <ChevronDown size={15} />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button>
            <div><span>Cabidas presupuestales <ArrowRight size={12} /> Fase 1</span><strong>{currentTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <span className="source-status">
              <StatusDot status={workbook.quality.status === "validated" ? "good" : "warning"} />
              {workbook.quality.status === "validated" ? "Fuente conciliada" : "Fuente con observaciones"}
            </span>
            <button className="button button-ghost" onClick={exportSelectedScenario}><Download size={17} /><span>Exportar CSV</span></button>
          </div>
        </header>

        <div className="page-content">
          {activeView === "overview" && renderOverview()}
          {activeView === "scenarios" && renderScenarios()}
          {activeView === "references" && renderReferences()}
          {activeView === "import" && renderImport()}
        </div>
      </main>
    </div>
  );

  function renderOverview() {
    const baseScenario = scenarios[0] ?? selectedScenario;
    const baseEstimate: EstimateResult = estimates.get(baseScenario.id) ?? currentEstimate;
    const alternateScenario = scenarios[1] ?? selectedScenario;
    const alternateEstimate: EstimateResult = estimates.get(alternateScenario.id) ?? currentEstimate;
    const delta = alternateEstimate.baseBudget - baseEstimate.baseBudget;
    const deltaPercent = percentageDifference(alternateEstimate.baseBudget, baseEstimate.baseBudget);
    const maxBudget = Math.max(baseEstimate.baseBudget, alternateEstimate.baseBudget);

    return (
      <>
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow eyebrow-light"><Sparkles size={14} /> Evaluación preliminar · Base {workbook.metadata.baseYear}</span>
            <h1>Decidir con números<br />{" "}que se pueden explicar.</h1>
            <p>Compara mezclas VIS / No VIS y entiende qué capítulo mueve el presupuesto antes de avanzar a estudios de detalle.</p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={() => setActiveView("scenarios")}>Abrir simulador <ArrowRight size={17} /></button>
              <button className="button button-dark-ghost" onClick={() => setActiveView("references")}><BookOpenText size={17} /> Ver indicadores</button>
            </div>
          </div>
          <div className="hero-insight">
            <div className="insight-head"><span>Hallazgo del comparativo</span><Gauge size={19} /></div>
            <strong>{formatCompactCurrency(Math.abs(delta))}</strong>
            <p>{alternateScenario.name} reduce el presupuesto base en <b>{formatPercent(Math.abs(deltaPercent))}</b> frente a {baseScenario.name}.</p>
            <div className="insight-disclaimer"><Info size={15} /> No determina rentabilidad ni viabilidad normativa.</div>
          </div>
        </section>

        <section className="section-heading">
          <div><span className="eyebrow">Lectura rápida</span><h2>{selectedScenario.name}</h2></div>
          <div className="scenario-switcher">
            {scenarios.slice(0, 4).map((scenario) => (
              <button key={scenario.id} className={selectedScenario.id === scenario.id ? "is-active" : ""} onClick={() => setSelectedScenarioId(scenario.id)}>{scenario.name}</button>
            ))}
          </div>
        </section>

        <section className="metric-grid">
          <MetricCard label="Presupuesto base" value={formatCompactCurrency(currentEstimate.baseBudget)} icon={<CircleDollarSign size={19} />} note={<><StatusDot status="good" /> Incluye A&G; excluye urbanismo externo</>} />
          <MetricCard label="Costo / m² construido" value={formatCurrency(currentEstimate.indicators.costPerConstructedM2 ?? 0)} icon={<BarChart3 size={19} />} tone="ink" note={`${formatNumber(selectedScenario.areas.constructedTotal, "m²")} de base`} />
          <MetricCard label="Unidades de vivienda" value={formatNumber(selectedScenario.housingUnits.vis + selectedScenario.housingUnits.nonVis)} icon={<Building2 size={19} />} tone="green" note={`${selectedScenario.housingUnits.vis} VIS · ${selectedScenario.housingUnits.nonVis} No VIS`} />
          <MetricCard label="Estado de revisión" value={severityLabel(currentEstimate.warnings)} icon={<ShieldCheck size={19} />} tone="amber" note="Estimación pendiente de validación técnica" />
        </section>

        <section className="overview-grid">
          <article className="card comparison-card">
            <div className="card-heading"><div><span className="eyebrow">Sensibilidades del Excel</span><h3>Presupuesto por alternativa</h3></div><span className="soft-badge">Misma área total</span></div>
            <div className="budget-bars">
              {[{ scenario: baseScenario, estimate: baseEstimate, tone: "base" }, { scenario: alternateScenario, estimate: alternateEstimate, tone: "alternate" }].map(({ scenario, estimate, tone }) => (
                <div className="budget-row" key={scenario.id}>
                  <div className="budget-row-label"><span>{scenario.name}</span><strong>{formatCompactCurrency(estimate.baseBudget)}</strong></div>
                  <div className="budget-track"><span className={`budget-fill ${tone}`} style={{ width: `${(estimate.baseBudget / maxBudget) * 100}%` }} /></div>
                  <small>{scenario.housingUnits.vis} VIS · {scenario.housingUnits.nonVis} No VIS</small>
                </div>
              ))}
            </div>
            <div className="comparison-result">
              <span className="result-icon"><ArrowDownRight size={20} /></span>
              <div><span>Diferencia de {alternateScenario.name}</span><strong>{formatSignedCurrency(delta)} <small>{formatPercent(deltaPercent)}</small></strong></div>
              <button onClick={() => setActiveView("scenarios")}>Ver detalle <ArrowRight size={15} /></button>
            </div>
          </article>

          <article className="card decision-card">
            <div className="card-heading"><div><span className="eyebrow">Criterio gerencial</span><h3>Revisar supuestos</h3></div><span className="traffic-light warning"><span /></span></div>
            <p className="decision-copy">La alternativa de menor costo merece estudio, pero aún no incorpora ingresos, lote ni validación normativa.</p>
            <ul className="decision-list">
              <li><CheckCircle2 size={17} /><span><b>Costos conciliados</b> con los dos escenarios fuente.</span></li>
              <li><AlertTriangle size={17} /><span><b>Parqueaderos:</b> referente de 5 pisos sin sótano.</span></li>
              <li><Info size={17} /><span><b>Urbanismo externo:</b> visible y separado del total base.</span></li>
            </ul>
            <div className="decision-footer"><span>Próximo control</span><strong>Validación Diseño + Presupuestos</strong></div>
          </article>
        </section>

        <article className="card chapter-comparison">
          <div className="card-heading"><div><span className="eyebrow">Qué explica la diferencia</span><h3>Comparación por capítulo</h3></div><span className="legend"><i className="legend-base" /> {baseScenario.name}<i className="legend-alt" /> {alternateScenario.name}</span></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Capítulo</th><th>{baseScenario.name}</th><th>{alternateScenario.name}</th><th>Variación</th><th>Lectura</th></tr></thead>
              <tbody>
                {baseEstimate.lineItems.map((line) => {
                  const altLine = alternateEstimate.lineItems.find((item) => item.chapter === line.chapter)!;
                  const lineDelta = altLine.amount - line.amount;
                  return (
                    <tr key={line.chapter}>
                      <td><span className={`chapter-dot chapter-${line.chapter}`} /> <strong>{line.label}</strong></td>
                      <td>{formatCompactCurrency(line.amount)}</td>
                      <td>{formatCompactCurrency(altLine.amount)}</td>
                      <td><span className={`delta-pill ${lineDelta <= 0 ? "is-down" : "is-up"}`}>{lineDelta <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{formatSignedCurrency(lineDelta)}</span></td>
                      <td className="muted-cell">{formatSignedNumber(altLine.quantity - line.quantity)} m²</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </>
    );
  }

  function renderScenarios() {
    const config = configFor(selectedScenario.id);
    const selectedLine = currentEstimate.lineItems.find((line) => line.chapter === selectedChapter) ?? currentEstimate.lineItems[0];
    const sellableArea = (selectedScenario.areas.sellableVis ?? 0) + (selectedScenario.areas.sellableNonVis ?? 0);
    const compareDelta = currentEstimate.baseBudget - comparedEstimate.baseBudget;

    return (
      <>
        <section className="page-heading">
          <div><span className="eyebrow">Simulador Fase 1</span><h1>Escenarios de cabida</h1><p>Edita cantidades y ajustes; el presupuesto se recalcula sin ocultar su origen.</p></div>
          <div className="heading-actions"><button className="button button-ghost" onClick={duplicateScenario}><Copy size={16} /> Duplicar escenario</button><button className="button button-ghost" onClick={createManualScenario}>+ Nuevo escenario manual</button><button className="button button-primary" onClick={exportSelectedScenario}><Download size={16} /> Exportar detalle</button></div>
        </section>

        <section className="scenario-tabs" aria-label="Escenarios disponibles">
          {scenarios.map((scenario, index) => {
            const estimate = estimates.get(scenario.id)!;
            return <button key={scenario.id} className={selectedScenario.id === scenario.id ? "is-active" : ""} onClick={() => setSelectedScenarioId(scenario.id)}><span>{String.fromCharCode(65 + index)}</span><div><strong>{scenario.name}</strong><small>{formatCompactCurrency(estimate.baseBudget)}</small></div>{selectedScenario.id === scenario.id ? <Check size={15} /> : null}</button>;
          })}
          <button className="add-scenario" onClick={createManualScenario}>+ Nuevo manual</button>
        </section>

        <section className="scenario-layout">
          <div className="scenario-main">
            <section className="area-mode-strip" aria-label="Forma de ingreso de áreas">
              <div className="area-mode-active"><span><Check size={15} /></span><div><strong>Ingresar áreas manualmente</strong><small>Activo · edita los campos y capítulos de este escenario</small></div></div>
              <button className="button button-ghost" onClick={() => setActiveView("import")}><FileSpreadsheet size={16} /> Cargar áreas desde Excel</button>
            </section>
            <article className="card project-inputs">
              <div className="card-heading"><div><span className="eyebrow">Mezcla y denominadores</span><h3>Datos del escenario</h3></div><span className="soft-badge"><StatusDot status="warning" /> Hipótesis presupuestal</span></div>
              <div className="input-grid">
                <NumberField label="Viviendas VIS" value={selectedScenario.housingUnits.vis} suffix="un" onChange={(value) => updateScenario(selectedScenario.id, (scenario) => ({ ...scenario, housingUnits: { ...scenario.housingUnits, vis: Math.max(0, value) }, reportedResults: undefined }))} />
                <NumberField label="Viviendas No VIS" value={selectedScenario.housingUnits.nonVis} suffix="un" onChange={(value) => updateScenario(selectedScenario.id, (scenario) => ({ ...scenario, housingUnits: { ...scenario.housingUnits, nonVis: Math.max(0, value) }, reportedResults: undefined }))} />
                <NumberField label="Área vendible VIS" value={selectedScenario.areas.sellableVis ?? 0} suffix="m²" decimals onChange={(value) => updateScenario(selectedScenario.id, (scenario) => ({ ...scenario, areas: { ...scenario.areas, sellableVis: Math.max(0, value) }, reportedResults: undefined }))} />
                <NumberField label="Área vendible No VIS" value={selectedScenario.areas.sellableNonVis ?? 0} suffix="m²" decimals onChange={(value) => updateScenario(selectedScenario.id, (scenario) => ({ ...scenario, areas: { ...scenario.areas, sellableNonVis: Math.max(0, value) }, reportedResults: undefined }))} />
              </div>
              <div className="input-summary"><span><b>{formatNumber(selectedScenario.areas.constructedTotal, "m²")}</b> construidos</span><span><b>{formatNumber(sellableArea, "m²")}</b> vendibles</span><span><b>{formatNumber(selectedScenario.housingUnits.vis + selectedScenario.housingUnits.nonVis)}</b> viviendas</span></div>
            </article>

            <article className="card budget-editor">
              <div className="card-heading"><div><span className="eyebrow">Motor determinista</span><h3>Presupuesto por capítulos</h3></div><span className="version-badge">Cálculo {currentEstimate.calculationVersion}</span></div>
              <div className="table-scroll">
                <table className="editor-table">
                  <thead><tr><th>Capítulo / referente</th><th>Área</th><th>Tarifa base</th><th>Ajuste /m²</th><th>Valor</th><th /></tr></thead>
                  <tbody>
                    {currentEstimate.lineItems.map((line) => {
                      const chapterReferences = workbook.references.filter((reference) => reference.chapter === line.chapter);
                      const compatibleReferences = chapterReferences.filter((reference) => isReferenceAssetCompatible(reference, selectedScenario));
                      const otherReferences = chapterReferences.filter((reference) => !isReferenceAssetCompatible(reference, selectedScenario));
                      const manuallySelected = manualReferenceSelections.has(`${selectedScenario.id}::${line.chapter}`);
                      const selectedReference = chapterReferences.find((reference) => reference.id === selectedScenario.referenceIds[line.chapter]);
                      const incompatibleSelection = selectedReference ? !isReferenceAssetCompatible(selectedReference, selectedScenario) : false;
                      return (
                        <tr key={line.chapter} className={selectedChapter === line.chapter ? "is-selected" : ""}>
                          <td>
                            <div className="chapter-reference-cell">
                              <button className="chapter-button" onClick={() => setSelectedChapter(line.chapter)}><span className={`chapter-icon chapter-${line.chapter}`}>{CHAPTER_LABELS[line.chapter].slice(0, 1)}</span><span><strong>{CHAPTER_LABELS[line.chapter]}</strong><small>Referente actual: {line.referenceProject}</small></span></button>
                              <label className="reference-picker">
                                <span className="sr-only">Referente para {CHAPTER_LABELS[line.chapter]}</span>
                                <select value={selectedScenario.referenceIds[line.chapter]} onChange={(event) => updateReference(line.chapter, event.target.value)} aria-label={`Referente de ${CHAPTER_LABELS[line.chapter]} para ${selectedScenario.name}`}>
                                  <optgroup label={`Compatibles con ${ASSET_CLASS_LABELS[selectedScenario.context.assetClass]}`}>
                                    {compatibleReferences.map((reference) => <option key={reference.id} value={reference.id}>{reference.project} — {reference.label} · {formatCurrency(reference.baseRate)}</option>)}
                                  </optgroup>
                                  {otherReferences.length ? <optgroup label="⚠ Otros tipos de proyecto · revisar">{otherReferences.map((reference) => <option key={reference.id} value={reference.id}>{reference.project} — {reference.label} · {formatCurrency(reference.baseRate)}</option>)}</optgroup> : null}
                                </select>
                                <small className={`selection-origin ${manuallySelected ? "is-manual" : ""} ${incompatibleSelection ? "is-warning" : ""}`}>{incompatibleSelection ? "Selección de otro tipo · revisar" : manuallySelected ? "Selección manual" : "Sugerido inicialmente"}</small>
                              </label>
                            </div>
                          </td>
                          <td><InlineNumber value={line.quantity} onChange={(value) => updateArea(line.chapter, value)} suffix="m²" /></td>
                          <td><span className="read-only-value">{formatCurrency(line.baseRate)}</span></td>
                          <td><InlineNumber value={chapterAdjustmentPerUnit(line)} onChange={(value) => updateAdjustment(line.chapter, value)} currency /></td>
                          <td><strong>{formatCompactCurrency(line.amount)}</strong></td>
                          <td><button className="icon-button" onClick={() => setSelectedChapter(line.chapter)} aria-label={`Ver trazabilidad de ${line.label}`}><ArrowRight size={16} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><td><strong>Administración + GG</strong><small>Sobre subtotal de seis capítulos</small></td><td colSpan={2}><InlineNumber value={config.administrationRate * 100} onChange={(value) => updateConfig(selectedScenario.id, { administrationRate: Math.max(0, value / 100) })} suffix="%" /></td><td>{formatCurrency(currentEstimate.directCostSubtotal)}</td><td><strong>{formatCompactCurrency(currentEstimate.administrationAndGeneral.amount)}</strong></td><td /></tr>
                  </tfoot>
                </table>
              </div>
            </article>

            <article className="card trace-card">
              <div className="card-heading"><div><span className="eyebrow">Trazabilidad seleccionada</span><h3>{selectedLine.label}</h3></div><span className="validation-badge"><CheckCircle2 size={15} /> Fuente reconocida</span></div>
              <div className="trace-grid">
                <TraceItem label="Proyecto referente" value={selectedLine.referenceProject} />
                <TraceItem label="Celda de tarifa" value={`${selectedLine.rateSource.sheet}!${selectedLine.rateSource.cell}`} mono />
                <TraceItem label="Base del indicador" value={`${selectedLine.quantityUnit} · ${selectedLine.rateUnit}`} />
                <TraceItem label="Año / moneda" value={`${workbook.metadata.baseYear} · ${currentEstimate.currency}`} />
              </div>
              <div className="scope-note"><Info size={17} /><div><strong>Alcance del referente</strong><p>{selectedLine.scope}</p>{selectedLine.exclusions.length ? <small>Exclusiones: {selectedLine.exclusions.join(", ")}</small> : null}</div></div>
            </article>
          </div>

          <aside className="scenario-summary">
            <article className="summary-total">
              <span>Presupuesto base</span><strong>{formatCompactCurrency(currentEstimate.baseBudget)}</strong><small>{formatCurrency(currentEstimate.indicators.costPerConstructedM2 ?? 0)} / m² construido</small>
              <div className={`summary-delta ${compareDelta <= 0 ? "is-down" : "is-up"}`}>{compareDelta <= 0 ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />} {formatSignedCurrency(compareDelta)} vs. {comparisonScenario.name}</div>
            </article>
            <article className="card total-breakdown">
              <div className="breakdown-row"><span>Costos directos</span><strong>{formatCompactCurrency(currentEstimate.directCostSubtotal)}</strong></div>
              <div className="breakdown-row"><span>Administración + GG <small>{formatPercent(config.administrationRate, 0)}</small></span><strong>{formatCompactCurrency(currentEstimate.administrationAndGeneral.amount)}</strong></div>
              <div className="breakdown-row external"><span>Urbanismo externo <small>separado</small></span><strong>{formatCompactCurrency(currentEstimate.externalUrbanism.amount)}</strong></div>
              <label className="toggle-row"><span><b>Incluir urbanismo externo</b><small>Se suma una única vez al consolidado</small></span><input type="checkbox" checked={config.includeExternalUrbanism} onChange={(event) => updateConfig(selectedScenario.id, { includeExternalUrbanism: event.target.checked })} /><i /></label>
              <div className="selected-total"><span>Total seleccionado</span><strong>{formatCompactCurrency(currentEstimate.selectedBudget)}</strong></div>
            </article>
            <article className="card indicator-stack">
              <h4>Indicadores consolidados</h4>
              <div><span>Construido</span><strong>{formatCurrency(currentEstimate.indicators.costPerConstructedM2 ?? 0)}<small>/m²</small></strong></div>
              <div><span>Vendible</span><strong>{formatCurrency(currentEstimate.indicators.costPerSellableM2 ?? 0)}<small>/m²</small></strong></div>
              <div><span>Por vivienda</span><strong>{formatCompactCurrency(currentEstimate.indicators.costPerHousingUnit ?? 0)}</strong></div>
            </article>
            <article className="card warning-stack">
              <div className="warning-title"><CircleAlert size={18} /><strong>Controles del escenario</strong><span>{currentEstimate.warnings.length}</span></div>
              {currentEstimate.warnings.length === 0 ? <p className="empty-warning"><CheckCircle2 size={17} /> Sin alertas automáticas.</p> : currentEstimate.warnings.slice(0, 4).map((warning, index) => <div className={`warning-item severity-${warning.severity}`} key={`${warning.code}-${index}`}><StatusDot status={warning.severity === "error" ? "warning" : "muted"} /><span>{warning.message}</span></div>)}
            </article>
          </aside>
        </section>
      </>
    );
  }

  function renderReferences() {
    const query = referenceSearch.trim().toLocaleLowerCase("es");
    const indicators = workbook.costIndicators.filter((indicator) => {
      const matchesType = projectTypeFilter === "all" || indicator.projectType === projectTypeFilter;
      const matchesSearch = !query || [
        indicator.concept,
        indicator.project,
        indicator.groupLabel,
        indicator.originalUnit,
        INDICATOR_USAGE_LABELS[indicator.usage],
        indicator.source.sheet,
        indicator.source.cell,
      ].some((value) => value.toLocaleLowerCase("es").includes(query));
      return matchesType && matchesSearch;
    });
    const groupedIndicators = Array.from(
      indicators.reduce((groups, indicator) => {
        const current = groups.get(indicator.groupId) ?? [];
        current.push(indicator);
        groups.set(indicator.groupId, current);
        return groups;
      }, new Map<string, CostIndicator[]>()),
    );
    const projectCount = new Set(workbook.costIndicators.map((indicator) => indicator.project)).size;
    const projectTypeCount = new Set(workbook.costIndicators.map((indicator) => indicator.projectType)).size;
    const selectableCount = workbook.costIndicators.filter((indicator) => indicator.usage === "selectable").length;
    const typeFilters: Array<{ id: ProjectTypeFilter; label: string }> = [
      { id: "all", label: "Todos" },
      { id: "residential-tower", label: "Vivienda en torre" },
      { id: "office", label: "Oficinas" },
      { id: "houses", label: "Casas" },
    ];

    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">Catálogo completo · hoja Indicadores costos</span><h1>Indicadores de costo</h1><p>Consulta todos los indicadores por tipo de proyecto y bloque, incluidos los que aún no se usan en un presupuesto.</p></div><button className="button button-primary" onClick={() => setActiveView("import")}><UploadCloud size={16} /> Actualizar desde Excel</button></section>
        <section className="reference-stats">
          <div><span className="stat-icon blue"><Database size={19} /></span><p><strong>{workbook.costIndicators.length}</strong><small>indicadores en catálogo</small></p></div>
          <div><span className="stat-icon green"><Building2 size={19} /></span><p><strong>{projectCount}</strong><small>proyectos históricos</small></p></div>
          <div><span className="stat-icon amber"><TableProperties size={19} /></span><p><strong>{projectTypeCount}</strong><small>tipos de proyecto</small></p></div>
          <div><span className="stat-icon ink"><CheckCircle2 size={19} /></span><p><strong>{selectableCount}</strong><small>disponibles como referente</small></p></div>
        </section>
        <article className="card reference-table-card">
          <div className="catalog-filter" role="group" aria-label="Filtrar por tipo de proyecto">
            {typeFilters.map((filter) => <button key={filter.id} className={projectTypeFilter === filter.id ? "is-active" : ""} onClick={() => setProjectTypeFilter(filter.id)}>{filter.label}<span>{filter.id === "all" ? workbook.costIndicators.length : workbook.costIndicators.filter((indicator) => indicator.projectType === filter.id).length}</span></button>)}
          </div>
          <div className="reference-toolbar"><div className="search-box"><Search size={17} /><input value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} placeholder="Buscar concepto, proyecto, bloque o fuente…" />{referenceSearch ? <button onClick={() => setReferenceSearch("")} aria-label="Limpiar búsqueda"><X size={15} /></button> : null}</div><span className="soft-badge">{indicators.length} resultados · {groupedIndicators.length} bloques</span></div>
          <div className="table-scroll"><table className="data-table reference-table catalog-table"><thead><tr><th>Concepto</th><th>Valor histórico</th><th>Base</th><th>Tarifa final</th><th>Unidad</th><th>Fuente</th><th>Estado / uso</th></tr></thead><tbody>{groupedIndicators.map(([groupId, group]) => {
            const first = group[0];
            return <Fragment key={groupId}><tr className="catalog-group-row"><td colSpan={7}><div className="catalog-group-content"><div className="catalog-group-copy"><strong>{first.groupLabel}</strong><span>{first.project} · {PROJECT_TYPE_LABELS[first.projectType]} · Base {first.baseYear}{first.floorCount ? ` · ${first.floorCount} pisos` : ""}</span></div><small>{group.length} {group.length === 1 ? "indicador" : "indicadores"}</small></div></td></tr>{group.map((indicator) => <CostIndicatorRow key={indicator.id} indicator={indicator} />)}</Fragment>;
          })}{indicators.length === 0 ? <tr className="catalog-empty"><td colSpan={7}>No hay indicadores que coincidan con los filtros.</td></tr> : null}</tbody></table></div>
        </article>
        <div className="governance-note"><ShieldCheck size={22} /><div><strong>Catálogo visible, selección controlada</strong><p>Todas las filas permanecen consultables. Solo los indicadores completos y comparables se ofrecen como referentes en los escenarios.</p></div><button onClick={() => setActiveView("import")}>Ver control de calidad <ArrowRight size={15} /></button></div>
      </>
    );
  }

  function renderImport() {
    const qualityIssueCount = workbook.quality.issues.length;
    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">Fuente de arranque</span><h1>Importar INDICADORES.xlsx</h1><p>Leemos solo las tres hojas autorizadas y recalculamos cada partida para conciliarla.</p></div><button className="button button-ghost" onClick={resetWorkbook}><RefreshCcw size={16} /> Restaurar datos de validación</button></section>
        <section className="import-grid">
          <article className="card upload-card">
            <input ref={fileInputRef} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} />
            <button className={`drop-zone ${uploadState.status}`} onClick={() => fileInputRef.current?.click()} disabled={uploadState.status === "loading"}>
              <span className="upload-icon">{uploadState.status === "success" ? <FileCheck2 size={28} /> : uploadState.status === "error" ? <CircleAlert size={28} /> : <UploadCloud size={29} />}</span>
              <strong>{uploadState.status === "loading" ? "Leyendo libro…" : uploadState.status === "success" ? uploadState.fileName : uploadState.status === "error" ? "No se pudo importar" : "Carga el archivo de indicadores"}</strong>
              <p>{uploadState.status === "success" || uploadState.status === "error" ? uploadState.message : "Selecciona el .xlsx original; nunca lo modificaremos."}</p>
              <span className="button button-primary">{uploadState.status === "success" ? "Cambiar archivo" : "Seleccionar Excel"}</span>
              <small>Máximo 20 MB · sin macros · procesamiento local</small>
            </button>
            <div className="file-security"><ShieldCheck size={18} /><span><b>Archivo inmutable</b>La aplicación lee fórmulas y valores cacheados, pero no escribe sobre el Excel original.</span></div>
          </article>
          <article className="card import-summary">
            <div className="card-heading"><div><span className="eyebrow">Libro activo</span><h3>{workbook.metadata.sourceFileName}</h3></div><span className={`quality-pill quality-${workbook.quality.status}`}>{workbook.quality.status === "validated" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{workbook.quality.status === "validated" ? "Conciliado" : "Requiere revisión"}</span></div>
            <div className="sheet-list">
              {[{ name: "Indicadores costos", detail: `${workbook.costIndicators.length} indicadores del catálogo` }, { name: "Ppto ", detail: `${workbook.scenarios.length} sensibilidades y áreas detectadas` }, { name: "Presentacion", detail: "Áreas, viviendas y urbanismo externo" }].map((sheet) => <div key={sheet.name}><span className="sheet-check"><Check size={15} /></span><p><strong>{sheet.name}</strong><small>{sheet.detail}</small></p><span className="sheet-status">Leída</span></div>)}
            </div>
            <div className="import-kpis"><div><span>Versión</span><strong>{workbook.metadata.version}</strong></div><div><span>Año base</span><strong>{workbook.metadata.baseYear}</strong></div><div><span>Moneda</span><strong>{workbook.metadata.currency}</strong></div></div>
          </article>
        </section>
        <section className="validation-grid">
          <article className="card validation-card">
            <div className="card-heading"><div><span className="eyebrow">Prueba de aceptación</span><h3>Conciliación de escenarios</h3></div><span className="validation-badge"><CheckCircle2 size={15} /> Recalculado</span></div>
            <div className="reconciliation-list">
              {scenarios.slice(0, 2).map((scenario) => {
                const estimate = estimates.get(scenario.id)!;
                const reported = scenario.reportedResults?.baseBudget?.value;
                const difference = reported === undefined ? null : estimate.baseBudget - reported;
                return <div key={scenario.id}><span className="reconcile-icon"><TableProperties size={18} /></span><div><strong>{scenario.name}</strong><small>{formatNumber(scenario.areas.constructedTotal, "m²")} · {scenario.housingUnits.vis + scenario.housingUnits.nonVis} viviendas</small></div><p><strong>{formatCurrency(estimate.baseBudget)}</strong><small>{difference === null ? "Sin total fuente" : `Diferencia: ${formatCurrency(difference)}`}</small></p><span className="check-circle"><Check size={14} /></span></div>;
              })}
            </div>
          </article>
          <article className="card quality-card">
            <div className="card-heading"><div><span className="eyebrow">Control de calidad</span><h3>Hallazgos de importación</h3></div><span className="soft-badge">{qualityIssueCount} alertas</span></div>
            {qualityIssueCount === 0 ? <div className="quality-empty"><CheckCircle2 size={28} /><div><strong>Sin errores bloqueantes</strong><p>Las hojas, rangos y valores necesarios están disponibles.</p></div></div> : <div className="quality-issues">{workbook.quality.issues.slice(0, 5).map((issue, index) => <div key={`${issue.code}-${index}`}><AlertTriangle size={17} /><p><strong>{issue.code}</strong><span>{issue.message}</span></p>{issue.cell ? <code>{issue.sheet}!{issue.cell}</code> : null}</div>)}</div>}
            <div className="quality-rule"><Info size={16} /><span>Los nombres definidos heredados y referencias externas se ignoran deliberadamente.</span></div>
          </article>
        </section>
        <article className="import-principles">
          <div><span>01</span><p><strong>Fuente preservada</strong>Hoja y celda acompañan cada tarifa.</p></div>
          <div><span>02</span><p><strong>Cálculo independiente</strong>No confiamos ciegamente en el caché del Excel.</p></div>
          <div><span>03</span><p><strong>Diferencias visibles</strong>Toda desviación supera un control explícito.</p></div>
        </article>
      </>
    );
  }
}

function NumberField({ label, value, suffix, decimals = false, onChange }: { label: string; value: number; suffix: string; decimals?: boolean; onChange: (value: number) => void }) {
  const displayValue = Number(value.toFixed(decimals ? 2 : 0));
  return <label className="number-field"><span>{label}</span><div><input type="number" min="0" step={decimals ? "0.01" : "1"} value={displayValue} onChange={(event) => onChange(safeNumber(event.target.value))} /><small>{suffix}</small></div></label>;
}

function InlineNumber({ value, onChange, suffix, currency = false }: { value: number; onChange: (value: number) => void; suffix?: string; currency?: boolean }) {
  return <label className="inline-number">{currency ? <span>$</span> : null}<input type="number" min={currency ? undefined : "0"} step="0.01" value={Number(value.toFixed(4))} onChange={(event) => onChange(safeNumber(event.target.value))} />{suffix ? <small>{suffix}</small> : null}</label>;
}

function TraceItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="trace-item"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

function CostIndicatorRow({ indicator }: { indicator: CostIndicator }) {
  const chapters = indicator.compatibleChapters.map((chapter) => CHAPTER_LABELS[chapter]).join(" · ");
  return <tr className="catalog-indicator-row"><td><strong>{indicator.concept}</strong><small>{chapters || "Sin capítulo asignado"}</small></td><td><strong>{formatCurrency(indicator.historicalAmount)}</strong><small>Valor registrado</small></td><td><strong>{formatNumber(indicator.basisQuantity)}</strong><small>Cantidad base</small></td><td><strong>{formatCurrency(indicator.finalRate)}</strong><small>{indicator.adjustmentPerUnit ? `${formatSignedCurrency(indicator.adjustmentPerUnit)} ajuste` : "Sin ajuste"}</small></td><td><span className="unit-pill">{indicator.originalUnit || "Sin unidad"}</span></td><td><code>{indicator.source.sheet}!{indicator.source.cell}</code><small>Fila original</small></td><td><span className={`usage-pill usage-${indicator.usage}`}><StatusDot status={indicator.usage === "selectable" ? "good" : indicator.usage === "unmapped" ? "warning" : "muted"} />{INDICATOR_USAGE_LABELS[indicator.usage]}</span></td></tr>;
}

export default App;
