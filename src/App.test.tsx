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
});
