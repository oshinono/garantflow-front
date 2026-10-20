import { http, HttpResponse, type HttpHandler } from "msw";
import type { components } from "@/api/schema";
import { type Db, type DbApplication, type DbUser, getDb, nowIso, saveDb, uuid } from "./db";

type S = components["schemas"];

/**
 * Мок-бэкенд по предварительному контракту (openapi/provisional.yaml).
 * Один набор обработчиков для unit-, e2e-тестов и демо-режима (VITE_API_MOCK).
 */

const P = (path: string) => `*${path}`;
const ACCESS_TTL_SEC = Number(globalThis.localStorage?.getItem("mock:access-ttl") ?? 1800);

const err = (status: number, code: string, detail?: string, headers?: Record<string, string>) =>
  HttpResponse.json({ code, detail: detail ?? code }, { status, headers });

const json = <T>(data: T, status = 200) => HttpResponse.json(data as never, { status });
const noContent = () => new HttpResponse(null, { status: 204 });

function commit<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const out = fn(db);
  saveDb();
  return out;
}

function currentUser(request: Request): DbUser | null {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const db = getDb();
  const rec = db.accessTokens.find((t) => t.token === token);
  if (!rec || rec.exp < Date.now()) return null;
  return db.users.find((u) => u.id === rec.userId) ?? null;
}

type Ctx = { db: Db; user: DbUser; role: S["MemberRole"]; wsId: string };

function withAuth(
  request: Request,
  fn: (db: Db, user: DbUser) => Response | Promise<Response>,
): Response | Promise<Response> {
  const user = currentUser(request);
  if (!user) return err(401, "not_authenticated", "Not authenticated");
  return fn(getDb(), user);
}

function withWorkspace(
  request: Request,
  wsId: string,
  fn: (ctx: Ctx) => Response | Promise<Response>,
): Response | Promise<Response> {
  return withAuth(request, (db, user) => {
    const m = db.members.find((x) => x.workspace_id === wsId && x.user_id === user.id);
    if (!m) return err(404, "workspace_not_found");
    return fn({ db, user, role: m.role, wsId });
  });
}

const isAdmin = (role: S["MemberRole"]) => role === "OWNER" || role === "ADMIN";

function issueTokens(db: Db, userId: string): S["TokenResponse"] {
  const access = "acc_" + uuid();
  const refresh = "ref_" + uuid();
  db.accessTokens = db.accessTokens.filter((t) => t.exp > Date.now());
  db.accessTokens.push({ token: access, userId, exp: Date.now() + ACCESS_TTL_SEC * 1000 });
  db.refreshTokens.push({ token: refresh, userId });
  return { access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: ACCESS_TTL_SEC };
}

function sendMail(db: Db, to: string, subject: string, link: string) {
  db.mailbox.push({ to, subject, link, at: nowIso() });
  console.info(`[mock mail] ${to}: ${subject} → ${link}`);
}

function bankState(db: Db, br: S["BankRequestResponse"]): S["BankRequestState"] {
  if (db.guarantees.some((g) => g.bank_request_id === br.id)) return "issued";
  if (br.offer_received === true) return "approved";
  if (br.offer_received === false) return "rejected";
  if (br.sent_at) return "pending";
  return "draft";
}

/** Z-02/Z-16: расширенные поля, которых нет в контракте API — мок добавляет их для UI. */
type AppSummary = S["ApplicationSummaryResponse"] & {
  client_name: string;
  client_inn: string | null;
  law_type: S["ProcurementLawType"] | null;
  registry_number: string | null;
  contract_number: string | null;
  customer_name: string | null;
  customer_inn: string | null;
  application_deadline: string | null;
  bank_statuses: (S["BankStatusSummary"] & { bank_name: string })[];
  issued_amount: string | null;
};

type AppDetail = AppSummary &
  Omit<S["ApplicationResponse"], "guarantees"> & {
    client: Db["clients"][number];
    procurement: S["ProcurementResponse"] | null;
    guarantees: Db["guarantees"];
  };

