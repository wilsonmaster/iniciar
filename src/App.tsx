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
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  UploadCloud,
  X,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { BudgetWorkspace, type BudgetLineUpdate } from "./components/BudgetWorkspace";
import { DEFAULT_WORKBOOK } from "./data/defaultWorkbook";
import {
  createBudgetDraftFromProject,
  type BudgetDraft,
} from "./domain/budget";
import {
  buildCostProjectCatalog,
  COST_PROJECTS,
  filterCostIndicatorsByProject,
  type CostProjectId,
} from "./domain/catalogProjects";
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
type ActiveCostProject = "all" | CostProjectId;
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
  { id: "scenarios", label: "Presupuestos", caption: "Áreas, referentes y cálculo", icon: SlidersHorizontal },
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

function createClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const [activeCostProjectId, setActiveCostProjectId] = useState<ActiveCostProject>("all");
  const [selectedChapter, setSelectedChapter] = useState<ChapterKey>("vis-towers");
  const [manualReferenceSelections, setManualReferenceSelections] = useState<Set<string>>(
    () => new Set(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const [budgetDrafts, setBudgetDrafts] = useState<BudgetDraft[]>([]);
  const [activeBudgetId, setActiveBudgetId] = useState<string | null>(null);
  const [budgetUploadState, setBudgetUploadState] = useState<UploadState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const budgetFileInputRef = useRef<HTMLInputElement>(null);
  const pendingBudgetImportIdRef = useRef<string | null>(null);

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

  const costProjectCatalog = useMemo(
    () => buildCostProjectCatalog(workbook.costIndicators),
    [workbook.costIndicators],
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

  const createBudget = () => {
    const projectId: CostProjectId = activeCostProjectId === "all"
      ? "serraclara"
      : activeCostProjectId;
    const id = createClientId("presupuesto");
    const draft = createBudgetDraftFromProject(
      {
        id,
        name: `Presupuesto ${budgetDrafts.length + 1}`,
        baseProjectId: projectId,
      },
      workbook.costIndicators,
    );
    setBudgetDrafts((current) => [...current, draft]);
    setActiveBudgetId(id);
    setBudgetUploadState({ status: "idle" });
    setActiveView("scenarios");
    setSidebarOpen(false);
  };

  const updateBudget = (
    budgetId: string,
    updater: (draft: BudgetDraft) => BudgetDraft,
  ) => {
    setBudgetDrafts((current) =>
      current.map((draft) => (draft.id === budgetId ? updater(draft) : draft)),
    );
  };

  const renameBudget = (budgetId: string, name: string) => {
    updateBudget(budgetId, (draft) => ({ ...draft, name }));
  };

  const duplicateBudget = (budgetId: string) => {
    const source = budgetDrafts.find((draft) => draft.id === budgetId);
    if (!source) return;
    const id = createClientId("presupuesto");
    const copy: BudgetDraft = {
      ...structuredClone(source),
      id,
      name: `${source.name || "Presupuesto"} · copia`,
      lines: source.lines.map((line) => ({ ...line, id: createClientId("linea") })),
    };
    setBudgetDrafts((current) => [...current, copy]);
    setActiveBudgetId(id);
  };

  const addBudgetLine = (budgetId: string) => {
    updateBudget(budgetId, (draft) => {
      const projectIndicators = filterCostIndicatorsByProject(
        workbook.costIndicators,
        draft.baseProjectId,
      );
      const indicator = projectIndicators.find((item) => item.usage === "selectable")
        ?? projectIndicators[0]
        ?? workbook.costIndicators.find((item) => item.usage === "selectable")
        ?? workbook.costIndicators[0];
      if (!indicator) return draft;
      return {
        ...draft,
        lines: [
          ...draft.lines,
          {
            id: createClientId("linea"),
            indicatorId: indicator.id,
            quantity: 0,
            adjustmentPerUnit: 0,
          },
        ],
      };
    });
  };

  const updateBudgetLine = (
    budgetId: string,
    lineId: string,
    changes: BudgetLineUpdate,
  ) => {
    updateBudget(budgetId, (draft) => ({
      ...draft,
      lines: draft.lines.map((line) =>
        line.id === lineId ? { ...line, ...changes } : line,
      ),
    }));
  };

  const removeBudgetLine = (budgetId: string, lineId: string) => {
    updateBudget(budgetId, (draft) => ({
      ...draft,
      lines: draft.lines.filter((line) => line.id !== lineId),
    }));
  };

  const requestBudgetAreaImport = (budgetId: string) => {
    pendingBudgetImportIdRef.current = budgetId;
    budgetFileInputRef.current?.click();
  };

  const handleBudgetAreaFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const budgetId = pendingBudgetImportIdRef.current;
    if (!file || !budgetId) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setBudgetUploadState({ status: "error", fileName: file.name, message: "Selecciona un archivo .xlsx basado en la plantilla de áreas." });
      event.target.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setBudgetUploadState({ status: "error", fileName: file.name, message: "El archivo supera el límite de 20 MB." });
      event.target.value = "";
      return;
    }

    setBudgetUploadState({ status: "loading", fileName: file.name });
    try {
      const { importAreaBudgetWorkbook } = await import("./import/areaBudgetWorkbook");
      const result = importAreaBudgetWorkbook(
        await file.arrayBuffer(),
        workbook.costIndicators,
        file.name,
      );
      const errors = result.quality.issues.filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        throw new Error(errors.slice(0, 2).map((issue) => issue.message).join(" "));
      }

      updateBudget(budgetId, (draft) => {
        const importedByIndicator = new Map(
          result.lines.map((line) => [line.indicator.id, line] as const),
        );
        const merged = draft.lines.map((line) => {
          const imported = importedByIndicator.get(line.indicatorId);
          if (!imported) return line;
          importedByIndicator.delete(line.indicatorId);
          return {
            ...line,
            quantity: imported.quantity,
            adjustmentPerUnit: imported.adjustmentPerUnit,
          };
        });
        for (const imported of importedByIndicator.values()) {
          merged.push({
            id: createClientId("linea"),
            indicatorId: imported.indicator.id,
            quantity: imported.quantity,
            adjustmentPerUnit: imported.adjustmentPerUnit,
          });
        }
        return { ...draft, lines: merged };
      });

      const warningCount = result.quality.issues.filter((issue) => issue.severity === "warning").length;
      setActiveBudgetId(budgetId);
      setBudgetUploadState({
        status: "success",
        fileName: file.name,
        message: `${result.lines.length} ${result.lines.length === 1 ? "fila aplicada" : "filas aplicadas"}${warningCount ? ` · ${warningCount} ${warningCount === 1 ? "aviso" : "avisos"} por revisar` : ""}.`,
      });
    } catch (error) {
      setBudgetUploadState({
        status: "error",
        fileName: file.name,
        message: error instanceof Error ? error.message : "No fue posible leer el cuadro de áreas.",
      });
    } finally {
      event.target.value = "";
      pendingBudgetImportIdRef.current = null;
    }
  };

  const downloadBudgetAreaTemplate = async () => {
    const { downloadAreaBudgetTemplate } = await import("./import/areaBudgetWorkbook");
    downloadAreaBudgetTemplate(workbook.costIndicators);
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

        <div className="workspace-card workspace-selector">
          <div className="workspace-icon"><Home size={18} /></div>
          <label>
            <span>Proyecto activo</span>
            <select
              aria-label="Proyecto activo"
              value={activeCostProjectId}
              onChange={(event) => {
                setActiveCostProjectId(event.target.value as ActiveCostProject);
                setActiveView("references");
                setSidebarOpen(false);
              }}
            >
              <option value="all">Todos los proyectos</option>
              {COST_PROJECTS.map((project) => (
                <option key={project.id} value={project.id}>{project.label}</option>
              ))}
            </select>
          </label>
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
            <label className="top-project-selector">
              <span>Proyecto activo</span>
              <select
                aria-label="Proyecto activo en la barra superior"
                value={activeCostProjectId}
                onChange={(event) => {
                  setActiveCostProjectId(event.target.value as ActiveCostProject);
                  setActiveView("references");
                }}
              >
                <option value="all">Todos los proyectos</option>
                {COST_PROJECTS.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
              </select>
            </label>
            <button className="button button-primary top-new-budget" onClick={createBudget}><Plus size={17} /><span>Nuevo presupuesto</span></button>
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
              <button className="button button-primary" onClick={createBudget}>Nuevo presupuesto <ArrowRight size={17} /></button>
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
    return (
      <>
        <section className="page-heading budget-page-heading">
          <div>
            <span className="eyebrow">Presupuestos editables</span>
            <h1>Nuevo presupuesto por indicadores</h1>
            <p>Elige referentes de cualquiera de los siete proyectos, ingresa o importa las áreas y revisa el cálculo inmediatamente.</p>
          </div>
          <div className="heading-actions">
            <button className="button button-ghost" onClick={downloadBudgetAreaTemplate}><Download size={16} /> Descargar plantilla de áreas</button>
          </div>
        </section>

        <input
          ref={budgetFileInputRef}
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleBudgetAreaFile}
        />

        {budgetUploadState.status === "success" || budgetUploadState.status === "error" ? (
          <div className={`budget-import-feedback is-${budgetUploadState.status}`} role="status">
            {budgetUploadState.status === "success" ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
            <div><strong>{budgetUploadState.status === "success" ? "Cuadro de áreas cargado" : "No se pudo cargar el cuadro"}</strong><span>{budgetUploadState.message}</span></div>
            <button onClick={() => setBudgetUploadState({ status: "idle" })} aria-label="Cerrar mensaje"><X size={15} /></button>
          </div>
        ) : null}

        <BudgetWorkspace
          drafts={budgetDrafts}
          activeDraftId={activeBudgetId}
          catalog={workbook.costIndicators}
          projectDefinitions={COST_PROJECTS}
          onSelectDraft={setActiveBudgetId}
          onRenameDraft={renameBudget}
          onCreateDraft={createBudget}
          onDuplicateDraft={duplicateBudget}
          onAddLine={addBudgetLine}
          onUpdateLine={updateBudgetLine}
          onRemoveLine={removeBudgetLine}
          onImportAreas={requestBudgetAreaImport}
          isImporting={budgetUploadState.status === "loading"}
        />

        <div className="governance-note budget-governance-note">
          <ShieldCheck size={22} />
          <div><strong>Cálculo editable y trazable</strong><p>La cantidad y el ajuste pertenecen solo a este presupuesto. Las tarifas originales del catálogo nunca se modifican.</p></div>
          <button onClick={() => setActiveView("references")}>Consultar indicadores <ArrowRight size={15} /></button>
        </div>
      </>
    );
  }

  function renderLegacyScenarios() {
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
    const selectedProjects = activeCostProjectId === "all"
      ? costProjectCatalog
      : costProjectCatalog.filter((project) => project.id === activeCostProjectId);
    const projectCards = selectedProjects
      .map((project) => ({
        ...project,
        blocks: project.blocks
          .map((block) => ({
            ...block,
            indicators: block.indicators.filter((indicator) => !query || [
              indicator.concept,
              indicator.project,
              indicator.groupLabel,
              indicator.originalUnit,
              INDICATOR_USAGE_LABELS[indicator.usage],
              indicator.source.sheet,
              indicator.source.cell,
            ].some((value) => value.toLocaleLowerCase("es").includes(query))),
          }))
          .filter((block) => block.indicators.length > 0),
      }))
      .filter((project) => project.blocks.length > 0);
    const visibleIndicators = projectCards.flatMap((project) =>
      project.blocks.flatMap((block) => block.indicators),
    );
    const scopedIndicators = selectedProjects.flatMap((project) => project.indicators);
    const scopedBlockCount = selectedProjects.reduce((total, project) => total + project.blocks.length, 0);
    const selectableCount = scopedIndicators.filter((indicator) => indicator.usage === "selectable").length;

    return (
      <>
        <section className="page-heading"><div><span className="eyebrow">Hoja completa · Indicadores costos</span><h1>Indicadores de costo por proyecto</h1><p>Selecciona un proyecto y consulta todos sus cuadros exactamente con las tarifas, áreas y ajustes de la fuente.</p></div><button className="button button-ghost" onClick={() => setActiveView("import")}><UploadCloud size={16} /> Actualizar catálogo</button></section>
        <section className="reference-stats">
          <div><span className="stat-icon blue"><Database size={19} /></span><p><strong>{scopedIndicators.length}</strong><small>indicadores visibles</small></p></div>
          <div><span className="stat-icon green"><Building2 size={19} /></span><p><strong>{selectedProjects.length}</strong><small>{selectedProjects.length === 1 ? "proyecto seleccionado" : "proyectos históricos"}</small></p></div>
          <div><span className="stat-icon amber"><TableProperties size={19} /></span><p><strong>{scopedBlockCount}</strong><small>cuadros de indicadores</small></p></div>
          <div><span className="stat-icon ink"><CheckCircle2 size={19} /></span><p><strong>{selectableCount}</strong><small>disponibles como referente</small></p></div>
        </section>
        <section className="project-catalog" aria-label="Proyectos de indicadores">
          <div className="catalog-filter project-filter" role="group" aria-label="Seleccionar proyecto de indicadores">
            <button className={activeCostProjectId === "all" ? "is-active" : ""} onClick={() => setActiveCostProjectId("all")}>Todos<span>{workbook.costIndicators.length}</span></button>
            {costProjectCatalog.map((project) => <button key={project.id} className={activeCostProjectId === project.id ? "is-active" : ""} onClick={() => setActiveCostProjectId(project.id)}>{project.label}<span>{project.indicators.length}</span></button>)}
          </div>
          <div className="reference-toolbar card"><div className="search-box"><Search size={17} /><input value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} placeholder="Buscar capítulo, cuadro, proyecto o celda…" />{referenceSearch ? <button onClick={() => setReferenceSearch("")} aria-label="Limpiar búsqueda"><X size={15} /></button> : null}</div><span className="soft-badge">{visibleIndicators.length} resultados</span></div>
          <div className="project-catalog-results">
            {projectCards.map((project) => (
              <section className="catalog-project-section" key={project.id}>
                <div className="catalog-project-heading"><div><span className="eyebrow">Proyecto referente</span><h2>{project.label}</h2></div><span>{project.indicators.length} indicadores · {project.blocks.length} {project.blocks.length === 1 ? "cuadro" : "cuadros"}</span></div>
                <div className="catalog-block-list">
                  {project.blocks.map((block) => {
                    const first = block.indicators[0];
                    return <article className="card catalog-block-card" key={block.id}>
                      <div className="catalog-block-heading"><div><strong>{block.label}</strong><span>Base {first?.baseYear ?? workbook.metadata.baseYear}{first?.floorCount ? ` · ${first.floorCount} pisos` : ""}</span></div><small>{block.indicators.length} {block.indicators.length === 1 ? "indicador" : "indicadores"}</small></div>
                      <div className="table-scroll"><table className="data-table reference-table catalog-source-table"><thead><tr><th>Capítulo</th><th>UN</th><th>Valor</th><th>Área</th><th>VR/M²</th><th>Ajuste M²</th><th>VR/M² + ajuste</th><th>Estado</th></tr></thead><tbody>{block.indicators.map((indicator) => <CostIndicatorRow key={indicator.id} indicator={indicator} />)}</tbody></table></div>
                    </article>;
                  })}
                </div>
              </section>
            ))}
            {projectCards.length === 0 ? <article className="card catalog-empty-state"><Search size={24} /><strong>Sin coincidencias</strong><p>Prueba otro texto o vuelve a mostrar todos los proyectos.</p></article> : null}
          </div>
        </section>
        <div className="governance-note"><ShieldCheck size={22} /><div><strong>Los 45 indicadores permanecen visibles</strong><p>Los indicadores parciales, administrativos o por clasificar se muestran con su estado; la aplicación no los usa silenciosamente como referentes completos.</p></div><button onClick={() => setActiveView("import")}>Ver control de calidad <ArrowRight size={15} /></button></div>
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
  return <tr className="catalog-indicator-row">
    <td><strong>{indicator.concept}</strong><small>{chapters || "Sin capítulo asignado"} · {indicator.source.sheet}!{indicator.source.cell}</small></td>
    <td><span className="unit-pill">{indicator.originalUnit || "—"}</span></td>
    <td><strong>{formatCurrency(indicator.historicalAmount)}</strong></td>
    <td><strong>{formatNumber(indicator.basisQuantity)}</strong></td>
    <td><strong>{formatCurrency(indicator.unitRate)}</strong></td>
    <td><strong>{formatSignedCurrency(indicator.adjustmentPerUnit)}</strong></td>
    <td><strong>{formatCurrency(indicator.finalRate)}</strong></td>
    <td><span className={`usage-pill usage-${indicator.usage}`}><StatusDot status={indicator.usage === "selectable" ? "good" : indicator.usage === "unmapped" ? "warning" : "muted"} />{INDICATOR_USAGE_LABELS[indicator.usage]}</span></td>
  </tr>;
}

export default App;
