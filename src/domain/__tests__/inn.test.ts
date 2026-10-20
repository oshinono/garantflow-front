import { describe, expect, it } from "vitest";
import { clientTypeByInn, innProblem, isInnChecksumValid } from "../inn";

describe("ИНН", () => {
  it("проверяет контрольную сумму 10-значного ИНН", () => {
    expect(isInnChecksumValid("7707083893")).toBe(true);
    expect(isInnChecksumValid("7707083894")).toBe(false);
  });

  it("проверяет контрольную сумму 12-значного ИНН", () => {
    expect(isInnChecksumValid("500100732259")).toBe(true);
    expect(isInnChecksumValid("500100732258")).toBe(false);
  });

  it("различает ошибку формата и контрольной суммы", () => {
    expect(innProblem("")).toBeNull();
    expect(innProblem("123")?.kind).toBe("format");
    expect(innProblem("77070838ab")?.kind).toBe("format");
    expect(innProblem("7707083894")?.kind).toBe("checksum");
    expect(innProblem(" 7707083893 ")).toBeNull();
  });

  it("определяет тип клиента по длине", () => {
    expect(clientTypeByInn("7707083893")).toBe("company");
    expect(clientTypeByInn("500100732259")).toBe("ip");
  });
});
