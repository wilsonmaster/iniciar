import { jsPDF } from "jspdf";

export type ExecutivePdfValueFormat = "cop" | "number" | "percent" | "text";

export interface ExecutivePdfMetric {
  label: string;
  value: number | string;
  format?: ExecutivePdfValueFormat;
  detail?: string;
}

export interface ExecutivePdfLine {
  concept: string;
  referenceProject?: string;
  unit?: string;
  quantity: number;
  unitRate: number;
  total: number;
}

export interface ExecutivePdfComparisonItem {
  label: string;
  value: number;
  /** Optional RGB hexadecimal color, for example `#2563eb`. */
  color?: string;
}

export interface ExecutivePdfComparisonSeries {
  title: string;
  format?: Exclude<ExecutivePdfValueFormat, "text">;
  items: readonly ExecutivePdfComparisonItem[];
}

/**
 * Serializable input for the executive report.
 *
 * The PDF renderer never invents or requests analysis. Recommendations and the
 * other narrative sections are printed exactly from the strings supplied by
 * the caller (after replacing characters unsupported by the built-in PDF
 * font). This lets the application decide whether those strings come from a
 * person, deterministic rules, or an explicitly configured AI service.
 */
export interface ExecutivePdfInput {
  title: string;
  projectName: string;
  /** ISO date or timestamp. A non-ISO string is rendered unchanged. */
  generatedAt: string;
  summary?: string;
  metrics: readonly ExecutivePdfMetric[];
  lines: readonly ExecutivePdfLine[];
  recommendations: readonly string[];
  clarifications: readonly string[];
  considerations: readonly string[];
  comparisonSeries: readonly ExecutivePdfComparisonSeries[];
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_BOTTOM = 278;
const BRAND_BLUE: readonly [number, number, number] = [32, 91, 220];
const DARK_BLUE: readonly [number, number, number] = [15, 42, 77];
const BODY_COLOR: readonly [number, number, number] = [43, 57, 79];
const MUTED_COLOR: readonly [number, number, number] = [103, 119, 142];
const LIGHT_BLUE: readonly [number, number, number] = [236, 243, 255];
const BORDER_COLOR: readonly [number, number, number] = [216, 225, 238];

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Formats a finite value with an explicit COP currency code. */
export function formatCopForPdf(value: number): string {
  return copFormatter.format(finiteNumber(value));
}

/**
 * Keeps Spanish Latin-1 characters supported by jsPDF's built-in Helvetica
 * font and converts common typographic punctuation to safe equivalents.
 */
export function normalizePdfText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function formatDate(value: string): string {
  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = new Date(dateOnly ? `${trimmed}T12:00:00-05:00` : trimmed);

  if (Number.isNaN(parsed.getTime())) return normalizePdfText(trimmed);

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function formatValue(
  value: number | string,
  format: ExecutivePdfValueFormat = "text",
): string {
  if (typeof value === "string") return normalizePdfText(value);
  const safeValue = finiteNumber(value);

  switch (format) {
    case "cop":
      return formatCopForPdf(safeValue);
    case "number":
      return numberFormatter.format(safeValue);
    case "percent":
      return percentFormatter.format(safeValue);
    default:
      return normalizePdfText(safeValue);
  }
}

function splitText(doc: jsPDF, text: string, width: number): string[] {
  const lines = doc.splitTextToSize(normalizePdfText(text), width) as
    | string
    | string[];
  return Array.isArray(lines) ? lines : [lines];
}

function parseColor(value: string | undefined): [number, number, number] {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return [...BRAND_BLUE];
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function createDocument(): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setProperties({
    title: "Informe ejecutivo de presupuesto",
    subject: "Resumen ejecutivo y comparación de indicadores",
    author: "Cabida",
    creator: "Cabida",
  });
  doc.setFont("helvetica", "normal");
  return doc;
}

class PdfLayout {
  readonly doc: jsPDF;
  readonly projectName: string;
  y = 15;

  constructor(doc: jsPDF, projectName: string) {
    this.doc = doc;
    this.projectName = projectName;
  }

  ensureSpace(height: number): boolean {
    if (this.y + height <= CONTENT_BOTTOM) return false;
    this.doc.addPage();
    this.continuationHeader();
    return true;
  }

  continuationHeader(): void {
    this.doc.setFillColor(...DARK_BLUE);
    this.doc.rect(0, 0, PAGE_WIDTH, 13, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text("CABIDA | INFORME EJECUTIVO", MARGIN_X, 8.2);
    this.doc.setFont("helvetica", "normal");
    this.doc.text(
      normalizePdfText(this.projectName),
      PAGE_WIDTH - MARGIN_X,
      8.2,
      { align: "right", maxWidth: 80 },
    );
    this.y = 21;
  }

  sectionTitle(title: string): void {
    this.ensureSpace(13);
    this.doc.setFillColor(...LIGHT_BLUE);
    this.doc.roundedRect(MARGIN_X, this.y, CONTENT_WIDTH, 9, 1.5, 1.5, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...DARK_BLUE);
    this.doc.text(normalizePdfText(title), MARGIN_X + 4, this.y + 6);
    this.y += 13;
  }
}

function drawCoverHeader(layout: PdfLayout, input: ExecutivePdfInput): void {
  const { doc } = layout;
  doc.setFillColor(...DARK_BLUE);
  doc.rect(0, 0, PAGE_WIDTH, 51, "F");
  doc.setFillColor(...BRAND_BLUE);
  doc.roundedRect(MARGIN_X, 11, 22, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("CABIDA", MARGIN_X + 11, 17.5, { align: "center" });
  doc.setFontSize(18);
  doc.text(normalizePdfText(input.title), MARGIN_X, 33, {
    maxWidth: CONTENT_WIDTH,
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 216, 237);
  doc.text("Informe ejecutivo de presupuesto", MARGIN_X, 43);

  layout.y = 61;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...DARK_BLUE);
  doc.text(normalizePdfText(input.projectName), MARGIN_X, layout.y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`Fecha del informe: ${formatDate(input.generatedAt)}`, MARGIN_X, layout.y + 7);
  layout.y += 15;

  if (input.summary?.trim()) {
    const lines = splitText(doc, input.summary, CONTENT_WIDTH);
    layout.ensureSpace(lines.length * 4.3 + 5);
    doc.setFontSize(9.5);
    doc.setTextColor(...BODY_COLOR);
    doc.text(lines, MARGIN_X, layout.y, { lineHeightFactor: 1.35 });
    layout.y += lines.length * 4.3 + 4;
  }
}

function drawMetrics(
  layout: PdfLayout,
  metrics: readonly ExecutivePdfMetric[],
): void {
  if (metrics.length === 0) return;
  layout.sectionTitle("Indicadores clave");
  const { doc } = layout;
  const gap = 5;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const cardHeight = 23;

  metrics.forEach((metric, index) => {
    if (index > 0 && index % 2 === 0) layout.y += cardHeight + gap;
    if (index % 2 === 0) layout.ensureSpace(cardHeight + gap);
    const x = MARGIN_X + (index % 2) * (cardWidth + gap);

    doc.setDrawColor(...BORDER_COLOR);
    doc.setFillColor(249, 251, 254);
    doc.roundedRect(x, layout.y, cardWidth, cardHeight, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(normalizePdfText(metric.label).toUpperCase(), x + 4, layout.y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK_BLUE);
    doc.text(formatValue(metric.value, metric.format), x + 4, layout.y + 13.5, {
      maxWidth: cardWidth - 8,
    });

    if (metric.detail) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED_COLOR);
      doc.text(normalizePdfText(metric.detail), x + 4, layout.y + 19, {
        maxWidth: cardWidth - 8,
      });
    }
  });
  layout.y += cardHeight + 5;
}

const tableColumns = {
  concept: { x: MARGIN_X, width: 58 },
  project: { x: MARGIN_X + 58, width: 34 },
  quantity: { x: MARGIN_X + 92, width: 21 },
  rate: { x: MARGIN_X + 113, width: 32 },
  total: { x: MARGIN_X + 145, width: 35 },
} as const;

function drawTableHeader(layout: PdfLayout): void {
  const { doc } = layout;
  doc.setFillColor(...DARK_BLUE);
  doc.rect(MARGIN_X, layout.y, CONTENT_WIDTH, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(255, 255, 255);
  doc.text("CONCEPTO", tableColumns.concept.x + 2, layout.y + 5.8);
  doc.text("REFERENTE", tableColumns.project.x + 2, layout.y + 5.8);
  doc.text("CANTIDAD", tableColumns.quantity.x + tableColumns.quantity.width - 2, layout.y + 5.8, {
    align: "right",
  });
  doc.text("TARIFA", tableColumns.rate.x + tableColumns.rate.width - 2, layout.y + 5.8, {
    align: "right",
  });
  doc.text("TOTAL", tableColumns.total.x + tableColumns.total.width - 2, layout.y + 5.8, {
    align: "right",
  });
  layout.y += 9;
}

function drawLines(
  layout: PdfLayout,
  lines: readonly ExecutivePdfLine[],
): void {
  layout.sectionTitle("Detalle del presupuesto");
  const { doc } = layout;

  if (lines.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("Este proyecto todavía no tiene líneas presupuestales.", MARGIN_X, layout.y);
    layout.y += 9;
    return;
  }

  drawTableHeader(layout);
  lines.forEach((line, index) => {
    const concept = splitText(doc, line.concept, tableColumns.concept.width - 4);
    const reference = splitText(
      doc,
      line.referenceProject ?? "Sin referente",
      tableColumns.project.width - 4,
    );
    const lineCount = Math.max(concept.length, reference.length, 1);
    const rowHeight = Math.max(10, lineCount * 3.4 + 4.5);

    if (layout.ensureSpace(rowHeight)) drawTableHeader(layout);

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 253);
      doc.rect(MARGIN_X, layout.y, CONTENT_WIDTH, rowHeight, "F");
    }
    doc.setDrawColor(...BORDER_COLOR);
    doc.line(MARGIN_X, layout.y + rowHeight, PAGE_WIDTH - MARGIN_X, layout.y + rowHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(...BODY_COLOR);
    doc.text(concept, tableColumns.concept.x + 2, layout.y + 5, { lineHeightFactor: 1.2 });
    doc.text(reference, tableColumns.project.x + 2, layout.y + 5, { lineHeightFactor: 1.2 });

    const quantity = `${numberFormatter.format(finiteNumber(line.quantity))}${line.unit ? ` ${normalizePdfText(line.unit)}` : ""}`;
    doc.text(quantity, tableColumns.quantity.x + tableColumns.quantity.width - 2, layout.y + 5, {
      align: "right",
      maxWidth: tableColumns.quantity.width - 3,
    });
    doc.text(
      formatCopForPdf(line.unitRate),
      tableColumns.rate.x + tableColumns.rate.width - 2,
      layout.y + 5,
      { align: "right", maxWidth: tableColumns.rate.width - 3 },
    );
    doc.setFont("helvetica", "bold");
    doc.text(
      formatCopForPdf(line.total),
      tableColumns.total.x + tableColumns.total.width - 2,
      layout.y + 5,
      { align: "right", maxWidth: tableColumns.total.width - 3 },
    );
    layout.y += rowHeight;
  });
  layout.y += 5;
}

function drawComparisonSeries(
  layout: PdfLayout,
  seriesCollection: readonly ExecutivePdfComparisonSeries[],
): void {
  if (seriesCollection.length === 0) return;
  layout.sectionTitle("Gráficas comparativas");
  const { doc } = layout;

  for (const series of seriesCollection) {
    layout.ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...DARK_BLUE);
    doc.text(normalizePdfText(series.title), MARGIN_X, layout.y);
    layout.y += 7;

    if (series.items.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED_COLOR);
      doc.text("Sin datos comparativos.", MARGIN_X, layout.y);
      layout.y += 9;
      continue;
    }

    const maxMagnitude = Math.max(
      1,
      ...series.items.map((item) => Math.abs(finiteNumber(item.value))),
    );
    for (const item of series.items) {
      layout.ensureSpace(13);
      const safeValue = finiteNumber(item.value);
      const label = splitText(doc, item.label, 48).slice(0, 2);
      const barX = MARGIN_X + 51;
      const barWidth = 78;
      const valueX = PAGE_WIDTH - MARGIN_X;
      const fillColor = parseColor(item.color);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.setTextColor(...BODY_COLOR);
      doc.text(label, MARGIN_X, layout.y + 3, { lineHeightFactor: 1.15 });
      doc.setFillColor(232, 237, 245);
      doc.roundedRect(barX, layout.y, barWidth, 5.5, 1, 1, "F");
      doc.setFillColor(...fillColor);
      doc.roundedRect(
        barX,
        layout.y,
        Math.max(0.8, (Math.abs(safeValue) / maxMagnitude) * barWidth),
        5.5,
        1,
        1,
        "F",
      );
      doc.setFont("helvetica", "bold");
      doc.text(
        formatValue(safeValue, series.format ?? "cop"),
        valueX,
        layout.y + 4.2,
        { align: "right", maxWidth: 47 },
      );
      layout.y += Math.max(10.5, label.length * 3.2 + 3);
    }
    layout.y += 3;
  }
}

function drawNarrativeSection(
  layout: PdfLayout,
  title: string,
  items: readonly string[],
): void {
  if (items.length === 0) return;
  layout.sectionTitle(title);
  const { doc } = layout;

  items.forEach((item) => {
    const lines = splitText(doc, item, CONTENT_WIDTH - 9);
    const height = lines.length * 4.2 + 4;
    layout.ensureSpace(height);
    doc.setFillColor(...BRAND_BLUE);
    doc.circle(MARGIN_X + 2, layout.y + 2.1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BODY_COLOR);
    doc.text(lines, MARGIN_X + 7, layout.y + 3.2, { lineHeightFactor: 1.35 });
    layout.y += height;
  });
  layout.y += 2;
}

function drawFooters(doc: jsPDF, projectName: string, generatedAt: string): void {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER_COLOR);
    doc.line(MARGIN_X, 285, PAGE_WIDTH - MARGIN_X, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(
      `${normalizePdfText(projectName)} | ${formatDate(generatedAt)}`,
      MARGIN_X,
      290,
      { maxWidth: 130 },
    );
    doc.text(`Página ${page} de ${pageCount}`, PAGE_WIDTH - MARGIN_X, 290, {
      align: "right",
    });
  }
}

