// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { DEFAULT_WORKBOOK } from "./data/defaultWorkbook";
import { filterCostIndicatorsByProject } from "./domain/catalogProjects";
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
  it("permite elegir cualquiera de los siete proyectos y muestra los dos cuadros de Serraclara", () => {
    render(<App />);

    const projectSelector = getProjectSelector();
    expect(
      Array.from(projectSelector.options, (option) => option.textContent),
    ).toEqual(["Todos los proyectos", ...PROJECT_NAMES]);

    fireEvent.change(projectSelector, { target: { value: "serraclara" } });

    expect(projectSelector).toHaveValue("serraclara");
    expect(
      screen.getByRole("heading", {
        name: "Indicadores de costo por proyecto",
      }),
    ).toBeInTheDocument();

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
});
