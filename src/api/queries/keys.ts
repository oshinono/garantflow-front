export const keys = {
  me: ["me"] as const,
  workspaces: ["workspaces"] as const,
  user: (id: string) => ["users", id] as const,
  ws: (ws: string) => ["ws", ws] as const,
  members: (ws: string) => ["ws", ws, "members"] as const,
  invitations: (ws: string) => ["ws", ws, "invitations"] as const,
  banks: (ws: string, inactive = false) => ["ws", ws, "banks", { inactive }] as const,
  banksAll: (ws: string) => ["ws", ws, "banks"] as const,
  applications: (ws: string) => ["ws", ws, "applications"] as const,
  application: (ws: string, id: string) => ["ws", ws, "application", id] as const,
  applicationsAny: (ws: string) => ["ws", ws, "application"] as const,
  issuedDetails: (ws: string) => ["ws", ws, "issued-details"] as const,
  /** Заглушки: инвалидируются автоматически при любой записи в stub-хранилище. */
  stub: (ws: string, name: string, ...rest: unknown[]) => ["ws", ws, "stub", name, ...rest] as const,
};
