import { Dialog as K } from "@kobalte/core/dialog";
import { X } from "lucide-solid";
import { type JSX, Show, createSignal } from "solid-js";
import { cn } from "@/shared/lib/cn";
import { Button } from "./Button";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: JSX.Element;
  description?: JSX.Element;
  children: JSX.Element;
  footer?: JSX.Element;
  /** max-width, px */
  width?: number;
  /** На мобильных — во весь экран (карточка заявки). */
  fullscreenOnMobile?: boolean;
  /** Перехват закрытия (например, несохранённые изменения): false — не закрывать. */
  beforeClose?: () => boolean | Promise<boolean>;
};

/** Модальный диалог с ловушкой фокуса и возвратом фокуса (Kobalte). */
export function Dialog(props: DialogProps) {
  const requestClose = async () => {
    if (props.beforeClose && !(await props.beforeClose())) return;
    props.onOpenChange(false);
  };
  return (
    <K open={props.open} onOpenChange={(o) => (o ? props.onOpenChange(true) : void requestClose())} modal>
      <K.Portal>
        <K.Overlay class="fixed inset-0 z-40 bg-[#17203370] backdrop-blur-[3px]" />
        <div class="fixed inset-0 z-40 grid place-items-center p-6 max-sm:p-2">
          <K.Content
            class={cn(
              "relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-[17px] border border-line bg-surface text-fg shadow-dialog",
              props.fullscreenOnMobile &&
                "max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none max-sm:border-0",
            )}
            style={{ "max-width": `${props.width ?? 520}px` }}
          >
            <div class="overflow-auto p-[22px] max-sm:p-[17px]">
              <div class="mb-[18px] flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <K.Title class="m-0 mb-[5px] text-[19px] font-bold tracking-[-0.4px]">
                    {props.title}
                  </K.Title>
                  <Show when={props.description}>
                    <K.Description class="m-0 text-xs text-muted">{props.description}</K.Description>
                  </Show>
                </div>
                <K.CloseButton class="btn btn-subtle btn-icon -mt-1 -mr-2 flex-none" aria-label="Закрыть">
                  <X size={18} />
                </K.CloseButton>
              </div>
              {props.children}
              <Show when={props.footer}>
                <div class="mt-[21px] flex flex-wrap items-center justify-end gap-2 border-t border-line pt-[15px]">
                  {props.footer}
                </div>
              </Show>
            </div>
          </K.Content>
        </div>
      </K.Portal>
    </K>
  );
}

type ConfirmOptions = {
  title: string;
  text?: JSX.Element;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const [pending, setPending] = createSignal<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

/** Диалог подтверждения вместо window.confirm(). */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => setPending({ ...opts, resolve }));
}

export function ConfirmDialogHost() {
  const close = (v: boolean) => {
    pending()?.resolve(v);
    setPending(null);
  };
  return (
    <Show when={pending()}>
      {(p) => (
        <Dialog
          open
          onOpenChange={(o) => !o && close(false)}
          title={p().title}
          width={440}
          footer={
            <>
              <Button onClick={() => close(false)}>{p().cancelLabel ?? "Отмена"}</Button>
              <Button variant={p().danger ? "danger" : "primary"} onClick={() => close(true)}>
                {p().confirmLabel ?? "Продолжить"}
              </Button>
            </>
          }
        >
          <div class="text-[13px] leading-normal text-fg-2">{p().text}</div>
        </Dialog>
      )}
    </Show>
  );
}

type PromptOptions = {
  title: string;
  label: string;
  initial?: string;
  confirmLabel?: string;
  maxLength?: number;
};

const [promptState, setPromptState] = createSignal<
  (PromptOptions & { resolve: (v: string | null) => void }) | null
>(null);

/** Диалог ввода строки вместо window.prompt(). */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => setPromptState({ ...opts, resolve }));
}

export function PromptDialogHost() {
  const [value, setValue] = createSignal("");
  const close = (v: string | null) => {
    promptState()?.resolve(v);
    setPromptState(null);
  };
  return (
    <Show when={promptState()}>
      {(p) => {
        setValue(p().initial ?? "");
        return (
          <Dialog open onOpenChange={(o) => !o && close(null)} title={p().title} width={440}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (value().trim()) close(value().trim());
              }}
            >
              <label class="field">
                {p().label}
                <input
                  class="control"
                  value={value()}
                  maxlength={p().maxLength ?? 255}
                  onInput={(e) => setValue(e.currentTarget.value)}
                  autofocus
                />
              </label>
              <div class="mt-[21px] flex flex-wrap items-center justify-end gap-2 border-t border-line pt-[15px]">
                <Button onClick={() => close(null)}>Отмена</Button>
                <Button type="submit" variant="primary" disabled={!value().trim()}>
                  {p().confirmLabel ?? "Сохранить"}
                </Button>
              </div>
            </form>
          </Dialog>
        );
      }}
    </Show>
  );
}
