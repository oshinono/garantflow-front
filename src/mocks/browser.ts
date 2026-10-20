import { setupWorker } from "msw/browser";
import { writeStub } from "@/api/stubs/storage";
import { getDb, lastSeedStubs } from "./db";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/** Поднимает мок-бэкенд и при первом запуске раскладывает демо-данные заглушек. */
export async function startMockBackend() {
  getDb();
  const seed = lastSeedStubs;
  if (seed) {
    writeStub(seed.wsId, "comments", seed.comments);
    writeStub(seed.wsId, "primary-bank", seed.primaryBanks);
    writeStub(seed.wsId, "offers", seed.offers);
    writeStub(seed.wsId, "bank-info", seed.bankInfo);
    // Демо-упоминание (Z-11) для демо-пользователя.
    const db = getDb();
    const demo = db.users[0];
    const mention = seed.comments.find((c) => c.text.includes("@Демо-пользователь"));
    const app = mention && db.applications.find((a) => a.id === mention.applicationId);
    const client = app && db.clients.find((c) => c.id === app.client_id);
    if (demo && mention && app)
      writeStub(seed.wsId, "notifications", [
        {
          id: "seed-n1",
          toUserId: demo.id,
          applicationId: app.id,
          appTitle: `№ ${app.number} · ${client?.name ?? ""}`,
          byName: mention.authorName,
          text: mention.text,
          at: mention.createdAt,
          read: false,
        },
      ]);
  }
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

/** Сброс демо-данных (кнопка в dev-подсказке на экране входа). */
export function resetMockData() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("mock:") || key.startsWith("stub:") || key === "gf:refresh")
      localStorage.removeItem(key);
  }
  location.reload();
}
