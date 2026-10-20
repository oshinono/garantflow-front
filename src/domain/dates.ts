import { differenceInCalendarDays, format, formatISO, isValid, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** ДД.ММ.ГГГГ */
export function formatDate(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? format(d, "dd.MM.yyyy") : "—";
}

/** 12 окт. 2026, 09:25 */
export function formatStamp(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? format(d, "d MMM yyyy, HH:mm", { locale: ru }) : "Дата не указана";
}

export function formatDayLong(value: string): string {
  const d = parseDate(value);
  return d ? format(d, "d MMMM yyyy", { locale: ru }) : "";
}

export function formatTime(value: string): string {
  const d = parseDate(value);
  return d ? format(d, "HH:mm") : "";
}

/** yyyy-MM-dd в локальной зоне. */
export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Дата и время из полей формы → ISO 8601 с часовым поясом пользователя. */
export function toZonedIso(date: string, time = "23:59"): string | null {
  if (!date) return null;
  const d = parseISO(`${date}T${time || "23:59"}`);
  return isValid(d) ? formatISO(d) : null;
}

/** ISO datetime → поля формы (локальное время). */
export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  const d = parseDate(value);
  if (!d) return { date: "", time: "23:59" };
  return { date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") };
}

/** Сколько календарных дней до ОПЗ (отрицательное — просрочено). */
export function daysUntil(deadline: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseDate(deadline);
  return d ? differenceInCalendarDays(d, now) : null;
}

export type DeadlineTag = { tone: "red" | "amber"; text: string } | null;

/** Метка ОПЗ на карточке: только для заявок «В работе». */
export function deadlineTag(days: number | null): DeadlineTag {
  if (days == null) return null;
  if (days < 0) return { tone: "red", text: `просрочена ${-days} дн.` };
  if (days <= 3) return { tone: "amber", text: days === 0 ? "сегодня" : `через ${days} дн.` };
  return null;
}

export function periodDays(from: string, to: string): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  return differenceInCalendarDays(b, a) + 1;
}

export type Period = { from: string; to: string };

export function presetPeriod(kind: "today" | "month" | "previous" | "year", now = new Date()): Period {
  const today = isoDate(now);
  switch (kind) {
    case "today":
      return { from: today, to: today };
    case "month":
      return { from: today.slice(0, 7) + "-01", to: today };
    case "previous": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: isoDate(start), to: isoDate(end) };
    }
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
}

export function inPeriod(date: string | null | undefined, p: Period): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  return (!p.from || d >= p.from) && (!p.to || d <= p.to);
}
