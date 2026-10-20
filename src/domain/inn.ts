import type { ClientType } from "./types";

const W10 = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const W11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const W12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function checkDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((acc, w, i) => acc + w * (digits[i] ?? 0), 0);
  return (sum % 11) % 10;
}

export function isInnFormat(value: string): boolean {
  return /^(\d{10}|\d{12})$/.test(value);
}

/** Проверка контрольной суммы ИНН юрлица (10 цифр) или ИП/физлица (12 цифр). */
export function isInnChecksumValid(value: string): boolean {
  if (!isInnFormat(value)) return false;
  const d = [...value].map(Number);
  if (d.length === 10) return checkDigit(d, W10) === d[9];
  return checkDigit(d, W11) === d[10] && checkDigit(d, W12) === d[11];
}

export function clientTypeByInn(value: string): ClientType {
  return value.length === 12 ? "ip" : "company";
}

export type InnProblem = { kind: "format" | "checksum"; message: string };

export function innProblem(raw: string): InnProblem | null {
  const value = raw.trim();
  if (!value) return null;
  if (!isInnFormat(value)) return { kind: "format", message: "ИНН должен содержать 10 или 12 цифр" };
  if (!isInnChecksumValid(value))
    return { kind: "checksum", message: "ИНН не проходит проверку контрольной суммы" };
  return null;
}
