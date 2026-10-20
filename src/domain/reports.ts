import Big from "big.js";
import { displayedCommission, effectiveAgentAmount } from "./commission";
import { type Period, formatDate, inPeriod } from "./dates";
import { toBig } from "./money";
import {
  type ApplicationDetail,
  type Guarantee,
  GUARANTEE_TYPE_LABELS,
  LAW_KIND_LABELS,
  lawKindOf,
} from "./types";

export type IssuanceRow = { app: ApplicationDetail; g: Guarantee };

/** В расчёт попадают только гарантии с банком и датой выдачи. */
export function issuanceRows(details: ApplicationDetail[]): IssuanceRow[] {
  return details.flatMap((app) =>
    app.guarantees.filter((g) => g.bank_id && g.issued_at).map((g) => ({ app, g })),
  );
}

export function rowsInPeriod(rows: IssuanceRow[], p: Period, bankId?: string): IssuanceRow[] {
  return rows.filter((r) => inPeriod(r.g.issued_at, p) && (!bankId || r.g.bank_id === bankId));
}

export type Totals = { count: number; amount: Big; commission: Big; agent: Big; withAgent: number };

export function totals(rows: IssuanceRow[]): Totals {
  return rows.reduce<Totals>(
    (t, { g }) => {
      const agent = effectiveAgentAmount(g);
      return {
        count: t.count + 1,
        amount: t.amount.plus(toBig(g.amount)),
        commission: t.commission.plus(toBig(g.bank_commission_amount)),
        agent: t.agent.plus(agent),
        withAgent: t.withAgent + (agent.gt(0) ? 1 : 0),
      };
    },
    { count: 0, amount: new Big(0), commission: new Big(0), agent: new Big(0), withAgent: 0 },
  );
}

export type BankTotal = Totals & { bankId: string };

export function totalsByBank(rows: IssuanceRow[]): BankTotal[] {
  const groups = new Map<string, IssuanceRow[]>();
  for (const r of rows) groups.set(r.g.bank_id, [...(groups.get(r.g.bank_id) ?? []), r]);
  return [...groups.entries()]
    .map(([bankId, list]) => ({ bankId, ...totals(list) }))
    .sort((a, b) => b.amount.cmp(a.amount));
}

const ref = (a: ApplicationDetail) => {
  const kind = lawKindOf(a);
  if (kind === "vat") return "—";
  if (kind === "commercial") return a.procurement?.contract_number || "—";
  return a.procurement?.registry_number || "—";
};

/** Колонки детализации (RH прототипа). */
export const REPORT_HEADER = [
  "Юрлицо/ИП",
  "ИНН",
  "Тип закупки",
  "Номер закупки / договор",
  "Ссылка ЕИС",
  "НМЦ",
  "Вид БГ",
  "Дата ОПЗ",
  "Сумма БГ",
  "Срок",
  "Банк",
  "Дата выдачи",
  "Комиссия клиента",
  "КВ %",
  "Сумма КВ",
];

export function reportLine(r: IssuanceRow, bankName: (id: string) => string): (string | number)[] {
  const a = r.app;
  const p = a.procurement;
  const shown = displayedCommission(r.g);
  const term =
    r.g.valid_from && r.g.valid_to ? `${formatDate(r.g.valid_from)} — ${formatDate(r.g.valid_to)}` : "—";
  return [
    a.client.name,
    a.client.inn,
    LAW_KIND_LABELS[lawKindOf(a)],
    ref(a),
    p?.placement_url ?? "—",
    p?.nmc ? toBig(p.nmc).toNumber() : "—",
    GUARANTEE_TYPE_LABELS[a.guarantee_type],
    p?.application_deadline ? formatDate(p.application_deadline) : "—",
    toBig(r.g.amount).toNumber(),
    term,
    bankName(r.g.bank_id),
    formatDate(r.g.issued_at),
    toBig(r.g.bank_commission_amount).toNumber(),
    toBig(shown.rate).toNumber(),
    effectiveAgentAmount(r.g).toNumber(),
  ];
}

export const RECON_HEADER = [
  "Клиент",
  "ИНН",
  "Закупка / договор",
  "Сумма БГ",
  "Комиссия",
  "КВ %",
  "Сумма КВ",
];

export function reconLine(r: IssuanceRow): (string | number)[] {
  return [
    r.app.client.name,
    r.app.client.inn,
    ref(r.app),
    toBig(r.g.amount).toNumber(),
    toBig(r.g.bank_commission_amount).toNumber(),
    toBig(displayedCommission(r.g).rate).toNumber(),
    effectiveAgentAmount(r.g).toNumber(),
  ];
}
