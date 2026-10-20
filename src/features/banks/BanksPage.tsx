import { Globe, Pencil, Plus } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal, on, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { errorMessage } from "@/api/errors";
import { toBoardItems, useApplications, useBoardExtras } from "@/api/queries/applications";
import { useBankInfo, useBanks, useCreateBank, useRenameBank, useSaveBankInfo, useSetBankActive } from "@/api/queries/banks";
import type { BankInfo } from "@/api/stubs/extras";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import { itemBankIds } from "@/domain/board";
import type { Bank } from "@/domain/types";
import { env } from "@/env";
import { Button } from "@/shared/ui/Button";
import { promptDialog } from "@/shared/ui/Dialog";
import { Avatar, EmptyState, ErrorState, Pill, SectionTitle, Skeleton } from "@/shared/ui/display";
import { Checkbox, Input, MoneyInput } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";

export default function BanksPage() {
  const ws = useWorkspace();
  const [showInactive, setShowInactive] = createSignal(false);
  const banks = useBanks(ws.wsId, showInactive);
  const apps = useApplications(ws.wsId);
  const extras = useBoardExtras(ws.wsId);
  const info = useBankInfo(ws.wsId);
  const create = useCreateBank(ws.wsId);
  const renameBank = useRenameBank(ws.wsId);
  const setActive = useSetBankActive(ws.wsId);
  const [name, setName] = createSignal("");
  const canManage = () => ws.can("bank.manage");

  const usage = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of toBoardItems(apps.data, extras.data))
      for (const id of new Set(itemBankIds(item))) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  });

  const add = (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim()) return toast("Введите название банка.");
    create.mutate(name(), {
      onSuccess: () => {
        setName("");
        toast("Банк добавлен в справочник.");
      },
      onError: (err) => toast(errorMessage(err)),
    });
  };

  const rename = async (b: Bank) => {
    const next = await promptDialog({
      title: "Переименовать банк",
      label: "Название банка",
      initial: b.name,
    });
    if (next && next !== b.name)
      renameBank.mutate(
        { id: b.id, name: next },
        { onError: (err) => toast(errorMessage(err)), onSuccess: () => toast("Название обновлено.") },
      );
  };

  return (
    <>
      <PageHeader
        eyebrow="Справочник"
        title="Банки"
        description="Управляйте списком банков, используемых в заявках."
      />
      <SectionTitle
        title="Справочник банков"
        text="Активные банки доступны в форме заявки и при добавлении запросов в банк."
        actions={<Checkbox checked={showInactive()} onChange={setShowInactive} label="Показать неактивные" />}
      />
      <Show when={canManage()}>
        <div class="card mb-[15px] p-[18px]">
          <h3 class="m-0 mb-[5px] text-sm font-bold">Добавить банк</h3>
          <p class="m-0 mb-3.5 text-[11px] text-muted">
            Введите название банка, чтобы использовать его в новых заявках.
          </p>
          <form
            class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 max-sm:grid-cols-1"
            onSubmit={add}
          >
            <label class="field">
              Название банка
              <Input value={name()} onValue={setName} placeholder="Например, Банк Город" maxlength={255} />
            </label>
            <Button type="submit" variant="primary" loading={create.isPending}>
              <Plus size={15} /> Добавить банк
            </Button>
          </form>
        </div>
      </Show>
      <Show
        when={!banks.isError}
        fallback={<ErrorState message={errorMessage(banks.error)} onRetry={() => void banks.refetch()} />}
      >
        <div class="card px-4">
          <Show when={!banks.isLoading} fallback={<Skeleton lines={5} class="py-4" />}>
            <For each={banks.data} fallback={<EmptyState title="Банков пока нет." />}>
              {(b) => (
                <div class="flex flex-wrap items-center gap-3 border-b border-line py-[13px] last:border-b-0">
                  <Avatar name="Б" square size={34} class="!bg-[#edf2ff] !text-[#385aa5]" />
                  <div class="min-w-0 flex-1">
                    <strong class="flex flex-wrap items-center gap-1.5 text-xs">
                      {b.name}
                      <Show when={b.is_global}>
                        <Pill tone="blue" title="Общий банк для всех воркспейсов">
                          <Globe size={10} /> глобальный
                        </Pill>
                      </Show>
                      <Show when={!b.is_active}>
                        <Pill tone="gray">неактивен</Pill>
                      </Show>
                    </strong>
                    <div class="text-[11px] text-muted">
                      {b.is_active ? "Используется в формах заявок" : "Скрыт из форм заявок"}
                    </div>
                  </div>
                  <Pill tone="gray">{usage()[b.id] ?? 0} заявок</Pill>
                  <Show when={canManage()}>
                    <Show when={!b.is_global}>
                      <Button
                        size="sm"
                        variant="subtle"
                        aria-label={`Переименовать ${b.name}`}
                        onClick={() => void rename(b)}
                      >
                        <Pencil size={14} />
                      </Button>
                    </Show>
                    <Button
                      size="sm"
                      onClick={() =>
                        setActive.mutate(
                          { id: b.id, active: !b.is_active },
                          {
                            onError: (err) => toast(errorMessage(err)),
                            onSuccess: () => toast(b.is_active ? "Банк деактивирован." : "Банк активирован."),
                          },
                        )
                      }
                    >
                      {b.is_active ? "Деактивировать" : "Активировать"}
                    </Button>
                  </Show>
                  <Show when={env.useStubs}>
                    <BankLimits bankId={b.id} info={info.data?.[b.id]} disabled={!canManage()} />
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </>
  );
}

/** Лимит на клиента, срок лимита и контакт — STUB Z-05. */
function BankLimits(props: { bankId: string; info: BankInfo | undefined; disabled: boolean }) {
  const ws = useWorkspace();
  const save = useSaveBankInfo(ws.wsId);
  const [f, setF] = createStore<BankInfo>({
    limit: "",
    until: "",
    contact: "",
    ...untrack(() => props.info),
  });
  createEffect(
    on(
      () => props.info,
      (i) => i && setF({ ...i }),
      { defer: true },
    ),
  );
  const commit = () => save.mutate({ bankId: props.bankId, info: { ...f } });
  return (
    <div class="flex basis-full flex-wrap gap-2.5 pl-[46px] max-sm:pl-0">
      <label class="field w-40">
        Лимит на клиента
        <MoneyInput
          value={f.limit}
          disabled={props.disabled}
          onValue={(v) => setF("limit", v)}
          onBlur={commit}
        />
      </label>
      <label class="field w-40">
        Лимит действует до
        <Input
          type="date"
          value={f.until}
          disabled={props.disabled}
          onValue={(v) => setF("until", v)}
          onBlur={commit}
        />
      </label>
      <label class="field w-[220px]">
        Менеджер / контакт
        <Input
          value={f.contact}
          disabled={props.disabled}
          onValue={(v) => setF("contact", v)}
          onBlur={commit}
        />
      </label>
    </div>
  );
}
