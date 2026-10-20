import { describe, expect, it } from "vitest";
import {
  type BoardItem,
  DEFAULT_FILTERS,
  NO_OWNER,
  applyBoard,
  filtersFromParams,
  filtersToParams,
  matchesSearch,
} from "../board";
import { deadlineTag } from "../dates";
import { transitionKind } from "../status";

const now = new Date("2026-10-19T10:00:00");
const base: BoardItem = {
  id: "00000000-0000-4000-8000-0000000000a1",
  workspace_id: "w",
  number: "1",
  status: "in_progress",
  guarantee_type: "participation",
  client_id: "c1",
  requested_amount: "50000",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  client_name: "ООО Ромашка",
  client_inn: "7701234567",
  law_type: "44_fz",
  registry_number: "0173200001425000123",
  application_deadline: "2026-10-20T20:59:00Z",
  responsible_user_id: "u1",
  bank_statuses: [{ bank_id: "b1", bank_name: "Банк А", state: "pending" }],
};
const items: BoardItem[] = [
  base,
  {
    ...base,
    id: "a2",
    number: "2",
    client_name: "ИП Иванов",
    client_inn: "772200111222",
    law_type: "commercial",
    guarantee_type: "advance",
    contract_number: "Д-15",
    registry_number: null,
    application_deadline: null,
    requested_amount: "1000000",
    responsible_user_id: null,
    status: "issued",
    bank_statuses: [],
    primaryBankId: "b2",
  },
  {
    ...base,
    id: "a3",
    number: "3",
    client_name: "ООО Вега",
    client_inn: "7703999888",
    law_type: null,
    guarantee_type: "vat",
    registry_number: null,
    application_deadline: null,
    requested_amount: "900000",
    status: "archived",
    extraSearch: ["Отказ: нет лимита"],
  },
];

describe("поиск доски", () => {
  it("ищет без учёта регистра по ИНН, клиенту, номерам и комментариям", () => {
    expect(matchesSearch(base, "7701")).toBe(true);
    expect(matchesSearch(base, "ромашка")).toBe(true);
    expect(matchesSearch(items[1]!, "д-15")).toBe(true);
    expect(matchesSearch(items[2]!, "лимита")).toBe(true);
    expect(matchesSearch(base, "нет такого")).toBe(false);
  });
});

describe("фильтры доски", () => {
  const ctx = { userId: "u1", now };
  it("фильтрует по типу закупки, включая НДС", () => {
    expect(applyBoard(items, { ...DEFAULT_FILTERS, law: ["vat"] }, ctx).map((i) => i.id)).toEqual(["a3"]);
  });
  it("фильтрует по банку (банк заведения или запрос)", () => {
    expect(applyBoard(items, { ...DEFAULT_FILTERS, bank: ["b2"] }, ctx).map((i) => i.id)).toEqual(["a2"]);
    expect(applyBoard(items, { ...DEFAULT_FILTERS, bank: ["b1"] }, ctx)).toHaveLength(2);
  });
  it("«Не назначен» и «Мои заявки»", () => {
    expect(applyBoard(items, { ...DEFAULT_FILTERS, owner: [NO_OWNER] }, ctx).map((i) => i.id)).toEqual([
      "a2",
    ]);
    expect(applyBoard(items, { ...DEFAULT_FILTERS, mine: true }, ctx)).toHaveLength(2);
  });
  it("«ОПЗ ≤ 3 дней» только для заявок в работе", () => {
    expect(applyBoard(items, { ...DEFAULT_FILTERS, soon: true }, ctx).map((i) => i.id)).toEqual([base.id]);
  });
  it("сортирует по сумме по убыванию", () => {
    expect(
      applyBoard(items, { ...DEFAULT_FILTERS, sort: "amount", dir: "desc" }, ctx).map((i) => i.number),
    ).toEqual(["2", "3", "1"]);
  });
  it("синхронизируется с query-параметрами", () => {
    const f = {
      ...DEFAULT_FILTERS,
      q: "ромашка",
      law: ["44_fz", "vat"] as const,
      mine: true,
      sort: "deadline" as const,
      dir: "desc" as const,
    };
    const params = filtersToParams({ ...f, law: [...f.law] });
    expect(params).toMatchObject({ q: "ромашка", law: "44_fz,vat", mine: "1", sort: "deadline", dir: "desc" });
    expect(filtersFromParams(params as Record<string, string>)).toEqual({ ...f, law: ["44_fz", "vat"] });
  });
});

describe("метка ОПЗ", () => {
  it("красная для просрочки и жёлтая для ≤ 3 дней", () => {
    expect(deadlineTag(-2)).toEqual({ tone: "red", text: "просрочена 2 дн." });
    expect(deadlineTag(0)).toEqual({ tone: "amber", text: "сегодня" });
    expect(deadlineTag(3)).toEqual({ tone: "amber", text: "через 3 дн." });
    expect(deadlineTag(4)).toBeNull();
  });
});

describe("переходы статусов", () => {
  it("соответствуют API", () => {
    expect(transitionKind("in_progress", "archived")).toBe("archive");
    expect(transitionKind("archived", "in_progress")).toBe("reopen");
    expect(transitionKind("in_progress", "issued")).toBe("issue");
    expect(transitionKind("issued", "in_progress")).toBe("forbidden");
    expect(transitionKind("issued", "archived")).toBe("forbidden");
    expect(transitionKind("archived", "issued")).toBe("forbidden");
    expect(transitionKind("issued", "issued")).toBe("same");
  });
});
