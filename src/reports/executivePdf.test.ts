import { describe, expect, it } from "vitest";
import {
  buildExecutivePdf,
  createExecutivePdfFileName,
  formatCopForPdf,
  normalizePdfText,
  type ExecutivePdfInput,
} from "./executivePdf";

function sampleReport(overrides: Partial<ExecutivePdfInput> = {}): ExecutivePdfInput {
  return {
    title: "Resumen ejecutivo",
    projectName: "Serraclara Áreas y Diseño",
    generatedAt: "2026-10-09",
    summary: "Análisis consolidado del presupuesto seleccionado.",
    metrics: [
      { label: "Presupuesto total", value: 12_345_678, format: "cop" },
      { label: "Área", value: 4_321.25, format: "number", detail: "m²" },
    ],
    lines: [
      {
        concept: "Torre estructura y acabados",
        referenceProject: "Serraclara",
        unit: "m²",
        quantity: 1_200,
        unitRate: 2_500_000,
        total: 3_000_000_000,
      },
    ],
    recommendations: ["Validar el alcance técnico antes de contratar."],
    clarifications: ["Los valores están expresados en pesos colombianos."],
    considerations: ["Actualizar los referentes antes de la aprobación final."],
    comparisonSeries: [
      {
        title: "Costo total por proyecto",
        format: "cop",
        items: [
          { label: "Serraclara", value: 3_000_000_000, color: "#2563eb" },
          { label: "Arbore", value: 2_700_000_000 },
        ],
      },
    ],
    ...overrides,
  };
}

describe("executivePdf", () => {
  it("genera un documento PDF real y conserva los caracteres españoles compatibles", () => {
    const document = buildExecutivePdf(sampleReport());
    const bytes = new Uint8Array(document.output("arraybuffer"));
    const signature = String.fromCharCode(...bytes.slice(0, 5));

    expect(signature).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(3_000);
    expect(document.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(normalizePdfText("Áreas, diseño, recomendación y año")).toBe(
      "Áreas, diseño, recomendación y año",
    );
  });

  it("pagina tablas y narrativas extensas", () => {
    const lines = Array.from({ length: 90 }, (_, index) => ({
      concept: `Capítulo presupuestal ${index + 1} con descripción extensa`,
      referenceProject: index % 2 === 0 ? "Rocca" : "Pinar VIS",
      unit: "m²",
      quantity: 100 + index,
      unitRate: 1_000_000 + index,
      total: (100 + index) * (1_000_000 + index),
    }));
    const recommendations = Array.from(
      { length: 18 },
      (_, index) =>
        `Recomendación ${index + 1}: revisar cantidades, precios y exclusiones contractuales antes de aprobar el presupuesto.`,
    );

    const document = buildExecutivePdf(sampleReport({ lines, recommendations }));

    expect(document.getNumberOfPages()).toBeGreaterThan(4);
    expect(new Uint8Array(document.output("arraybuffer")).byteLength).toBeGreaterThan(10_000);
  });

  it("formatea COP, neutraliza números no finitos y crea nombres de archivo seguros", () => {
    expect(formatCopForPdf(1_234_567)).toContain("COP");
    expect(formatCopForPdf(Number.POSITIVE_INFINITY)).toContain("0");
    expect(createExecutivePdfFileName("  Árbol / Torre #5  ")).toBe(
      "informe-ejecutivo-arbol-torre-5.pdf",
    );
    expect(normalizePdfText("Costo — observación…")).toBe(
      "Costo - observación...",
    );
  });
});
