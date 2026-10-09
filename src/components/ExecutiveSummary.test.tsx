// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ExecutiveSummary,
  type ExecutiveSummaryProps,
} from "./ExecutiveSummary";

function buildProps(overrides: Partial<ExecutiveSummaryProps> = {}): ExecutiveSummaryProps {
  return {
    title: "Arbore",
    subtitle: "Presupuesto guardado · Referentes 2026",
    statusLabel: "Proyecto activo",
    metrics: [
      {
        id: "total",
        label: "Presupuesto total",
        value: "$ 148.683.422.078",
        note: "COP",
        icon: "budget",
      },
    ],
    comparison: {
      title: "Costo por capítulo frente al referente",
      primarySeries: { id: "project", label: "Arbore" },
      secondarySeries: { id: "reference", label: "Referente" },
      categories: [
        {
          id: "towers",
          label: "Torres",
          primaryValue: 2_871_262,
          primaryLabel: "$ 2.871.262/m²",
          secondaryValue: 2_721_262,
          secondaryLabel: "$ 2.721.262/m²",
        },
      ],
    },
    lines: [
      {
        id: "line-1",
        chapter: "Torres",
        referenceProject: "Arbore",
        referenceIndicator: "TORRES",
        quantity: "35.000 m²",
        unitRate: "$ 2.871.262/m²",
        total: "$ 100.494.184.708",
        status: { label: "Validado", tone: "good" },
      },
    ],
    analysis: {
      status: "ready",
      summary: "El costo de torres está por encima del referente.",
      recommendations: ["Validar el ajuste unitario de torres."],
      clarifications: ["Valores expresados en COP de 2026."],
      reviewPoints: ["Confirmar alcance de sótanos."],
    },
    onAnalyzeWithAi: vi.fn(),
    onExportPdf: vi.fn(),
    ...overrides,
  };
}

describe("ExecutiveSummary", () => {
  it("muestra los datos serializables del proyecto y sus dos series comparativas", () => {
    render(<ExecutiveSummary {...buildProps()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Arbore" })).toBeInTheDocument();
    expect(screen.getByText("$ 148.683.422.078")).toBeInTheDocument();

    const legend = screen.getByLabelText("Series comparadas");
    expect(within(legend).getByText("Arbore")).toBeInTheDocument();
    expect(within(legend).getByText("Referente")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("TORRES")).toBeInTheDocument();
    expect(within(table).getByText("Validado")).toBeInTheDocument();
    expect(screen.getByText("Validar el ajuste unitario de torres.")).toBeInTheDocument();
  });

  it("delega IA, PDF y administración del proyecto mediante callbacks", () => {
    const onAnalyzeWithAi = vi.fn();
    const onExportPdf = vi.fn();
    const onEditProject = vi.fn();
    const onDeleteProject = vi.fn();

    render(
      <ExecutiveSummary
        {...buildProps({
          analysis: {
            status: "idle",
            recommendations: [],
            clarifications: [],
            reviewPoints: [],
          },
          onAnalyzeWithAi,
          onExportPdf,
          onEditProject,
          onDeleteProject,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Analizar con IA" }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar informe PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar proyecto" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar proyecto" }));

    expect(onAnalyzeWithAi).toHaveBeenCalledOnce();
    expect(onExportPdf).toHaveBeenCalledOnce();
    expect(onEditProject).toHaveBeenCalledOnce();
    expect(onDeleteProject).toHaveBeenCalledOnce();
  });

  it("oculta acciones de edición para proyectos históricos y bloquea procesos activos", () => {
    render(
      <ExecutiveSummary
        {...buildProps({
          analysis: {
            status: "loading",
            recommendations: [],
            clarifications: [],
            reviewPoints: [],
          },
          isExporting: true,
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Editar proyecto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar proyecto" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analizando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generando PDF…" })).toBeDisabled();
  });
});
