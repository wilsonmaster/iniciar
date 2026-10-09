// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("muestra el comparativo inicial y permite abrir el simulador", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /Decidir con números que se pueden explicar/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/157,42/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Abrir simulador/i }));

    expect(
      screen.getByRole("heading", { name: "Escenarios de cabida" }),
    ).toBeInTheDocument();
    const visUnits = screen.getByLabelText(/Viviendas VIS/i);
    expect(visUnits).toHaveValue(724);
    fireEvent.change(visUnits, { target: { value: "725" } });
    expect(visUnits).toHaveValue(725);
  });

  it("muestra los 45 indicadores y permite filtrarlos por tipo de proyecto", () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /IndicadoresBiblioteca trazable/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Indicadores de costo" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("45").length).toBeGreaterThan(0);
    expect(screen.getByText(/INDICADORES SERRACLARA-2026/i)).toBeInTheDocument();
    expect(
      screen.getByText(/OFICINAS \+ COMERCIO 16 PISOS- SIN ACABADOS/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Oficinas10/i }));

    expect(screen.getByText(/10 resultados · 2 bloques/i)).toBeInTheDocument();
    expect(screen.queryByText(/INDICADORES SERRACLARA-2026/i)).not.toBeInTheDocument();
  });

  it("sugiere referentes, deja cambiarlos y permite crear captura manual", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Abrir simulador/i }));

    const selector = screen.getByRole("combobox", {
      name: /Referente de Torres VIS para Escenario 2/i,
    }) as HTMLSelectElement;
    expect(selector.options.length).toBeGreaterThan(1);
    expect(screen.getAllByText("Sugerido inicialmente").length).toBeGreaterThan(0);

    fireEvent.change(selector, { target: { value: selector.options[1].value } });

    expect(screen.getByText("Selección manual")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Nuevo escenario manual/i }),
    );
    expect(screen.getByLabelText(/Viviendas VIS/i)).toHaveValue(0);
    expect(screen.getByText(/Escenario manual 1/i)).toBeInTheDocument();
  });
});
