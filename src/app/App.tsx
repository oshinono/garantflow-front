import {
  A,
  Navigate,
  Route,
  Router,
  type RouteSectionProps,
  useLocation,
  useNavigate,
} from "@solidjs/router";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import {
  type ParentProps,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  lazy,
  on,
  onMount,
} from "solid-js";
import { errorMessage, isApiError } from "@/api/errors";
import { keys } from "@/api/queries/keys";
import { fetchWorkspaces, useCreateWorkspace } from "@/api/queries/workspaces";
import { stubVersion } from "@/api/stubs/storage";
import { AuthLayout, AuthTitle } from "@/features/auth/AuthLayout";
import { CheckEmailPage, InvitePage, VerifyEmailPage } from "@/features/auth/EmailPages";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { pendingInvite } from "@/features/auth/pending-invite";
import { BoardPage } from "@/features/board/BoardPage";
import { TodayPage } from "@/features/today/TodayPage";
import { LAST_WORKSPACE_KEY, local } from "@/shared/lib/storage";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialogHost, PromptDialogHost } from "@/shared/ui/Dialog";
import { Field, Input } from "@/shared/ui/form";
import { ToastRegion, toast } from "@/shared/ui/Toast";
import { AppShell } from "./AppShell";
import { AuthProvider, FullScreenLoader, useAuth } from "./auth";
import { WorkspaceProvider, useWorkspace } from "./workspace";

const ApplicationRoute = lazy(() => import("@/features/application/ApplicationRoute"));
const FeedPage = lazy(() => import("@/features/feed/FeedPage"));
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage"));
const BanksPage = lazy(() => import("@/features/banks/BanksPage"));
const SettingsPage = lazy(() => import("@/features/workspaces/SettingsPage"));
const UiKitPage = import.meta.env.DEV ? lazy(() => import("@/features/dev/UiKitPage")) : null;

function createQueryClient() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Сетевые и 5xx — до 2 повторов; 4xx не повторяем.
        retry: (count, e) => count < 2 && !(isApiError(e) && e.status >= 400 && e.status < 500),
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
    queryCache: new QueryCache({
      onError: (e, query) => {
        if (!isApiError(e)) return;
        if (e.isNetwork) toast(errorMessage(e), { label: "Повторить", run: () => void query.fetch() });
        else if (e.status === 403) onForbidden(qc);
      },
    }),
    mutationCache: new MutationCache({
      onError: (e, _v, _c, mutation) => {
        if (mutation.options.onError) return; // мутация сама показывает ошибку
        if (isApiError(e) && e.status === 403) onForbidden(qc);
        else toast(errorMessage(e));
      },
    }),
  });
  return qc;
}

function onForbidden(qc: QueryClient) {
  toast("Недостаточно прав");
  void qc.invalidateQueries({ queryKey: keys.workspaces });
}

/** Любая запись заглушки (в т.ч. из другой вкладки) обновляет stub-запросы. */
function StubSync(props: { client: QueryClient }) {
  createEffect(
    on(
      stubVersion,
      () => void props.client.invalidateQueries({ predicate: (q) => q.queryKey[2] === "stub" }),
      { defer: true },
    ),
  );
  return null;
}