function summary(db: Db, a: DbApplication): AppSummary {
  const client = db.clients.find((c) => c.id === a.client_id);
  const p = a.procurement_id ? db.procurements.find((x) => x.id === a.procurement_id) : undefined;
  const reqs = db.bankRequests.filter((b) => b.application_id === a.id);
  const gs = db.guarantees.filter((g) => g.application_id === a.id);
  return {
    id: a.id,
    workspace_id: a.workspace_id,
    number: a.number ?? null,
    status: a.status,
    guarantee_type: a.guarantee_type,
    client_id: a.client_id,
    procurement_id: a.procurement_id ?? null,
    requested_amount: a.requested_amount,
    responsible_user_id: a.responsible_user_id ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at,
    // Z-02
    client_name: client?.name ?? "",
    client_inn: client?.inn ?? "",
    law_type: p?.law_type ?? null,
    registry_number: p?.registry_number ?? null,
    contract_number: p?.contract_number ?? null,
    customer_name: p?.customer_name ?? null,
    customer_inn: p?.customer_inn ?? null,
    application_deadline: p?.application_deadline ?? null,
    bank_statuses: reqs.map((r) => ({
      bank_id: r.bank_id,
      bank_name: db.banks.find((b) => b.id === r.bank_id)?.name ?? "—",
      state: bankState(db, r),
    })),
    issued_amount: gs.length ? gs.reduce((s, g) => s + Number(g.amount), 0).toFixed(2) : null,
  };
}

function detail(db: Db, a: DbApplication): AppDetail {
  const client = db.clients.find((c) => c.id === a.client_id)!;
  return {
    ...summary(db, a),
    beneficiary_name: a.beneficiary_name ?? null,
    beneficiary_inn: a.beneficiary_inn ?? null,
    requested_valid_from: a.requested_valid_from ?? null,
    requested_valid_to: a.requested_valid_to ?? null,
    description: a.description ?? null,
    created_by_user_id: a.created_by_user_id,
    client,
    procurement: a.procurement_id ? (db.procurements.find((p) => p.id === a.procurement_id) ?? null) : null,
    bank_requests: db.bankRequests.filter((b) => b.application_id === a.id),
    guarantees: db.guarantees.filter((g) => g.application_id === a.id),
    status_history: a.status_history,
    archive_reason: a.archive_reason,
    client_obtained_independently: a.client_obtained_independently,
  };
}

function findApp(ctx: Ctx, id: string): DbApplication | undefined {
  return ctx.db.applications.find((a) => a.id === id && a.workspace_id === ctx.wsId);
}

function setStatus(a: DbApplication, to: S["ApplicationStatus"], by: string, comment: string | null = null) {
  a.status_history.push({
    from_status: a.status,
    to_status: to,
    changed_at: nowIso(),
    changed_by_user_id: by,
    comment,
  });
  a.status = to;
  a.updated_at = nowIso();
}

function validateMoney(v: unknown): boolean {
  return v == null || (typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v));
}

