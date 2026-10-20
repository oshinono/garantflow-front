import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Eye, EyeOff } from "lucide-solid";
import * as v from "valibot";
import { Show, createSignal, onCleanup } from "solid-js";
import { errorMessage, isApiError } from "@/api/errors";
import { useAuth } from "@/app/auth";
import { Button } from "@/shared/ui/Button";
import { Field, Input } from "@/shared/ui/form";
import { AuthAlert, AuthTitle } from "./AuthLayout";
import { pendingInvite, safeNext } from "./pending-invite";

export const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(3, "Укажите почту"),
  v.maxLength(320),
  v.email("Некорректный адрес почты"),
);
export const passwordSchema = v.pipe(
  v.string(),
  v.minLength(8, "Пароль — не менее 8 символов"),
  v.maxLength(128, "Пароль — не более 128 символов"),
);

export function issue(schema: v.GenericSchema<string, string>, value: string): string | null {
  const r = v.safeParse(schema, value);
  return r.success ? null : (r.issues[0]?.message ?? "Некорректное значение");
}

export function PasswordInput(props: {
  id: string;
  value: string;
  onValue: (v: string) => void;
  autocomplete: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = createSignal(false);
  return (
    <div class="relative">
      <Input
        id={props.id}
        type={visible() ? "text" : "password"}
        name="password"
        autocomplete={props.autocomplete}
        placeholder="Не менее 8 символов"
        value={props.value}
        onValue={props.onValue}
        invalid={props.invalid}
        aria-describedby={props.describedBy}
        class="!p-3 !pr-10"
      />
      <button
        type="button"
        class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md border-0 bg-transparent text-muted hover:text-fg"
        onClick={() => setVisible(!visible())}
        aria-label={visible() ? "Скрыть пароль" : "Показать пароль"}
      >
        {visible() ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams<{ next?: string; email?: string; invite?: string }>();
  const [email, setEmail] = createSignal(params.email ?? "");
  const [password, setPassword] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [cooldown, setCooldown] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  onCleanup(() => clearInterval(timer));

  if (params.invite) pendingInvite.set(params.invite);

  const emailErr = () => (touched() ? issue(emailSchema, email()) : null);
  const passErr = () => (touched() && !password() ? "Введите пароль" : null);

  const startCooldown = (sec: number) => {
    setCooldown(sec);
    clearInterval(timer);
    timer = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) clearInterval(timer);
        return Math.max(0, s - 1);
      });
    }, 1000);
  };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (emailErr() || passErr()) return;
    setBusy(true);
    setError(null);
    try {
      await auth.login(email(), password());
      const invite = pendingInvite.get();
      navigate(invite ? `/invite?token=${encodeURIComponent(invite)}` : (safeNext(params.next) ?? "/"), {
        replace: true,
      });
    } catch (err) {
      if (isApiError(err) && err.code === "email_not_verified") {
        navigate(`/check-email?email=${encodeURIComponent(email().trim())}`);
        return;
      }
      if (isApiError(err) && err.status === 429) startCooldown(err.retryAfter ?? 30);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AuthTitle
        eyebrow="С возвращением"
        title="Войти в аккаунт"
        intro="Войдите, чтобы продолжить работу с заявками."
      />
      <Show when={error()}>{(m) => <AuthAlert>{m()}</AuthAlert>}</Show>
      <form class="grid gap-3.5" onSubmit={submit} novalidate>
        <Field label="Рабочая почта" error={emailErr()}>
          {(id, d) => (
            <Input
              id={id}
              name="email"
              type="email"
              autocomplete="email"
              placeholder="name@company.ru"
              value={email()}
              onValue={setEmail}
              invalid={!!emailErr()}
              aria-describedby={d}
              class="!p-3"
            />
          )}
        </Field>
        <Field label="Пароль" error={passErr()}>
          {(id, d) => (
            <PasswordInput
              id={id}
              value={password()}
              onValue={setPassword}
              autocomplete="current-password"
              invalid={!!passErr()}
              describedBy={d}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" class="!p-3" loading={busy()} disabled={cooldown() > 0}>
          {cooldown() > 0 ? `Повторите через ${cooldown()} с` : "Войти"}
        </Button>
      </form>
      <div class="mt-5 text-center text-xs text-muted">
        Впервые здесь?{" "}
        <A href="/register" class="font-bold text-accent no-underline">
          Создать аккаунт
        </A>
      </div>
    </>
  );
}
