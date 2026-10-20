import { toast } from "@/shared/ui/Toast";

export type Cell = string | number | null | undefined;

/** Экспорт в Excel. SheetJS CE грузится лениво, только при экспорте. */
export async function exportXlsx(rows: Cell[][], fileName: string, sheetName = "Лист1") {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? "")));
    ws["!cols"] = (rows[0] ?? []).map((_, i) => ({
      wch: Math.min(48, Math.max(8, ...rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch {
    toast("Не удалось сформировать файл Excel.");
  }
}

export const toNumber = (v: string | null | undefined): number => (v ? Number(v) : 0);
