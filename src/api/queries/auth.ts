import { api, tokens, unwrap } from "../client";

export async function login(email: string, password: string) {
  const pair = await unwrap(
    api.POST("/api/v1/auth/login", {
      body: { username: email.trim().toLowerCase(), password },
      bodySerializer: (b) => new URLSearchParams(b as Record<string, string>).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
  );
  tokens.setTokens(pair);
  return pair;
}

export async function logout() {
  const refresh = tokens.refreshToken;
  try {
    if (refresh) await api.POST("/api/v1/auth/logout", { body: { refresh_token: refresh } });
  } finally {
    tokens.clear("logout");
  }
}

export function fetchMe() {
  return unwrap(api.GET("/api/v1/users/me"));
}

export function register(input: {
  full_name: string;
  email: string;
  password: string;
  invitation_token?: string | null;
}) {
  return unwrap(
    api.POST("/api/v1/users", {
      body: { ...input, email: input.email.trim().toLowerCase(), full_name: input.full_name.trim() },
    }),
  );
}

export function verifyEmail(token: string) {
  return unwrap(api.POST("/api/v1/auth/verify-email", { body: { token } }));
}

export async function resendVerification(email: string) {
  // Ответ всегда 202 — текст на экране нейтральный.
  await api.POST("/api/v1/auth/verify-email/resend", { body: { email: email.trim().toLowerCase() } });
}

export function acceptInvitation(token: string) {
  return unwrap(api.POST("/api/v1/invitations/accept", { body: { token } }));
}

export async function checkHealth(): Promise<boolean> {
  try {
    const { response } = await api.GET("/health");
    return response.ok;
  } catch {
    return false;
  }
}
