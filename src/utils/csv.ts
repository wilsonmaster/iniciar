export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  const contents = rows
    .map((row) =>
      row
        .map((value) => {
          const normalized = String(value ?? "");
          return `"${normalized.replaceAll('"', '""')}"`;
        })
        .join(";"),
    )
    .join("\n");

  const blob = new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
