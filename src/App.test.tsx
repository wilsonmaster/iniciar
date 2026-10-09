// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { DEFAULT_WORKBOOK } from "./data/defaultWorkbook";
import { filterCostIndicatorsByProject } from "./domain/catalogProjects";
import { PROJECT_STORAGE_KEY } from "./domain/projectStorage";
import { formatCurrency } from "./utils/format";

const PROJECT_NAMES = [
  "Serraclara",
  "Arbore",
  "Rocca",
  "Oficinas Rocca",
  "Urbanismo Casas",
  "Oficinas T6",
  "Pinar VIS",
] as const;

const SOURCE_COLUMNS = [
  "Capítulo",
  "UN",
  "Valor",
  "Área",
  "VR/M²",
  "Ajuste M²",
  "VR/M² + ajuste",
  "Estado",
] as const;

function getProjectSelector(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "Proyecto activo" });
}

function clickTopNewBudget(): void {
  const topbar = document.querySelector<HTMLElement>(".topbar");
  expect(topbar).not.toBeNull();
  fireEvent.click(
    within(topbar as HTMLElement).getByRole("button", {
      name: "Nuevo presupuesto",
    }),
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("permite elegir cualquiera de los siete proyectos y lleva su selección al resumen ejecutivo", () => {
    render(<App />);

    const projectSelector = getProjectSelector();
    expect(
      Array.from(projectSelector.options, (option) => option.textContent),
    ).toEqual(["Todos los proyectos", ...PROJECT_NAMES]);

    fireEvent.change(projectSelector, { target: { value: "serraclara" } });

    expect(projectSelector).toHaveValue("serraclara");
    expect(
      screen.getByRole("combobox", { name: "Proyecto activo en la barra superior" }),
    ).toHaveValue("serraclara");
    expect(
      screen.getByRole("heading", { level: 1, name: /Serraclara/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Partidas y referentes utilizados" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /^Indicadores\s*Biblioteca trazable$/i,
      }),
    );

    const serraclaraHeading = screen.getByRole("heading", {
      level: 2,
      name: "Serraclara",
    });
    const serraclaraSection = serraclaraHeading.closest<HTMLElement>(
      ".catalog-project-section",
    );
    expect(serraclaraSection).not.toBeNull();

    const project = within(serraclaraSection as HTMLElement);
    expect(project.getByText("9 indicadores · 2 cuadros")).toBeInTheDocument();
    expect(
      serraclaraSection?.querySelectorAll("tbody .catalog-indicator-row"),
    ).toHaveLength(9);

    const sourceTables = project.getAllByRole("table");
    expect(sourceTables).toHaveLength(2);
    for (const table of sourceTables) {
      expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(SOURCE_COLUMNS);
    }
  });

  it("muestra los 45 indicadores, siete proyectos y diez cuadros de la hoja completa", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /^Indicadores\s*Biblioteca trazable$/i,
      }),
    );

    const stats = document.querySelector<HTMLElement>(".reference-stats");
    expect(stats).not.toBeNull();
    expect(within(stats as HTMLElement).getByText("45")).toBeInTheDocument();
    expect(within(stats as HTMLElement).getByText("7")).toBeInTheDocument();
    expect(within(stats as HTMLElement).getByText("10")).toBeInTheDocument();

    for (const projectName of PROJECT_NAMES) {
      expect(
        screen.getByRole("heading", { level: 2, name: projectName }),
      ).toBeInTheDocument();
    }

    expect(document.querySelectorAll("tbody .catalog-indicator-row")).toHaveLength(45);
    expect(document.querySelectorAll(".catalog-block-card")).toHaveLength(10);
  });

  it("crea un presupuesto desde el proyecto activo, recalcula y deja cambiar el referente", () => {
    render(<App />);

    fireEvent.change(getProjectSelector(), { target: { value: "arbore" } });
    clickTopNewBudget();

    expect(
      screen.getByRole("heading", {
        name: "Nuevo presupuesto por indicadores",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Proyecto inicial:/)).toHaveTextContent(
      "Proyecto inicial: Arbore",
    );

    const quantities = screen.getAllByRole("spinbutton", {
      name: /^Cantidad de la línea/i,
    });
    expect(quantities).toHaveLength(4);

    const firstArboreIndicator = filterCostIndicatorsByProject(
      DEFAULT_WORKBOOK.costIndicators,
      "arbore",
    ).find((indicator) => indicator.usage === "selectable");
    expect(firstArboreIndicator).toBeDefined();

    fireEvent.change(quantities[0], { target: { value: "10" } });

    const summary = screen.getByLabelText("Resumen del presupuesto");
    expect(summary.textContent).toContain(
      formatCurrency((firstArboreIndicator?.finalRate ?? 0) * 10),
    );

    const projectSelector = screen.getByRole("combobox", {
      name: "Proyecto referente de la línea 1",
    });
    fireEvent.change(projectSelector, { target: { value: "pinar-vis" } });

    expect(projectSelector).toHaveValue("pinar-vis");
    expect(
      screen.getByRole("combobox", { name: "Indicador de la línea 1" }),
    ).toHaveDisplayValue(/PRELIMINARES/i);

    const firstPinarIndicator = filterCostIndicatorsByProject(
      DEFAULT_WORKBOOK.costIndicators,
      "pinar-vis",
    ).find((indicator) => indicator.usage === "selectable");
    expect(firstPinarIndicator).toBeDefined();
    expect(summary.textContent).toContain(
      formatCurrency((firstPinarIndicator?.finalRate ?? 0) * 10),
    );
  });

  it("mantiene independiente el primer presupuesto al crear una segunda pestaña", () => {
    render(<App />);
    clickTopNewBudget();

    const nameInput = screen.getByRole("textbox", {
      name: "Nombre del presupuesto",
    });
    fireEvent.change(nameInput, { target: { value: "Torre Norte" } });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Cantidad de la línea 1" }),
      { target: { value: "25" } },
    );

    const workspace = document.querySelector<HTMLElement>(".budget-workspace");
    expect(workspace).not.toBeNull();
    fireEvent.click(
      within(workspace as HTMLElement).getByRole("button", {
        name: "Nuevo presupuesto",
      }),
    );

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    const firstBudgetTab = screen.getByRole("tab", { name: /Torre Norte/i });
    fireEvent.click(firstBudgetTab);

    expect(firstBudgetTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("textbox", { name: "Nombre del presupuesto" }),
    ).toHaveValue("Torre Norte");
    expect(
      screen.getByRole("spinbutton", { name: "Cantidad de la línea 1" }),
    ).toHaveValue(25);
  });

  it("guarda un presupuesto como proyecto activo y lo restaura al volver a abrir la aplicación", async () => {
    const firstRender = render(<App />);

    fireEvent.change(getProjectSelector(), { target: { value: "arbore" } });
    clickTopNewBudget();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Nombre del presupuesto" }),
      { target: { value: "Parque 175" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Área total construida" }),
      { target: { value: "35000" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Cantidad de la línea 1" }),
      { target: { value: "35000" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar como proyecto activo" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Parque 175 quedó guardado en Proyectos activos.",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /Parque 175/i }),
    ).toBeInTheDocument();
    expect(getProjectSelector().selectedOptions[0]).toHaveTextContent("Parque 175");

    await waitFor(() => {
      const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw ?? "{}") as {
        activeProjectId?: string;
        projects?: Array<{ id: string; name: string; status: string; areaM2?: number }>;
      };
      expect(stored.activeProjectId).toBe(stored.projects?.[0]?.id);
      expect(stored.projects).toEqual([
        expect.objectContaining({
          name: "Parque 175",
          status: "active",
          areaM2: 35000,
        }),
      ]);
    });

    firstRender.unmount();
    render(<App />);

    expect(getProjectSelector().selectedOptions[0]).toHaveTextContent("Parque 175");
    expect(
      screen.getByRole("heading", { level: 1, name: /Parque 175/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar proyecto" }),
    ).toBeInTheDocument();
  });

  it("restaura la tarifa congelada de un proyecto aunque el indicador no exista en el catálogo inicial", () => {
    window.localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeProjectId: "proyecto-importado",
        projects: [
          {
            id: "proyecto-importado",
            name: "Proyecto con tarifas importadas",
            baseProjectId: "arbore",
            status: "active",
            areaM2: 10,
            lines: [
              {
                id: "linea-importada",
                indicatorId: "indicador-que-no-esta-en-el-catalogo-inicial",
                indicatorSnapshot: {
                  id: "indicador-que-no-esta-en-el-catalogo-inicial",
                  groupLabel: "Cuadro importado",
                  project: "Arbore",
                  baseYear: 2027,
                  concept: "TORRE IMPORTADA",
                  originalUnit: "m2",
                  finalRate: 2_345_678,
                  usage: "selectable",
                },
                quantity: 10,
                adjustmentPerUnit: 0,
              },
            ],
          },
        ],
      }),
    );

    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Proyecto con tarifas importadas/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("TORRE IMPORTADA").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("row", { name: /TORRE IMPORTADA/i }),
    ).toHaveTextContent("23.456.780");
    expect(screen.queryByText(/indicador ya no existe/i)).not.toBeInTheDocument();
  });

  it("analiza, edita y elimina un proyecto guardado desde su resumen ejecutivo", () => {
    render(<App />);
    clickTopNewBudget();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Nombre del presupuesto" }),
      { target: { value: "Torre editable" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Cantidad de la línea 1" }),
      { target: { value: "1200" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar como proyecto activo" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Analizar con IA" }));

    expect(
      screen.getByRole("heading", { name: "Recomendaciones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Aclaraciones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Puntos a revisar" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editar proyecto" }));
    const nameInput = screen.getByRole("textbox", {
      name: "Nombre del presupuesto",
    });
    expect(nameInput).toHaveValue("Torre editable");
    fireEvent.change(nameInput, { target: { value: "Torre actualizada" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar cambios y ver resumen" }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: /Torre actualizada/i }),
    ).toBeInTheDocument();
    expect(getProjectSelector().selectedOptions[0]).toHaveTextContent(
      "Torre actualizada",
    );

    const confirmDelete = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar proyecto" }));

    expect(confirmDelete).toHaveBeenCalledWith(
      expect.stringContaining('¿Eliminar el proyecto "Torre actualizada"?'),
    );
    expect(getProjectSelector()).toHaveValue("all");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Resumen ejecutivo · Todos los proyectos/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Torre actualizada" }),
    ).not.toBeInTheDocument();
  });
});
