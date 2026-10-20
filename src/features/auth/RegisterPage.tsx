import { A, useNavigate, useSearchParams } from "@solidjs/router";
import * as v from "valibot";
import { Show, createSignal } from "solid-js";
import { errorMessage, fieldErrors } from "@/api/errors";
import { register } from "@/api/queries/auth";
import { useAuth } from "@/app/auth";
import { Button } from "@/shared/ui/Button";
import { Field, Input } from "@/shared/ui/form";
import { Notice } from "@/shared/ui/display";
import { AuthAlert, AuthTitle } from "./AuthLayout";
import { PasswordInput, emailSchema, issue, passwordSchema } from "./LoginPage";
import { pendingInvite } from "./pending-invite";

const nameSchema = v.pipe(v.string(), v.trim(), v.minLength(1, "Укажите имя"), v.maxLength(255));

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams<{ invite?: string; email?: string }>();
  const invite = () => params.invite ?? pendingInvite.get();
  if (params.invite) pendingInvite.set(params.invite);

  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal(params.email ?? "");
  const [password, setPassword] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [server, setServer] = createSignal<Record<string, string>>({});
  const [busy, setBusy] = createSignal(false);

  const errs = () =>
    touched()
      ? {
          name: issue(nameSchema, name()) ?? server().full_name ?? null,
          email: issue(emailSchema, email()) ?? server().email ?? null,
          password: issue(passwordSchema, password()) ?? server().password ?? null,
        }
      : { name: server().full_name ?? null, email: server().email ?? null, password: server().password ?? null };

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    setServer({});
    const ex = errs();
    if (ex.name || ex.email || ex.password) return;
    setBusy(true);
    setError(null);
    try {
      const registered = await register({
        full_name: name(),
        email: email(),
        password: password(),
        invitation_token: invite(),
      });
      if (invite()) {
        // Регистрация по приглашению: почта подтверждена автоматически — сразу входим и принимаем приглашение.
        await auth.login(email(), password());
        navigate(`/invite?token=${encodeURIComponent(invite() ?? "")}`, { replace: true });
      } else {
        void registered;
        navigate(`/check-email?email=${encodeURIComponent(email())}`, { replace: true });
      }
    } catch (err) {
      setServer(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AuthTitle
        eyebrow="Регистрация"
        title="Создать аккаунт"
        intro="Зарегистрируйтесь, чтобы создать рабочее пространство команды."
      />
      <Show when={error()}>{(m) => <AuthAlert>{m()}</AuthAlert>}</Show>
      <form class="grid gap-3.5" onSubmit={submit} novalidate>
        <Field label="Ваше имя" error={errs().name}>
          {(id, d) => (
            <Input
              id={id}
              name="name"
              autocomplete="name"
              placeholder="Например, Анна Иванова"
              maxlength={255}
              value={name()}
              onValue={setName}
              invalid={!!errs().name}
              aria-describedby={d}
              class="!p-3"
            />
          )}
        </Field>
        <Field label="Рабочая почта" error={errs().email}>
          {(id, d) => (
            <Input
              id={id}
              name="email"
              type="email"
              autocomplete="email"
              placeholder="name@company.ru"
              value={email()}
              onValue={setEmail}
              invalid={!!errs().email}
              aria-describedby={d}
              class="!p-3"
            />
          )}
        </Field>
        <Field label="Пароль" error={errs().password}>
          {(id, d) => (
            <PasswordInput
              id={id}
              value={password()}
              onValue={setPassword}
              autocomplete="new-password"
              invalid={!!errs().password}
              describedBy={d}
            />
          )}
        </Field>
        <Show
          when={invite()}
          fallback={
            <Notice class="!mt-0">
              После регистрации на почту придёт письмо со ссылкой для подтверждения.
            </Notice>
          }
        >
          <Notice class="!mt-0">Вы регистрируетесь по приглашению — почта подтвердится автоматически.</Notice>
        </Show>
        <Button type="submit" variant="primary" class="!p-3" loading={busy()}>
          Создать аккаунт
        </Button>
      </form>
      <div class="mt-5 text-center text-xs text-muted">
        Уже есть аккаунт?{" "}
        <A href="/login" class="font-bold text-accent no-underline">
          Войти
        </A>
      </div>
    </>
  );
}
