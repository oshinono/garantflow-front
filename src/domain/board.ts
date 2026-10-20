import { daysUntil } from "./dates";
import { toBig } from "./money";
import {
  type ApplicationView,
  type GuaranteeType,
  type LawKind,
  LAW_KINDS,
  applicationNumber,
  lawKindOf,
} from "./types";

export const NO_OWNER = "__none";

export type SortKey = "" | "deadline" | "amount" | "name" | "number";
export type SortDir = "asc" | "desc";

export type BoardFilters = {
  q: string;
  bank: string[];
  law: LawKind[];
  type: GuaranteeType[];
  owner: string[];
  mine: boolean;
  soon: boolean;
  sort: SortKey;
  dir: SortDir;
};

export const DEFAULT_FILTERS: BoardFilters = {
  q: "",
  bank: [],
  law: [],
  type: [],
  owner: [],
  mine: false,
  soon: false,
  sort: "",
  dir: "asc",
};

export const SORTS: { key: SortKey; label: string; asc?: string; desc?: string; dir?: SortDir }[] = [
  { key: "", label: "По умолчанию" },
  { key: "deadline", label: "Дата ОПЗ", asc: "Сначала ближайшие", desc: "Сначала дальние", dir: "asc" },
  { key: "amount", label: "Сумма БГ", asc: "По возрастанию", desc: "По убыванию", dir: "desc" },
  { key: "name", label: "Название", asc: "А → Я", desc: "Я → А", dir: "asc" },
  { key: "number", label: "Номер заявки", asc: "Сначала старые", desc: "Сначала новые", dir: "desc" },
];

/** Заявка доски: summary + данные заглушек, нужные для фильтров и поиска. */
export type BoardItem = ApplicationView & {
  /** Z-08: банк заведения */
  primaryBankId?: string | null;
  /** Z-03/Z-06: тексты комментариев и имена файлов для поиска */
  extraSearch?: string[];
};

export function hasActiveFilters(f: BoardFilters): boolean {
  return f.bank.length + f.law.length + f.type.length + f.owner.length > 0 || f.mine || f.soon;
}

export function matchesSearch(item: BoardItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    item.client_inn,
    item.customer_inn,
    item.client_name,
    item.customer_name,
    item.procurement_name,
    item.registry_number,
    item.contract_number,
    item.number,
    applicationNumber(item),
    ...(item.extraSearch ?? []),
  ];
  return hay.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export type FilterContext = { userId: string | null; now?: Date };

export function itemBankIds(item: BoardItem): string[] {
  const ids = (item.bank_statuses ?? []).map((b) => b.bank_id);
  if (item.primaryBankId) ids.push(item.primaryBankId);
  return ids;
}

export function matchesFilters(item: BoardItem, f: BoardFilters, ctx: FilterContext): boolean {
  if (f.bank.length) {
    const ids = itemBankIds(item);
    if (!f.bank.some((b) => ids.includes(b))) return false;
  }
  if (f.law.length && !f.law.includes(lawKindOf(item))) return false;
  if (f.type.length && !f.type.includes(item.guarantee_type)) return false;
  if (f.owner.length && !f.owner.includes(item.responsible_user_id ?? NO_OWNER)) return false;
  if (f.mine && (!ctx.userId || item.responsible_user_id !== ctx.userId)) return false;
  if (f.soon) {
    if (item.status !== "in_progress") return false;
    const days = daysUntil(item.application_deadline, ctx.now);
    if (days == null || days > 3) return false;
  }
  return true;
}

function sortValue(item: BoardItem, key: SortKey): string | number | null {
  switch (key) {
    case "deadline":
      return item.application_deadline ?? null;
    case "amount":
      return item.requested_amount != null ? toBig(item.requested_amount).toNumber() : null;
    case "name":
      return item.client_name?.trim().toLowerCase() || null;
    case "number": {
      const n = Number(item.number);
      return Number.isFinite(n) && item.number ? n : item.created_at;
    }
    default:
      return null;
  }
}

export function sortItems<T extends BoardItem>(items: T[], key: SortKey, dir: SortDir): T[] {
  if (!key) return items;
  const sign = dir === "desc" ? -1 : 1;
  return items.slice().sort((x, y) => {
    const a = sortValue(x, key);
    const b = sortValue(y, key);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
    return String(a).localeCompare(String(b), "ru") * sign;
  });
}

export function applyBoard<T extends BoardItem>(items: T[], f: BoardFilters, ctx: FilterContext): T[] {
  return sortItems(
    items.filter((i) => matchesSearch(i, f.q) && matchesFilters(i, f, ctx)),
    f.sort,
    f.dir,
  );
}

type Params = Record<string, string | undefined>;

const list = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);

/** Фильтры доски ↔ query-параметры URL. */
export function filtersFromParams(p: Params): BoardFilters {
  const sort = SORTS.some((s) => s.key === p.sort) ? (p.sort as SortKey) : "";
  return {
    q: p.q ?? "",
    bank: list(p.bank),
    law: list(p.law).filter((x): x is LawKind => (LAW_KINDS as string[]).includes(x)),
    type: list(p.type) as GuaranteeType[],
    owner: list(p.owner),
    mine: p.mine === "1",
    soon: p.soon === "1",
    sort,
    dir: p.dir === "desc" ? "desc" : "asc",
  };
}

export function filtersToParams(f: BoardFilters): Record<string, string | undefined> {
  const join = (a: string[]) => (a.length ? a.join(",") : undefined);
  return {
    q: f.q || undefined,
    bank: join(f.bank),
    law: join(f.law),
    type: join(f.type),
    owner: join(f.owner),
    mine: f.mine ? "1" : undefined,
    soon: f.soon ? "1" : undefined,
    sort: f.sort || undefined,
    dir: f.sort ? f.dir : undefined,
  };
}