function Root(props: RouteSectionProps) {
  const client = createQueryClient();
  return (
    <QueryClientProvider client={client}>
      <StubSync client={client} />
      <AuthProvider>
        {props.children}
        <ToastRegion />
        <ConfirmDialogHost />
        <PromptDialogHost />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RequireAuth(props: ParentProps) {
  const auth = useAuth();
  const location = useLocation();
  return (
    <Switch>
      <Match when={auth.status() === "loading"}>
        <FullScreenLoader />
      </Match>
      <Match when={auth.status() === "guest"}>
        <Navigate href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />
      </Match>
      <Match when={auth.status() === "authed"}>{props.children}</Match>
    </Switch>
  );
}

function GuestOnly(props: ParentProps) {
  const auth = useAuth();
  return (
    <Switch>
      <Match when={auth.status() === "loading"}>
        <FullScreenLoader />
      </Match>
      <Match when={auth.status() === "authed"}>
        <Navigate href="/" />
      </Match>
      <Match when={auth.status() === "guest"}>
        <AuthLayout>{props.children}</AuthLayout>
      </Match>
    </Switch>
  );
}

/** «/» — последний открытый воркспейс, иначе первый, иначе предложение создать. */
function RootRedirect() {
  const navigate = useNavigate();
  onMount(async () => {
    const invite = pendingInvite.get();
    if (invite) return navigate(`/invite?token=${encodeURIComponent(invite)}`, { replace: true });
    try {
      const list = await fetchWorkspaces();
      const last = local.get(LAST_WORKSPACE_KEY);
      const target = list.find((w) => w.id === last) ?? list[0];
      navigate(target ? `/w/${target.id}/today` : "/welcome", { replace: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  });
  return <FullScreenLoader />;
}

function WelcomePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const [name, setName] = createSignal(`${(auth.user()?.full_name ?? "").split(" ")[0] || "Мой"} — воркспейс`);
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim()) return;
    const ws = await create.mutateAsync(name().trim());
    navigate(`/w/${ws.id}/today`, { replace: true });
  };
  return (
    <AuthLayout>
      <AuthTitle
        eyebrow="Первый шаг"
        title="Создайте воркспейс"
        intro="Воркспейс хранит заявки, банки и участников команды. Позже можно создать ещё или принять приглашение."
      />
      <form class="grid gap-3.5" onSubmit={submit}>
        <Field label="Название пространства">
          {(id) => <Input id={id} maxlength={255} value={name()} onValue={setName} class="!p-3" />}
        </Field>
        <Button type="submit" variant="primary" class="!p-3" loading={create.isPending}>
          Создать воркспейс
        </Button>
        <Button variant="subtle" onClick={() => void auth.logout()}>
          Выйти
        </Button>
      </form>
    </AuthLayout>
  );
}

export function NotFoundScreen(props: { text?: string; backHref?: string }) {
  return (
    <div class="card mx-auto mt-10 max-w-[480px] p-8 text-center">
      <div class="eyebrow mb-2">404</div>
      <h1 class="m-0 mb-2 text-xl font-bold">Не найдено</h1>
      <p class="m-0 mb-5 text-[13px] text-muted">
        {props.text ?? "Такой страницы нет или у вас нет к ней доступа."}
      </p>
      <A href={props.backHref ?? "/"} class="btn btn-primary no-underline">
        Вернуться к доске
      </A>
    </div>
  );
}

function WorkspaceLayout(props: RouteSectionProps) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
        <WorkspaceGate>{props.children}</WorkspaceGate>
      </WorkspaceProvider>
    </RequireAuth>
  );
}

function WorkspaceGate(props: ParentProps) {
  const ws = useWorkspace();
  return (
    <Switch>
      <Match when={ws.loading()}>
        <FullScreenLoader />
      </Match>
      <Match when={ws.notFound()}>
        <div class="p-6">
          <NotFoundScreen text="Воркспейс не найден или у вас нет к нему доступа." />
        </div>
      </Match>
      <Match when={ws.workspace()}>
        <AppShell>{props.children}</AppShell>
      </Match>
    </Switch>
  );
}

export function App() {
  return (
    <Router root={Root}>
      <Route
        path="/login"
        component={() => (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        )}
      />
      <Route
        path="/register"
        component={() => (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        )}
      />
      <Route
        path="/check-email"
        component={() => (
          <GuestOnly>
            <CheckEmailPage />
          </GuestOnly>
        )}
      />
      <Route
        path="/verify-email"
        component={() => (
          <AuthLayout>
            <VerifyEmailPage />
          </AuthLayout>
        )}
      />
      <Route path="/invite" component={() => <InviteRoute />} />
      <Route
        path="/welcome"
        component={() => (
          <RequireAuth>
            <WelcomePage />
          </RequireAuth>
        )}
      />
      <Route
        path="/"
        component={() => (
          <RequireAuth>
            <RootRedirect />
          </RequireAuth>
        )}
      />
      <Route path="/w/:workspaceId" component={WorkspaceLayout}>
        <Route path="/" component={() => <Navigate href="today" />} />
        <Route path="/today" component={TodayPage} />
        <Route path="/board" component={BoardPage}>
          <Route path="/" />
          <Route path="/:applicationId" component={ApplicationRoute} />
        </Route>
        <Route path="/feed" component={FeedPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/banks" component={BanksPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/*" component={() => <NotFoundScreen backHref="board" />} />
      </Route>
      {UiKitPage && <Route path="/dev/ui" component={UiKitPage} />}
      <Route
        path="*"
        component={() => (
          <div class="p-6">
            <NotFoundScreen />
          </div>
        )}
      />
    </Router>
  );
}

function InviteRoute() {
  const auth = useAuth();
  return (
    <Show when={auth.status() !== "loading"} fallback={<FullScreenLoader />}>
      <AuthLayout>
        <InvitePage />
      </AuthLayout>
    </Show>
  );
}