/** Builds a real, paginated A4 PDF without triggering a browser download. */
export function buildExecutivePdf(input: ExecutivePdfInput): jsPDF {
  const doc = createDocument();
  const layout = new PdfLayout(doc, input.projectName);

  drawCoverHeader(layout, input);
  drawMetrics(layout, input.metrics);
  drawLines(layout, input.lines);
  drawComparisonSeries(layout, input.comparisonSeries);
  drawNarrativeSection(layout, "Recomendaciones", input.recommendations);
  drawNarrativeSection(layout, "Aclaraciones", input.clarifications);
  drawNarrativeSection(layout, "Puntos a tener en cuenta", input.considerations);
  drawFooters(doc, input.projectName, input.generatedAt);
  doc.setPage(1);
  return doc;
}

/** Creates a filesystem-safe `.pdf` name, preserving a caller-provided suffix. */
export function createExecutivePdfFileName(projectName: string): string {
  const safeName = normalizePdfText(projectName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `informe-ejecutivo-${safeName || "proyecto"}.pdf`;
}

/** Builds and downloads the PDF in the browser. Returns the downloaded name. */
export function downloadExecutivePdf(
  input: ExecutivePdfInput,
  fileName = createExecutivePdfFileName(input.projectName),
): string {
  const normalizedName = fileName.toLowerCase().endsWith(".pdf")
    ? fileName
    : `${fileName}.pdf`;
  buildExecutivePdf(input).save(normalizedName);
  return normalizedName;
}