function validationError(loc: string[], msg: string) {
  return HttpResponse.json(
    { detail: [{ loc: ["body", ...loc], msg, type: "value_error" }] },
    { status: 422 },
  );
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export const handlers: HttpHandler[] = [
  http.get(P("/health"), () => json({ status: "ok" })),

  /* ------------------------------------------------------------- auth */
  http.post(P("/api/v1/auth/login"), async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const email = (form.get("username") ?? "").trim().toLowerCase();
    const password = form.get("password") ?? "";
    return commit((db) => {
      const recent = (db.loginFailures[email] ?? []).filter((t) => t > Date.now() - 900_000);
      if (recent.length >= 5) {
        const retry = Math.ceil((recent[0]! + 900_000 - Date.now()) / 1000);
        return err(429, "too_many_login_attempts", "Too many attempts", { "Retry-After": String(retry) });
      }
      const user = db.users.find((u) => u.email === email);
      if (!user || user.password !== password) {
        db.loginFailures[email] = [...recent, Date.now()];
        return err(401, "invalid_credentials");
      }
      if (!user.email_verified) return err(403, "email_not_verified");
      db.loginFailures[email] = [];
      return json(issueTokens(db, user.id));
    });
  }),
  http.post(P("/api/v1/auth/refresh"), async ({ request }) => {
    const { refresh_token } = await body<S["RefreshRequest"]>(request);
    return commit((db) => {
      const rec = db.refreshTokens.find((t) => t.token === refresh_token);
      if (!rec) return err(401, "invalid_refresh_token");
      db.refreshTokens = db.refreshTokens.filter((t) => t !== rec);
      return json(issueTokens(db, rec.userId));
    });
  }),
  http.post(P("/api/v1/auth/logout"), async ({ request }) => {
    const { refresh_token } = await body<S["RefreshRequest"]>(request);
    const header = request.headers.get("Authorization")?.slice(7);
    return commit((db) => {
      db.refreshTokens = db.refreshTokens.filter((t) => t.token !== refresh_token);
      db.accessTokens = db.accessTokens.filter((t) => t.token !== header);
      return noContent();
    });
  }),
  http.post(P("/api/v1/auth/verify-email"), async ({ request }) => {
    const { token } = await body<S["VerifyEmailRequest"]>(request);
    return commit((db) => {
      const rec = db.verifyTokens.find((t) => t.token === token);
      const user = rec && db.users.find((u) => u.id === rec.userId);
      if (!user) return err(400, "invalid_email_verification_token");
      user.email_verified = true;
      db.verifyTokens = db.verifyTokens.filter((t) => t !== rec);
      return noContent();
    });
  }),
  http.post(P("/api/v1/auth/verify-email/resend"), async ({ request }) => {
    const { email } = await body<S["ResendVerificationRequest"]>(request);
    commit((db) => {
      const user = db.users.find((u) => u.email === email?.trim().toLowerCase());
      if (user && !user.email_verified) {
        const token = uuid();
        db.verifyTokens.push({ token, userId: user.id });
        sendMail(db, user.email, "Подтвердите адрес почты", `/verify-email?token=${token}`);
      }
    });
    return new HttpResponse(null, { status: 202 });
  }),

  /* ------------------------------------------------------------- users */
  http.post(P("/api/v1/users"), async ({ request }) => {
    const b = await body<S["RegisterUserRequest"]>(request);
    const email = (b.email ?? "").trim().toLowerCase();
    if (!b.full_name?.trim()) return validationError(["full_name"], "Field required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return validationError(["email"], "value is not a valid email address");
    if (!b.password || b.password.length < 8)
      return validationError(["password"], "String should have at least 8 characters");
    return commit((db) => {
      if (db.users.some((u) => u.email === email)) return err(409, "email_already_registered");
      const inv = b.invitation_token ? db.invitations.find((i) => i.token === b.invitation_token) : undefined;
      const user: DbUser = {
        id: uuid(),
        full_name: b.full_name.trim(),
        email,
        is_active: true,
        email_verified: !!inv && inv.email === email,
        password: b.password,
      };
      db.users.push(user);
      if (!user.email_verified) {
        const token = uuid();
        db.verifyTokens.push({ token, userId: user.id });
        sendMail(db, email, "Подтвердите адрес почты", `/verify-email?token=${token}`);
      }
      return json({ id: user.id }, 201);
    });
  }),
  http.get(P("/api/v1/users/me"), ({ request }) =>
    withAuth(request, (_db, user) => {
      const { password: _p, ...pub } = user;
      return json(pub);
    }),
  ),
  http.get(P("/api/v1/users/:userId"), ({ request, params }) =>
    withAuth(request, (db) => {
      const u = db.users.find((x) => x.id === params.userId);
      if (!u) return err(404, "user_not_found");
      const { password: _p, ...pub } = u;
      return json(pub);
    }),
  ),

  /* -------------------------------------------------------- workspaces */
  http.get(P("/api/v1/workspaces"), ({ request }) =>
    withAuth(request, (db, user) =>
      json(
        db.members
          .filter((m) => m.user_id === user.id)
          .map((m) => {
            const w = db.workspaces.find((x) => x.id === m.workspace_id)!;
            return { id: w.id, name: w.name, role: m.role };
          }),
      ),
    ),
  ),
  http.post(P("/api/v1/workspaces"), async ({ request }) => {
    const b = await body<S["CreateWorkspaceRequest"]>(request);
    return withAuth(request, (db, user) => {
      if (!b.name?.trim()) return validationError(["name"], "Field required");
      const ws = { id: uuid(), name: b.name.trim(), owner_id: user.id, created_at: nowIso() };
      db.workspaces.push(ws);
      db.members.push({ user_id: user.id, workspace_id: ws.id, role: "OWNER", joined_at: nowIso() });
      saveDb();
      return json({ id: ws.id }, 201);
    });
  }),
  http.get(P("/api/v1/workspaces/:ws"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const w = db.workspaces.find((x) => x.id === wsId)!;
      return json({
        id: w.id,
        name: w.name,
        owner_id: w.owner_id,
        members: db.members
          .filter((m) => m.workspace_id === wsId)
          .map((m) => ({ user_id: m.user_id, role: m.role })),
      });
    }),
  ),
  http.patch(P("/api/v1/workspaces/:ws/members/:userId"), async ({ request, params }) => {
    const b = await body<S["ChangeMemberRoleRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (role !== "OWNER") return err(403, "permission_denied");
      const m = db.members.find((x) => x.workspace_id === wsId && x.user_id === params.userId);
      if (!m) return err(404, "member_not_found");
      if (m.role === "OWNER" || b.role === "OWNER") return err(409, "cannot_change_owner_role");
      m.role = b.role;
      saveDb();
      return json(m);
    });
  }),
  http.delete(P("/api/v1/workspaces/:ws/members/:userId"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const m = db.members.find((x) => x.workspace_id === wsId && x.user_id === params.userId);
      if (!m) return err(404, "member_not_found");
      if (m.role === "OWNER") return err(409, "cannot_remove_owner");
      db.members = db.members.filter((x) => x !== m);
      saveDb();
      return noContent();
    }),
  ),
  http.get(P("/api/v1/workspaces/:ws/invitations"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId, role }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      return json(
        db.invitations
          .filter((i) => i.workspace_id === wsId && !i.accepted_at)
          .map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            invited_by: db.members.find((m) => m.workspace_id === wsId && m.role === "OWNER")?.user_id ?? null,
            created_at: i.created_at,
            expires_at: i.expires_at,
            is_expired: new Date(i.expires_at) < new Date(),
          })),
      );
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/invitations"), async ({ request, params }) => {
    const b = await body<S["CreateInvitationRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId, role, user }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const email = (b.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return validationError(["email"], "value is not a valid email address");
      if (b.role === "OWNER") return validationError(["role"], "Owner cannot be invited");      const existing = db.users.find((u) => u.email === email);
      if (existing && db.members.some((m) => m.workspace_id === wsId && m.user_id === existing.id))
        return err(409, "member_already_exists");
      if (
        db.invitations.some(
          (i) =>
            i.workspace_id === wsId &&
            i.email === email &&
            !i.accepted_at &&
            new Date(i.expires_at) > new Date(),
        )
      )
        return err(409, "data_conflict");
      const inv = {
        id: uuid(),
        workspace_id: wsId,
        email,
        role: b.role ?? "MEMBER",
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        accepted_at: null,
        token: uuid(),
      };
      db.invitations.push(inv);
      const ws = db.workspaces.find((w) => w.id === wsId);
      sendMail(db, email, `${user.full_name} приглашает вас в «${ws?.name}»`, `/invite?token=${inv.token}`);
      saveDb();
      return json({ id: inv.id }, 201);
    });
  }),
  http.delete(P("/api/v1/workspaces/:ws/invitations/:id"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      db.invitations = db.invitations.filter((i) => !(i.id === params.id && i.workspace_id === wsId));
      saveDb();
      return noContent();
    }),
  ),
  http.post(P("/api/v1/invitations/accept"), async ({ request }) => {
    const { token } = await body<S["AcceptInvitationRequest"]>(request);
    return withAuth(request, (db, user) => {
      const inv = db.invitations.find((i) => i.token === token);
      if (!inv || inv.accepted_at) return err(404, "invitation_not_found");
      if (new Date(inv.expires_at) < new Date()) return err(409, "invitation_expired");
      if (inv.email !== user.email) return err(403, "invitation_email_mismatch");
      if (db.members.some((m) => m.workspace_id === inv.workspace_id && m.user_id === user.id))
        return err(409, "member_already_exists");
      db.members.push({
        user_id: user.id,
        workspace_id: inv.workspace_id,
        role: inv.role,
        joined_at: nowIso(),
      });
      inv.accepted_at = nowIso();
      saveDb();
      return json({ workspace_id: inv.workspace_id });
    });
  }),

  /* ------------------------------------------------------------- banks */
  http.get(P("/api/v1/workspaces/:ws/banks"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const inactive = new URL(request.url).searchParams.get("include_inactive") === "true";
      return json(
        db.banks.filter((b) => (b.is_global || b.workspace_id === wsId) && (inactive || b.is_active)),
      );
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/banks"), async ({ request, params }) => {
    const b = await body<S["BankNameRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const name = (b.name ?? "").trim();
      if (!name) return validationError(["name"], "Field required");
      if (
        db.banks.some(
          (x) => (x.is_global || x.workspace_id === wsId) && x.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return err(409, "bank_already_exists");
      const at = nowIso();
      const bank = {
        id: uuid(),
        name,
        is_active: true,
        is_global: false,
        workspace_id: wsId,
        created_at: at,
        updated_at: at,
      };
      db.banks.push(bank);
      saveDb();
      return json({ id: bank.id }, 201);
    });
  }),
  http.patch(P("/api/v1/workspaces/:ws/banks/:id"), async ({ request, params }) => {
    const b = await body<S["BankNameRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const bank = db.banks.find((x) => x.id === params.id && (x.is_global || x.workspace_id === wsId));
      if (!bank) return err(404, "bank_not_found");
      const name = (b.name ?? "").trim();
      if (!name) return validationError(["name"], "Field required");
      if (bank.is_global && name !== bank.name) return err(409, "permission_denied");
      bank.name = name;
      bank.updated_at = nowIso();
      saveDb();
      return noContent();
    });
  }),
  http.post(P("/api/v1/workspaces/:ws/banks/:id/activate"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const bank = db.banks.find((x) => x.id === params.id && (x.is_global || x.workspace_id === wsId));
      if (!bank) return err(404, "bank_not_found");
      bank.is_active = true;
      bank.updated_at = nowIso();
      saveDb();
      return noContent();
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/banks/:id/deactivate"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, role, wsId }) => {
      if (!isAdmin(role)) return err(403, "permission_denied");
      const bank = db.banks.find((x) => x.id === params.id && (x.is_global || x.workspace_id === wsId));
      if (!bank) return err(404, "bank_not_found");
      bank.is_active = false;
      bank.updated_at = nowIso();
      saveDb();
      return noContent();
    }),
  ),

  /* ------------------------------------------------- clients, procurements */
  http.post(P("/api/v1/workspaces/:ws/clients"), async ({ request, params }) => {
    const b = await body<S["ClientRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      if (b.inn && !/^(\d{10}|\d{12})$/.test(b.inn))
        return validationError(["inn"], "ИНН должен содержать 10 или 12 цифр");
      if (b.inn && db.clients.some((c) => c.workspace_id === wsId && c.inn === b.inn))
        return err(409, "data_conflict");
      const c: Db["clients"][number] = {
        ...b,
        name: b.name.trim(),
        client_type: b.client_type ?? "company",
        id: uuid(),
        workspace_id: wsId,
        is_archived: false,
        created_at: nowIso(),
      };
      db.clients.push(c);
      saveDb();
      return json({ id: c.id }, 201);
    });
  }),
  http.put(P("/api/v1/workspaces/:ws/clients/:id"), async ({ request, params }) => {
    const b = await body<S["ClientRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const c = db.clients.find((x) => x.id === params.id && x.workspace_id === wsId);
      if (!c) return err(404, "client_not_found");
      if (c.is_archived) return err(409, "client_archived");
      if (b.inn && db.clients.some((x) => x !== c && x.workspace_id === wsId && x.inn === b.inn))
        return err(409, "data_conflict");
      Object.assign(c, b, { name: b.name.trim(), client_type: b.client_type ?? "company" });
      saveDb();
      return noContent();
    });
  }),
  http.post(P("/api/v1/workspaces/:ws/clients/:id/archive"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const c = db.clients.find((x) => x.id === params.id && x.workspace_id === wsId);
      if (!c) return err(404, "client_not_found");
      c.is_archived = true;
      saveDb();
      return noContent();
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/clients/:id/restore"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const c = db.clients.find((x) => x.id === params.id && x.workspace_id === wsId);
      if (!c) return err(404, "client_not_found");
      c.is_archived = false;
      saveDb();
      return noContent();
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/procurements"), async ({ request, params }) => {
    const b = await body<S["CreateProcurementRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      if (!validateMoney(b.nmc)) return validationError(["nmc"], "Invalid decimal");
      const at = nowIso();
      const p: S["ProcurementResponse"] = {
        ...b,
        id: uuid(),
        workspace_id: wsId,
        created_at: at,
        updated_at: at,
      };
      db.procurements.push(p);
      saveDb();
      return json({ id: p.id }, 201);
    });
  }),
  http.put(P("/api/v1/workspaces/:ws/procurements/:id"), async ({ request, params }) => {
    const b = await body<S["ProcurementFields"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const p = db.procurements.find((x) => x.id === params.id && x.workspace_id === wsId);
      if (!p) return err(404, "procurement_not_found");
      if (!validateMoney(b.nmc)) return validationError(["nmc"], "Invalid decimal");
      Object.assign(p, b, { updated_at: nowIso() });
      saveDb();
      return noContent();
    });
  }),

  /* ------------------------------------------------------- applications */
  http.get(P("/api/v1/workspaces/:ws/applications"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), ({ db, wsId }) => {
      const status = new URL(request.url).searchParams.get("status");
      return json(
        db.applications
          .filter((a) => a.workspace_id === wsId && (!status || a.status === status))
          .map((a) => summary(db, a)),
      );
    }),
  ),
  http.post(P("/api/v1/workspaces/:ws/applications"), async ({ request, params }) => {
    const b = await body<S["CreateApplicationRequest"]>(request);
    return withWorkspace(request, String(params.ws), ({ db, wsId, user }) => {
      if (!validateMoney(b.requested_amount)) return validationError(["requested_amount"], "Invalid decimal");
      const client = db.clients.find((c) => c.id === b.client_id && c.workspace_id === wsId);
      if (!client) return validationError(["client_id"], "Client not found");
      if (client.is_archived) return err(409, "client_archived");
      const seq = (db.seq[wsId] ?? 0) + 1; // Z-07: сквозная нумерация в воркспейсе
      db.seq[wsId] = seq;
      const at = nowIso();
      const a: DbApplication = {
        ...b,
        number: b.number || String(seq),
        id: uuid(),
        workspace_id: wsId,
        status: "in_progress",
        created_at: at,
        updated_at: at,
        created_by_user_id: user.id,
        status_history: [
          {
            from_status: null,
            to_status: "in_progress",
            changed_at: at,
            changed_by_user_id: user.id,
            comment: null,
          },
        ],
        archive_reason: null,
        client_obtained_independently: null,
      };
      db.applications.push(a);
      saveDb();
      return json({ id: a.id }, 201);
    });
  }),
  http.get(P("/api/v1/workspaces/:ws/applications/:id"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      return a ? json(detail(ctx.db, a)) : err(404, "application_not_found");
    }),
  ),
  http.put(P("/api/v1/workspaces/:ws/applications/:id"), async ({ request, params }) => {
    const b = await body<S["ApplicationFields"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      if (!a) return err(404, "application_not_found");
      if (a.status === "archived") return err(409, "application_archived");
      if (!validateMoney(b.requested_amount)) return validationError(["requested_amount"], "Invalid decimal");
      Object.assign(a, {
        procurement_id: b.procurement_id ?? null,
        guarantee_type: b.guarantee_type,
        beneficiary_name: b.beneficiary_name ?? null,
        beneficiary_inn: b.beneficiary_inn ?? null,
        requested_amount: b.requested_amount,
        requested_valid_from: b.requested_valid_from ?? null,
        requested_valid_to: b.requested_valid_to ?? null,
        responsible_user_id: b.responsible_user_id ?? null,
        number: b.number ?? null,
        description: b.description ?? null,
        updated_at: nowIso(),
      });
      saveDb();
      return noContent();
    });
  }),
  http.post(P("/api/v1/workspaces/:ws/applications/:id/archive"), async ({ request, params }) => {
    const b = await body<S["ArchiveApplicationRequest"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      if (!a) return err(404, "application_not_found");
      if (a.status !== "in_progress") return err(409, "invalid_status_transition");
      setStatus(a, "archived", ctx.user.id, b.reason ?? null);
      a.archive_reason = b.reason ?? null;
      a.client_obtained_independently = b.client_obtained_independently ?? null;
      saveDb();
      return noContent();
    });
  }),
  http.post(P("/api/v1/workspaces/:ws/applications/:id/reopen"), async ({ request, params }) => {
    const b = await body<S["ReopenApplicationRequest"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      if (!a) return err(404, "application_not_found");
      if (a.status !== "archived") return err(409, "invalid_status_transition");
      setStatus(a, "in_progress", ctx.user.id, b.comment ?? null);
      a.archive_reason = null;
      a.client_obtained_independently = null;
      saveDb();
      return noContent();
    });
  }),

  /* ---------------------------------------------------- bank requests */
  http.post(P("/api/v1/workspaces/:ws/applications/:id/bank-requests"), async ({ request, params }) => {
    const b = await body<S["AddBankRequestRequest"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      if (!a) return err(404, "application_not_found");
      if (a.status === "archived") return err(409, "application_archived");
      const bank = ctx.db.banks.find((x) => x.id === b.bank_id);
      if (!bank) return validationError(["bank_id"], "Bank not found");
      if (!bank.is_active) return err(409, "bank_inactive");
      if (ctx.db.bankRequests.some((r) => r.application_id === a.id && r.bank_id === b.bank_id))
        return err(409, "data_conflict");
      const at = nowIso();
      const br: S["BankRequestResponse"] = {
        external_number: null,
        requested_amount: null,
        sent_at: null,
        decision_at: null,
        offer_received: null,
        rejection_reason: null,
        notes: null,
        ...b,
        id: uuid(),
        application_id: a.id,
        created_at: at,
        updated_at: at,
      };
      ctx.db.bankRequests.push(br);
      saveDb();
      return json({ id: br.id }, 201);
    });
  }),
  http.put(P("/api/v1/workspaces/:ws/applications/:appId/bank-requests/:id"), async ({ request, params }) => {
    const b = await body<S["BankRequestFields"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.appId));
      if (!a) return err(404, "application_not_found");
      const br = ctx.db.bankRequests.find((r) => r.id === params.id && r.application_id === a.id);
      if (!br) return err(404, "bank_request_not_found");
      if (!validateMoney(b.requested_amount)) return validationError(["requested_amount"], "Invalid decimal");
      Object.assign(br, {
        status_text: b.status_text ?? null,
        external_number: b.external_number ?? null,
        requested_amount: b.requested_amount ?? null,
        sent_at: b.sent_at ?? null,
        decision_at: b.decision_at ?? null,
        offer_received: b.offer_received ?? null,
        rejection_reason: b.rejection_reason ?? null,
        notes: b.notes ?? null,
        updated_at: nowIso(),
      });
      saveDb();
      return noContent();
    });
  }),
  http.delete(P("/api/v1/workspaces/:ws/applications/:appId/bank-requests/:id"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), (ctx) => {
      if (!isAdmin(ctx.role)) return err(403, "permission_denied");
      const a = findApp(ctx, String(params.appId));
      if (!a) return err(404, "application_not_found");
      const br = ctx.db.bankRequests.find((r) => r.id === params.id && r.application_id === a.id);
      if (!br) return err(404, "bank_request_not_found");
      if (ctx.db.guarantees.some((g) => g.bank_request_id === br.id))
        return err(409, "bank_request_has_guarantee");
      ctx.db.bankRequests = ctx.db.bankRequests.filter((r) => r !== br);
      saveDb();
      return noContent();
    }),
  ),

  /* ------------------------------------------------------- guarantees */
  http.post(P("/api/v1/workspaces/:ws/applications/:id/guarantees"), async ({ request, params }) => {
    const b = await body<S["IssueGuaranteeRequest"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.id));
      if (!a) return err(404, "application_not_found");
      if (a.status === "archived") return err(409, "application_archived");
      const br = ctx.db.bankRequests.find((r) => r.id === b.bank_request_id && r.application_id === a.id);
      if (!br) return validationError(["bank_request_id"], "Bank request not found");
      if (!b.issued_at) return validationError(["issued_at"], "Field required");
      const bRecord = b as unknown as Record<string, unknown>;
      for (const k of [
        "amount",
        "bank_commission_amount",
        "agent_commission_rate",
        "agent_commission_amount",
      ] as const)
        if (!validateMoney(bRecord[k])) return validationError([k], "Invalid decimal");
      const existing = ctx.db.guarantees.filter((g) => g.application_id === a.id);
      const proc = a.procurement_id ? ctx.db.procurements.find((p) => p.id === a.procurement_id) : undefined;
      const multi = a.guarantee_type === "advance" && proc?.law_type === "commercial";
      if (existing.length && !multi) return err(409, "guarantee_limit_exceeded");
      if (existing.some((g) => g.bank_id === br.bank_id)) return err(409, "guarantee_bank_already_used");
      const g: S["GuaranteeResponse"] & { bank_id: string | null } = {
        ...b,
        id: uuid(),
        application_id: a.id,
        bank_id: br.bank_id,
        created_at: nowIso(),
        agent_commission_amount:
          b.agent_commission_is_manual || !b.bank_commission_amount || !b.agent_commission_rate
            ? (b.agent_commission_amount ?? null)
            : ((Number(b.bank_commission_amount) * Number(b.agent_commission_rate)) / 100).toFixed(2),
      };
      ctx.db.guarantees.push(g);
      if (a.status === "in_progress") setStatus(a, "issued", ctx.user.id);
      saveDb();
      return json({ id: g.id }, 201);
    });
  }),
  http.put(P("/api/v1/workspaces/:ws/applications/:appId/guarantees/:id"), async ({ request, params }) => {
    const b = await body<S["GuaranteeFields"]>(request);
    return withWorkspace(request, String(params.ws), (ctx) => {
      const a = findApp(ctx, String(params.appId));
      if (!a) return err(404, "application_not_found");
      const g = ctx.db.guarantees.find((x) => x.id === params.id && x.application_id === a.id);
      if (!g) return err(404, "guarantee_not_found");
      for (const k of [
        "amount",
        "bank_commission_amount",
        "agent_commission_rate",
        "agent_commission_amount",
      ] as const)
        if (!validateMoney(b[k])) return validationError([k], "Invalid decimal");
      Object.assign(g, b, {
        agent_commission_amount:
          b.agent_commission_is_manual || !b.bank_commission_amount || !b.agent_commission_rate
            ? (b.agent_commission_amount ?? null)
            : ((Number(b.bank_commission_amount) * Number(b.agent_commission_rate)) / 100).toFixed(2),
      });
      saveDb();
      return noContent();
    });
  }),
  http.delete(P("/api/v1/workspaces/:ws/applications/:appId/guarantees/:id"), ({ request, params }) =>
    withWorkspace(request, String(params.ws), (ctx) => {
      if (!isAdmin(ctx.role)) return err(403, "permission_denied");
      const a = findApp(ctx, String(params.appId));
      if (!a) return err(404, "application_not_found");
      const g = ctx.db.guarantees.find((x) => x.id === params.id && x.application_id === a.id);
      if (!g) return err(404, "guarantee_not_found");
      ctx.db.guarantees = ctx.db.guarantees.filter((x) => x !== g);
      saveDb();
      return noContent();
    }),
  ),

  /* ---------------------------------------- служебное: почтовый ящик мока */
  http.get(P("/__mock/mailbox"), ({ request }) => {
    const email = new URL(request.url).searchParams.get("email")?.toLowerCase();
    const db = getDb();
    return json(
      db.mailbox
        .filter((m) => !email || m.to === email)
        .slice(-10)
        .reverse(),
    );
  }),
];
