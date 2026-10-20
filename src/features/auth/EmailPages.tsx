import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Show, createResource, createSignal, onCleanup } from "solid-js";
import { errorMessage } from "@/api/errors";
import { acceptInvitation, resendVerification, verifyEmail } from "@/api/queries/auth";
import { useAuth } from "@/app/auth";
import { Button } from "@/shared/ui/Button";
import { Field, Input } from "@/shared/ui/form";
import { Spinner } from "@/shared/ui/display";
import { AuthAlert, AuthTitle } from "./AuthLayout";
import { pendingInvite } from "./pending-invite";

function ResendButton(props: { email: () => string }) {
  const [cooldown, setCooldown] = createSignal(0);
  const [sent, setSent] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  onCleanup(() => clearInterval(timer));
  const resend = async () => {
    await resendVerification(props.email());
    setSent(true);
    setCooldown(60);
    clearInterval(timer);
    timer = setInterval(() => setCooldown((s) => (s <= 1 ? (clearInterval(timer), 0) : s - 1)), 1000);
  };
  return (
    <>
      <Show when={sent()}>
        <AuthAlert tone="success">
          Если адрес зарегистрирован и не подтверждён, мы отправили новое письмо.
        </AuthAlert>
      </Show>
      <Button class="w-full !p-3" onClick={() => void resend()} disabled={cooldown() > 0 || !props.email()}>
        {cooldown() > 0 ? `Отправить ещё раз через ${cooldown()} с` : "Отправить письмо ещё раз"}
      </Button>
    </>
  );
}

/** «Проверьте почту» + повторная отправка (кулдаун 60 с, нейтральный текст). */
export function CheckEmailPage() {
  const [params] = useSearchParams<{ email?: string }>();
  const email = () => params.email ?? "";
  return (
    <>
      <AuthTitle
        eyebrow="Почти готово"
        title="Проверьте почту"
        intro={`Мы отправили ссылку для подтверждения на ${email() || "указанный адрес"}. Перейдите по ней, чтобы активировать аккаунт.`}
      />
      <ResendButton email={email} />
      <div class="mt-5 text-center text-xs text-muted">
        <A
          href={`/login${email() ? `?email=${encodeURIComponent(email())}` : ""}`}
          class="font-bold text-accent no-underline"
        >
          Вернуться ко входу
        </A>
      </div>
    </>
  );
}

/** Результат перехода по ссылке из письма. */
export function VerifyEmailPage() {
  const [params] = useSearchParams<{ token?: string }>();
  const [result] = createResource(
    () => params.token ?? "",
    async (token) => {
      if (!token) return { ok: false as const, message: "В ссылке нет токена подтверждения." };
      try {
        // API отвечает 204 без тела — почта известна из ссылки только логину.
        await verifyEmail(token);
        return { ok: true as const, email: "" };
      } catch (e) {
        return { ok: false as const, message: errorMessage(e) };
      }
    },
  );
  const [email, setEmail] = createSignal("");
  return (
    <Show
      when={result()}
      fallback={
        <div class="flex items-center gap-3 text-sm text-muted">
          <Spinner /> Подтверждаем адрес…
        </div>
      }
    >
      {(r) => (
        <Show
          when={r().ok && r()}
          fallback={
            <>
              <AuthTitle eyebrow="Подтверждение почты" title="Ссылка не сработала" />
              <AuthAlert>{(r() as { message: string }).message}</AuthAlert>
              <div class="grid gap-3">
                <Field label="Почта для повторного письма">
                  {(id) => (
                    <Input id={id} type="email" autocomplete="email" value={email()} onValue={setEmail} />
                  )}
                </Field>
                <ResendButton email={email} />
              </div>
            </>
          }
        >
          {(ok) => (
            <>
              <AuthTitle eyebrow="Готово" title="Почта подтверждена" intro="Теперь можно войти в аккаунт." />
              <A
                href={(() => {
                  const addr = (ok() as { email: string }).email;
                  return addr ? `/login?email=${encodeURIComponent(addr)}` : "/login";
                })()}
                class="btn btn-primary w-full !p-3 no-underline"
              >
                Войти
              </A>
            </>
          )}
        </Show>
      )}
    </Show>
  );
}

const INVITE_ERRORS: Record<string, { title: string; text: string }> = {
  invitation_email_mismatch: {
    title: "Приглашение для другого адреса",
    text: "Приглашение отправлено на другую почту. Войдите под адресом, на который пришло письмо.",
  },
  invitation_expired: {
    title: "Срок приглашения истёк",
    text: "Попросите администратора воркспейса отправить приглашение ещё раз.",
  },
  member_already_exists: {
    title: "Вы уже участник",
    text: "Вы уже состоите в этом воркспейсе — откройте его из списка.",
  },
};

/** Принятие приглашения: гостя — на вход/регистрацию с сохранением токена. */
export function InvitePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams<{ token?: string }>();
  const token = () => params.token ?? pendingInvite.get() ?? "";

  const [accept] = createResource(
    () => (auth.status() === "authed" && token() ? token() : false),
    async (t) => {
      try {
        const r = await acceptInvitation(t);
        pendingInvite.clear();
        navigate(`/w/${r.workspace_id}/today`, { replace: true });
        return { ok: true as const };
      } catch (e) {
        pendingInvite.clear();
        const code = (e as { code?: string }).code ?? "";
        return { ok: false as const, code, message: errorMessage(e) };
      }
    },
  );

  return (
    <Show
      when={auth.status() === "authed"}
      fallback={
        <>
          <AuthTitle
            eyebrow="Приглашение"
            title="Вас пригласили в воркспейс"
            intro="Войдите или зарегистрируйтесь на адрес, на который пришло письмо, — приглашение примется автоматически."
          />
          <div class="grid gap-2.5">
            <A
              href={`/login?invite=${encodeURIComponent(token())}`}
              class="btn btn-primary !p-3 no-underline"
              onClick={() => pendingInvite.set(token())}
            >
              Войти
            </A>
            <A
              href={`/register?invite=${encodeURIComponent(token())}`}
              class="btn !p-3 no-underline"
              onClick={() => pendingInvite.set(token())}
            >
              Создать аккаунт
            </A>
          </div>
        </>
      }
    >
      <Show
        when={accept() && !accept()!.ok && accept()}
        fallback={
          <div class="flex items-center gap-3 text-sm text-muted">
            <Spinner /> Принимаем приглашение…
          </div>
        }
      >
        {(r) => {
          const info = () => INVITE_ERRORS[(r() as { code: string }).code];
          return (
            <>
              <AuthTitle eyebrow="Приглашение" title={info()?.title ?? "Не удалось принять приглашение"} />
              <AuthAlert>{info()?.text ?? (r() as { message: string }).message}</AuthAlert>
              <A href="/" class="btn btn-primary w-full !p-3 no-underline">
                Перейти к моим воркспейсам
              </A>
            </>
          );
        }}
      </Show>
    </Show>
  );
}
