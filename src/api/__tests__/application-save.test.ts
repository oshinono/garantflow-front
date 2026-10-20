import { HttpResponse, http } from "msw";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { detailToDraft, emptyDraft } from "@/domain/application-form";
import { resetDb, DEMO_EMAIL, DEMO_PASSWORD, getDb } from "@/mocks/db";
import { server } from "@/mocks/node";
import { login } from "../queries/auth";
import { fetchWorkspaces } from "../queries/workspaces";
import { saveApplication } from "../queries/application-save";
import { fetchApplication } from "../queries/applications";
import { tokens } from "../client";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => {
  server.close();
  tokens.clear("logout", false);
});
beforeEach(async () => {
  resetDb();
  await login(DEMO_EMAIL, DEMO_PASSWORD);
});

describe("сохранение заявки через API (MSW)", () => {
  it("создаёт заявку 44-ФЗ: клиент → закупка → заявка", async () => {
    const ws = (await fetchWorkspaces())[0]!;
    const draft = {
      ...emptyDraft(),
      law: "44_fz" as const,
      clientName: "ООО Новый",
      clientInn: "7707083893",
      requestedAmount: "100 000",
      registryNumber: "0001",
      deadlineDate: "2026-11-01",
    };
    const created = await saveApplication({ wsId: ws.id, draft, original: null, detail: null, progress: {} });
    expect(created.client.name).toBe("ООО Новый");
    expect(created.procurement?.registry_number).toBe("0001");
    expect(created.requested_amount).toBe("100000");
    expect(created.number).toBeTruthy();
  });

  it("создаёт НДС без закупки", async () => {
    const ws = (await fetchWorkspaces())[0]!;
    const draft = {
      ...emptyDraft(),
      law: "vat" as const,
      clientName: "ООО НДС",
      clientInn: "500100732259",
      requestedAmount: "5000",
    };
    const created = await saveApplication({ wsId: ws.id, draft, original: null, detail: null, progress: {} });
    expect(created.procurement).toBeNull();
    expect(created.guarantee_type).toBe("vat");
    expect(created.client.client_type).toBe("ip");
  });

  it("повтор после ошибки не создаёт дубль клиента", async () => {
    const ws = (await fetchWorkspaces())[0]!;
    const progress = {};
    const draft = {
      ...emptyDraft(),
      law: "44_fz" as const,
      clientName: "ООО Повтор",
      clientInn: "7707083893",
      requestedAmount: "100",
    };
    // Последний шаг падает один раз — клиент и закупка уже созданы.
    server.use(
      http.post(
        "*/api/v1/workspaces/:ws/applications",
        () => HttpResponse.json({ detail: "boom" }, { status: 500 }),
        { once: true },
      ),
    );
    await expect(
      saveApplication({ wsId: ws.id, draft, original: null, detail: null, progress }),
    ).rejects.toMatchObject({ status: 500 });
    const clientsBefore = getDb().clients.length;
    const procurementsBefore = getDb().procurements.length;
    await saveApplication({ wsId: ws.id, draft, original: null, detail: null, progress });
    expect(getDb().clients.length).toBe(clientsBefore);
    expect(getDb().procurements.length).toBe(procurementsBefore);
  });

  it("редактирование: PUT только изменённых сущностей целиком", async () => {
    const ws = (await fetchWorkspaces())[0]!;
    const draft = {
      ...emptyDraft(),
      law: "44_fz" as const,
      clientName: "ООО Правка",
      clientInn: "7707083893",
      requestedAmount: "100",
      registryNumber: "R1",
    };
    const created = await saveApplication({ wsId: ws.id, draft, original: null, detail: null, progress: {} });
    const detail = await fetchApplication(ws.id, created.id);
    const original = detailToDraft(detail);
    const updated = await saveApplication({
      wsId: ws.id,
      draft: { ...original, requestedAmount: "250", registryNumber: "R2" },
      original,
      detail,
      progress: {},
    });
    expect(updated.requested_amount).toBe("250");
    expect(updated.procurement?.registry_number).toBe("R2");
    expect(updated.number).toBe(created.number);
  });
});
