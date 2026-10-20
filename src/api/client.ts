import createClient from "openapi-fetch";
import { env } from "@/env";
import type { TokenPair } from "@/domain/types";
import { ApiError, toApiError } from "./errors";
import type { paths } from "./schema";
import { TokenStore } from "./session";

const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"];

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.clone().json();
  } catch {
    return null;
  }
}

async function rawRefresh(refreshToken: string): Promise<TokenPair> {
  const res = await fetch(`${env.apiBaseUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": newRequestId() },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw await toApiError(res, await readJson(res));
  return (await res.json()) as TokenPair;
}

export const tokens = new TokenStore({ refresh: rawRefresh });

async function send(request: Request): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set("X-Request-ID", newRequestId());
  if (tokens.accessToken) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  let response: Response;
  try {
    response = await fetch(new Request(request, { headers }));
  } catch {
    throw new ApiError({ status: 0, code: "network_error", detail: "Сеть недоступна" });
  }
  if (!response.ok) {
    const id = response.headers.get("X-Request-ID") ?? headers.get("X-Request-ID");
    console.warn(
      `[api] ${request.method} ${new URL(request.url).pathname} → ${response.status}, X-Request-ID: ${id}`,
    );
  }
  return response;
}

/**
 * fetch для openapi-fetch: Bearer + X-Request-ID, упреждающее обновление токена
 * и одна повторная попытка после 401 (refresh single-flight).
 */
async function authFetch(request: Request): Promise<Response> {
  const path = new URL(request.url, location.origin).pathname;
  const isAuth = AUTH_PATHS.includes(path);
  if (!isAuth && tokens.hasSession && tokens.needsRefresh) await tokens.refresh();
  const retry = isAuth ? null : request.clone();
  const response = await send(request);
  if (response.status === 401 && retry && tokens.hasSession) {
    if (await tokens.refresh()) return send(retry);
  }
  return response;
}

export const api = createClient<paths>({
  baseUrl: env.apiBaseUrl || (typeof location !== "undefined" ? location.origin : ""),
  fetch: authFetch,
});

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/** Разворачивает ответ openapi-fetch: данные или ApiError. */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok || error !== undefined) throw await toApiError(response, error);
  return data as T;
}

export { newRequestId };
