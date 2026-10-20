import { delay, readStub, stubId, updateStub } from "./storage";

/* ======================================================================
 * STUB Z-03 — комментарии по запросу в банк
 * Предлагаемый контракт:
 *   GET   /api/v1/workspaces/{ws}/bank-requests/{id}/comments → BankComment[]
 *   POST  /api/v1/workspaces/{ws}/bank-requests/{id}/comments {text} → BankComment
 *   PATCH /api/v1/workspaces/{ws}/comments/{id} {text} → BankComment
 * ==================================================================== */

export type BankComment = {
  id: string;
  applicationId: string;
  bankRequestId: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  editedAt?: string;
  editedByName?: string;
};

export type Author = { id: string; name: string };

// STUB Z-03
export function listComments(wsId: string, applicationId?: string): Promise<BankComment[]> {
  const all = readStub<BankComment[]>(wsId, "comments", []);
  return delay(applicationId ? all.filter((c) => c.applicationId === applicationId) : all);
}

// STUB Z-03
export function addComment(
  wsId: string,
  input: { applicationId: string; bankRequestId: string; text: string; author: Author },
): Promise<BankComment> {
  const comment: BankComment = {
    id: stubId("c"),
    applicationId: input.applicationId,
    bankRequestId: input.bankRequestId,
    text: input.text,
    authorId: input.author.id,
    authorName: input.author.name,
    createdAt: new Date().toISOString(),
  };
  updateStub<BankComment[]>(wsId, "comments", [], (list) => [...list, comment]);
  return delay(comment);
}

// STUB Z-03
export function editComment(wsId: string, id: string, text: string, editor: Author): Promise<void> {
  updateStub<BankComment[]>(wsId, "comments", [], (list) =>
    list.map((c) =>
      c.id === id ? { ...c, text, editedAt: new Date().toISOString(), editedByName: editor.name } : c,
    ),
  );
  return delay(undefined);
}

/* ======================================================================
 * STUB Z-09 / Z-10 — журнал изменений заявки и лента воркспейса
 *   GET /api/v1/workspaces/{ws}/applications/{id}/history → ActivityEntry[]
 *   GET /api/v1/workspaces/{ws}/activity?user_id=&limit= → ActivityEntry[]
 * На бэкенде журнал должен писаться сервером; пока его пишет клиент после успешных мутаций.
 * ==================================================================== */

export type ActivityEntry = {
  id: string;
  applicationId: string;
  appLabel: string;
  at: string;
  byId: string;
  byName: string;
  text: string;
};

// STUB Z-09
export function listApplicationHistory(wsId: string, applicationId: string): Promise<ActivityEntry[]> {
  return delay(
    readStub<ActivityEntry[]>(wsId, "activity", []).filter((e) => e.applicationId === applicationId),
  );
}

// STUB Z-10
export async function listActivity(
  wsId: string,
  opts: { userId?: string; limit?: number } = {},
): Promise<ActivityEntry[]> {
  const log = readStub<ActivityEntry[]>(wsId, "activity", []);
  // Комментарии тоже события ленты (как в прототипе: feedItems()).
  const comments = (await listComments(wsId)).map<ActivityEntry>((c) => ({
    id: "fc-" + c.id,
    applicationId: c.applicationId,
    appLabel: "",
    at: c.createdAt,
    byId: c.authorId,
    byName: c.authorName,
    text: `Комментарий: ${c.text.slice(0, 140)}`,
  }));
  return [...log, ...comments]
    .filter((e) => !opts.userId || e.byId === opts.userId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, opts.limit ?? 150);
}

// STUB Z-09
export function logActivity(wsId: string, entries: Omit<ActivityEntry, "id" | "at">[]): void {
  if (!entries.length) return;
  const at = new Date().toISOString();
  updateStub<ActivityEntry[]>(wsId, "activity", [], (list) =>
    [...list, ...entries.map((e) => ({ ...e, id: stubId("a"), at }))].slice(-2000),
  );
}

/* ======================================================================
 * STUB Z-11 — упоминания и уведомления
 *   GET  /api/v1/notifications → Notification[]
 *   POST /api/v1/notifications/{id}/read
 * ==================================================================== */

export type Notification = {
  id: string;
  toUserId: string;
  applicationId: string;
  appTitle: string;
  byName: string;
  text: string;
  at: string;
  read: boolean;
};

// STUB Z-11
export function listNotifications(wsId: string, userId: string): Promise<Notification[]> {
  return delay(
    readStub<Notification[]>(wsId, "notifications", [])
      .filter((n) => n.toUserId === userId)
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
}

// STUB Z-11
export function markNotificationRead(wsId: string, id: string): Promise<void> {
  updateStub<Notification[]>(wsId, "notifications", [], (l) =>
    l.map((n) => (n.id === id ? { ...n, read: true } : n)),
  );
  return delay(undefined);
}

/** Находит упоминания `@Имя` участников в тексте. */
export function findMentions<T extends { id: string; name: string }>(text: string, members: T[]): T[] {
  return members.filter((m) => m.name && text.includes("@" + m.name));
}

// STUB Z-11 — на бэкенде уведомления создаёт сервер при сохранении комментария.
export function notifyMentions(
  wsId: string,
  input: {
    text: string;
    recipients: { id: string }[];
    applicationId: string;
    appTitle: string;
    byName: string;
  },
): void {
  if (!input.recipients.length) return;
  const at = new Date().toISOString();
  updateStub<Notification[]>(wsId, "notifications", [], (list) => [
    ...list,
    ...input.recipients.map((r) => ({
      id: stubId("n"),
      toUserId: r.id,
      applicationId: input.applicationId,
      appTitle: input.appTitle,
      byName: input.byName,
      text: input.text.slice(0, 140),
      at,
      read: false,
    })),
  ]);
}
