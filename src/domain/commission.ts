import Big from "big.js";
import { toBig } from "./money";

/**
 * КВ агента. Два режима ввода:
 * - ставка (is_manual = false): сумма КВ = комиссия × ставка / 100, сумма не отправляется;
 * - сумма (is_manual = true): ставка = сумма КВ / комиссия × 100, показывается расчётно.
 */
export function agentAmountFromRate(commission: string | null, rate: string | null): string | null {
  if (!commission || !rate) return null;
  return toBig(commission).times(toBig(rate)).div(100).round(2, Big.roundHalfUp).toFixed(2);
}

export function agentRateFromAmount(commission: string | null, amount: string | null): string | null {
  if (!commission || !amount) return null;
  const c = toBig(commission);
  if (c.eq(0)) return null;
  return toBig(amount).div(c).times(100).round(2, Big.roundHalfUp).toFixed(2);
}

export type CommissionFields = {
  bank_commission_amount?: string | null;
  agent_commission_rate?: string | null;
  agent_commission_amount?: string | null;
  agent_commission_is_manual: boolean;
};

/** Значения, которые видит пользователь (включая расчётное поле). */
export function displayedCommission(g: CommissionFields): { rate: string | null; amount: string | null } {
  if (g.agent_commission_is_manual) {
    return {
      rate: agentRateFromAmount(g.bank_commission_amount ?? null, g.agent_commission_amount ?? null),
      amount: g.agent_commission_amount ?? null,
    };
  }
  return {
    rate: g.agent_commission_rate ?? null,
    amount: agentAmountFromRate(g.bank_commission_amount ?? null, g.agent_commission_rate ?? null),
  };
}

/** Что уходит в API: расчётное поле не отправляется (открытый вопрос 8.4 — ставка при ручной сумме). */
export function commissionPayload(g: CommissionFields): Required<CommissionFields> {
  const full = {
    bank_commission_amount: g.bank_commission_amount ?? null,
    agent_commission_rate: g.agent_commission_rate ?? null,
    agent_commission_amount: g.agent_commission_amount ?? null,
    agent_commission_is_manual: g.agent_commission_is_manual,
  };
  return full.agent_commission_is_manual
    ? { ...full, agent_commission_rate: null }
    : { ...full, agent_commission_amount: null };
}

/** Сумма КВ гарантии для отчётов: из ответа API или расчётом. */
export function effectiveAgentAmount(g: CommissionFields): Big {
  return toBig(g.agent_commission_amount ?? displayedCommission(g).amount);
}
