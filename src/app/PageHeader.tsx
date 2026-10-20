import { type JSX, Show } from "solid-js";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";

/** Шапка страницы: надзаголовок, заголовок, описание и действия справа (setPageMeta() прототипа). */
export function PageHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: JSX.Element;
}) {
  return (
    <div class="mb-5 flex items-start justify-between gap-[18px] max-sm:block">
      <div>
        <div class="eyebrow mb-[5px]">{props.eyebrow}</div>
        <h1 class="m-0 mb-[7px] text-[25px] leading-tight font-[760] tracking-[-0.75px] max-sm:text-[23px]">
          {props.title}
        </h1>
        <p class="m-0 text-[13px] text-muted">{props.description}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 max-sm:mt-3.5">
        <NotificationsBell />
        <Show when={props.actions}>{props.actions}</Show>
      </div>
    </div>
  );
}
