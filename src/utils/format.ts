const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatNumber(value: number, suffix = ""): string {
  const formatted = numberFormatter.format(Number.isFinite(value) ? value : 0);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function formatPercent(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatSignedCurrency(value: number): string {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? "+" : "−"}${formatCurrency(Math.abs(value))}`;
}

export function formatSignedNumber(value: number): string {
  if (Math.abs(value) < 0.005) return formatNumber(0);
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}`;
}

export function formatSourceDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}
