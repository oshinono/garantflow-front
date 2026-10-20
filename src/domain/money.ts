import Big from "big.js";

Big.DP = 10;
Big.RM = Big.roundHalfUp;

/**
 * Нормализует ввод денег: допускает пробелы (в т.ч. неразрывные), запятую, «₽».
 * Возвращает decimal-строку с не более чем 2 знаками, `null` для пустого ввода
 * и `undefined` для некорректного.
 */
export function parseMoney(input: string | null | undefined): string | null | undefined {
  if (input == null) return null;
  const cleaned = String(input)
    .replace(/[\s\u00a0\u202f\u20bd]/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined;
  return new Big(cleaned).toFixed(2).replace(/\.00$/, "");
}

export function toBig(value: string | number | null | undefined): Big {
  if (value == null || value === "") return new Big(0);
  try {
    return new Big(value);
  } catch {
    return new Big(0);
  }
}

const moneyFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatNumber(value: string | number | Big | null | undefined): string {
  if (value == null || value === "") return "0";
  const n = value instanceof Big ? value.toNumber() : Number(value);
  return Number.isFinite(n) ? moneyFormatter.format(n) : "0";
}

export function formatMoney(value: string | number | Big | null | undefined): string {
  return formatNumber(value) + " ₽";
}

/** Форматирование для поля ввода: разделители разрядов без «₽». */
export function formatMoneyInput(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const [int = "0", frac] = value.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return frac ? `${grouped},${frac}` : grouped;
}

export function sumMoney(values: (string | null | undefined)[]): Big {
  return values.reduce<Big>((acc, v) => acc.plus(toBig(v)), new Big(0));
}
