import { describe, expect, it } from "vitest";
import {
  agentAmountFromRate,
  agentRateFromAmount,
  commissionPayload,
  displayedCommission,
  effectiveAgentAmount,
} from "../commission";
import { formatMoney, formatMoneyInput, parseMoney, sumMoney } from "../money";

describe("деньги", () => {
  it("принимает пробелы, запятую и знак рубля", () => {
    expect(parseMoney("1 500 000,50")).toBe("1500000.50");
    expect(parseMoney("1 500 000,5")).toBe("1500000.50");
    expect(parseMoney("1\u00a0000 ₽")).toBe("1000");
    expect(parseMoney("12.345")).toBeUndefined();
    expect(parseMoney("abc")).toBeUndefined();
    expect(parseMoney("")).toBeNull();
  });

  it("форматирует с разделителями разрядов", () => {
    expect(formatMoney("1500000.5").replace(/\s/g, " ")).toBe("1 500 000,5 ₽");
    expect(formatMoneyInput("1500000.5")).toBe("1\u00a0500\u00a0000,5");
  });

  it("складывает без ошибок float", () => {
    expect(sumMoney(["0.1", "0.2"]).toString()).toBe("0.3");
  });
});

describe("КВ агента", () => {
  it("ставка → сумма: комиссия × ставка / 100", () => {
    expect(agentAmountFromRate("1200", "25")).toBe("300.00");
    expect(agentAmountFromRate("17000", "22.5")).toBe("3825.00");
    expect(agentAmountFromRate("333.33", "33.33")).toBe("111.10");
    expect(agentAmountFromRate(null, "25")).toBeNull();
  });

  it("сумма → ставка: сумма КВ / комиссия", () => {
    expect(agentRateFromAmount("12000", "3600")).toBe("30.00");
    expect(agentRateFromAmount("0", "100")).toBeNull();
  });

  it("показывает расчётное поле в обоих режимах", () => {
    expect(
      displayedCommission({
        bank_commission_amount: "1200",
        agent_commission_rate: "25",
        agent_commission_is_manual: false,
      }),
    ).toEqual({
      rate: "25",
      amount: "300.00",
    });
    expect(
      displayedCommission({
        bank_commission_amount: "1200",
        agent_commission_amount: "600",
        agent_commission_is_manual: true,
      }),
    ).toEqual({ rate: "50.00", amount: "600" });
  });

  it("не отправляет расчётное поле", () => {
    expect(
      commissionPayload({
        bank_commission_amount: "1200",
        agent_commission_rate: "25",
        agent_commission_amount: "300",
        agent_commission_is_manual: false,
      }).agent_commission_amount,
    ).toBeNull();
    expect(
      commissionPayload({
        bank_commission_amount: "1200",
        agent_commission_rate: "25",
        agent_commission_amount: "300",
        agent_commission_is_manual: true,
      }).agent_commission_rate,
    ).toBeNull();
  });

  it("для отчётов берёт сумму из ответа API, иначе считает", () => {
    expect(
      effectiveAgentAmount({
        bank_commission_amount: "1000",
        agent_commission_rate: "10",
        agent_commission_amount: "99",
        agent_commission_is_manual: false,
      }).toString(),
    ).toBe("99");
    expect(
      effectiveAgentAmount({
        bank_commission_amount: "1000",
        agent_commission_rate: "10",
        agent_commission_is_manual: false,
      }).toString(),
    ).toBe("100");
  });
});
