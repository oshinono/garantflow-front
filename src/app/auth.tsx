import { useLocation, useNavigate } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import {
  type JSX,
  type ParentProps,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  untrack,
  useContext,
} from "solid-js";
import { tokens } from "@/api/client";
import * as authApi from "@/api/queries/auth";
import type { User } from "@/domain/types";
import { local, LAST_WORKSPACE_KEY } from "@/shared/lib/storage";
import { toast } from "@/shared/ui/Toast";

type Status = "loading" | "guest" | "authed";

type AuthContextValue = {
  status: () => Status;
  user: () => User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>();

export function AuthProvider(props: ParentProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = createSignal<Status>("loading");
  const [user, setUser] = createSignal<User | null>(null);

  const toGuest = () => {
    setUser(null);
    setStatus("guest");
    qc.clear();
  };

  const loadUser = async () => {
    const me = await authApi.fetchMe();
    setUser(me);
    setStatus("authed");
  };

  onMount(async () => {
    if (!tokens.hasSession) return setStatus("guest");
    try {
      if (await tokens.refresh()) await loadUser();
      else toGuest();
    } catch {
      toGuest();
    }
  });

  // Обработчик события хранилища токенов: читает текущее состояние без отслеживания.
  const unsubscribe = tokens.subscribe((reason) => {
    if (reason === "tokens") return;
    if (untrack(status) !== "authed") return;
    toGuest();
    if (reason === "expired") {
      toast("Сессия истекла. Войдите снова.");
      const next = untrack(() => location.pathname + location.search);
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  });
  onCleanup(unsubscribe);

  const value: AuthContextValue = {
    status,
    user,
    async login(email, password) {
      await authApi.login(email, password);
      await loadUser();
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        toGuest();
        local.remove(LAST_WORKSPACE_KEY);
        navigate("/login", { replace: true });
      }
    },
    reloadUser: loadUser,
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function FullScreenLoader(): JSX.Element {
  return (
    <div class="grid min-h-dvh place-items-center text-accent" aria-busy="true">
      <span class="inline-block size-7 animate-spin rounded-full border-[3px] border-current border-r-transparent" />
    </div>
  );
}
