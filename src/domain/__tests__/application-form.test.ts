import { describe, expect, it } from "vitest";
import {
  detailToDraft,
  diffDrafts,
  emptyDraft,
  findDuplicate,
  toApplicationPayload,
  toClientPayload,
  toProcurementPayload,
  validateDraft,
} from "../application-form";
import type { ApplicationDetail, ApplicationSummary } from "../types";

const draft44 = {
  ...emptyDraft("u1"),
  law: "44_fz" as const,
  clientName: " ООО Ромашка ",
  clientInn: "7707083893",
  requestedAmount: "50 000",
  registryNumber: "0173200001425000123",
  placementUrl: "https://zakupki.gov.ru/",
  nmc: "5 000 000",
  deadlineDate: "2026-10-20",
  deadlineTime: "23:59",
};

describe("форма заявки → API", () => {
  it("раскладывает 44-ФЗ на клиента, закупку и заявку", () => {
    expect(toClientPayload(draft44)).toEqual({
      name: "ООО Ромашка",
      inn: "7707083893",
      client_type: "company",
    });
    const p = toProcurementPayload(draft44, "c1")!;
    expect(p).toMatchObject({
      client_id: "c1",
      law_type: "44_fz",
      registry_number: "0173200001425000123",
      nmc: "5000000",
    });
    expect(p.application_deadline).toMatch(/^2026-10-20T23:59:00[+-]\d\d:\d\d$/);
    expect(toApplicationPayload(draft44, "c1", "p1")).toMatchObject({
      procurement_id: "p1",
      guarantee_type: "participation",
      requested_amount: "50000",
      beneficiary_name: null,
      responsible_user_id: "u1",
    });
  });

  it("НДС — без закупки, с бенефициаром ФНС", () => {
    const d = { ...draft44, law: "vat" as const };
    expect(toProcurementPayload(d, "c1")).toBeNull();
    expect(toApplicationPayload(d, "c1", "p1")).toMatchObject({
      procurement_id: null,
      guarantee_type: "vat",
      beneficiary_name: "ФНС",
    });
  });

  it("коммерческая — заказчик и договор", () => {
    const d = {
      ...draft44,
      law: "commercial" as const,
      customerName: "ООО Заказчик",
      contractNumber: "Д-15",
      contractDate: "2026-10-01",
    };
    expect(toProcurementPayload(d, "c1")).toMatchObject({
      law_type: "commercial",
      customer_name: "ООО Заказчик",
      contract_number: "Д-15",
      contract_date: "2026-10-01",
      registry_number: null,
    });
  });

  it("валидирует обязательные поля и форматы", () => {
    const errs = validateDraft({
      ...emptyDraft(),
      clientInn: "123",
      nmc: "abc",
      placementUrl: "javascript:alert(1)",
    });
    expect(errs.clientName).toBeTruthy();
    expect(errs.clientInn).toBeTruthy();
    expect(errs.requestedAmount).toBeTruthy();
    expect(errs.nmc).toBeTruthy();
    expect(errs.placementUrl).toBeTruthy();
    expect(validateDraft(draft44)).toEqual({});
  });

  it("находит возможный дубль по ИНН и реестровому номеру", () => {
    const list = [
      { id: "x", client_inn: "7707083893", registry_number: "0173200001425000123" } as ApplicationSummary,
    ];
    expect(findDuplicate(draft44, list, null)?.id).toBe("x");
    expect(findDuplicate(draft44, list, "x")).toBeNull();
  });

  it("журнал «было → стало»", () => {
    const changes = diffDrafts(draft44, { ...draft44, requestedAmount: "60 000", responsibleUserId: "" });
    expect(changes.map((c) => [c.label, c.from, c.to])).toEqual([
      ["Сумма БГ", "50 000", "60 000"],
      ["Ответственный", "u1", "—"],
    ]);
  });

  it("детальный ответ → форма", () => {
    const detail = {
      id: "a1",
      guarantee_type: "vat",
      requested_amount: "900000",
      client_id: "c1",
      client: { id: "c1", name: "ООО Вега", inn: "7703999888" },
      procurement: null,
      beneficiary_name: null,
      responsible_user_id: null,
    } as unknown as ApplicationDetail;
    expect(detailToDraft(detail, "b1")).toMatchObject({
      law: "vat",
      clientId: "c1",
      beneficiaryName: "ФНС",
      primaryBankId: "b1",
    });
  });
});
