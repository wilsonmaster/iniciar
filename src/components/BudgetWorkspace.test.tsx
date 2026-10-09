// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_COST_INDICATORS } from "../data/defaultCostIndicators";
import type { BudgetDraft } from "../domain/budget";
import { COST_PROJECTS } from "../domain/catalogProjects";
import { BudgetWorkspace, type BudgetWorkspaceProps } from "./BudgetWorkspace";

const SERRACLARA_PRELIMINARIES = DEFAULT_COST_INDICATORS.find(
  (indicator) =>
    indicator.project === "Serraclara" && indicator.concept === "PRELIMINARES",
);

function renderWorkspace(overrides: Partial<BudgetWorkspaceProps> = {}) {
  if (SERRACLARA_PRELIMINARIES === undefined) {
    throw new Error("No se encontró el indicador de prueba.");
  }

  const draft: BudgetDraft = {
    id: "budget-1",
    name: "Presupuesto de prueba",
    baseProjectId: "serraclara",
    lines: [
      {
        id: "line-1",
        indicatorId: SERRACLARA_PRELIMINARIES.id,
        quantity: 10,
        adjustmentPerUnit: 100,
      },
    ],
  };

  const props: BudgetWorkspaceProps = {
    drafts: [draft],
    activeDraftId: draft.id,
    catalog: DEFAULT_COST_INDICATORS,
    projectDefinitions: COST_PROJECTS,
    onSelectDraft: vi.fn(),
    onRenameDraft: vi.fn(),
    onCreateDraft: vi.fn(),
    onDuplicateDraft: vi.fn(),
    onAddLine: vi.fn(),
    onUpdateLine: vi.fn(),
    onRemoveLine: vi.fn(),
    onImportAreas: vi.fn(),
    ...overrides,
  };

  render(<BudgetWorkspace {...props} />);
  return props;
}

describe("BudgetWorkspace", () => {
  it("calcula y muestra el total editable de la pestaña activa", () => {
    renderWorkspace();

    expect(screen.getByDisplayValue("Presupuesto de prueba")).toBeInTheDocument();
    expect(screen.getByLabelText("Resumen del presupuesto")).toHaveTextContent(
      "2.184.643",
    );
    expect(
      screen.getByText((_, node) =>
        Boolean(
          node?.tagName === "P" &&
            node.textContent?.includes("Proyecto inicial: Serraclara"),
        ),
      ),
    ).toBeInTheDocument();
  });

  it("cambia el referente por proyecto y conserva los cambios en callbacks controlados", () => {
    const onUpdateLine = vi.fn();
    renderWorkspace({ onUpdateLine });

    fireEvent.change(screen.getByLabelText("Proyecto referente de la línea 1"), {
      target: { value: "arbore" },
    });

    expect(onUpdateLine).toHaveBeenCalledWith("budget-1", "line-1", {
      indicatorId: "arbore-2026-r18",
    });

    fireEvent.change(screen.getByLabelText("Cantidad de la línea 1"), {
      target: { value: "25" },
    });

    expect(onUpdateLine).toHaveBeenCalledWith("budget-1", "line-1", {
      quantity: 25,
    });
  });

  it("ofrece crear el primer presupuesto cuando no hay pestañas", () => {
    const onCreateDraft = vi.fn();
    renderWorkspace({ drafts: [], activeDraftId: null, onCreateDraft });

    fireEvent.click(screen.getByRole("button", { name: "Nuevo presupuesto" }));

    expect(onCreateDraft).toHaveBeenCalledOnce();
  });
});

