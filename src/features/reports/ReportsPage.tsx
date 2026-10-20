import { ArrowUpRight, Check, Coins, Repeat } from "lucide-solid";
import { For, type JSX, Show, createEffect, createMemo, createSignal } from "solid-js";
import { errorMessage } from "@/api/errors";
import { useIssuedDetails } from "@/api/queries/applications";
import { bankName, useBanks } from "@/api/queries/banks";
import { PageHeader } from "@/app/PageHeader";
import { useWorkspace } from "@/app/workspace";
import { type Period, formatDate, presetPeriod } from "@/domain/dates";
import { formatMoney, formatNumber } from "@/domain/money";
import {
  REPORT_HEADER,
  RECON_HEADER,
  issuanceRows,
  reconLine,
  reportLine,
  rowsInPeriod,
  totals,
  totalsByBank,
} from "@/domain/reports";
import { exportXlsx } from "@/shared/lib/excel";
import { Button } from "@/shared/ui/Button";
import { EmptyState, ErrorState, KpiCard, SkeletonCards } from "@/shared/ui/display";
import { toast } from "@/shared/ui/Toast";

const dateField =
  "grid min-w-[145px] gap-[5px] text-[10px] font-[750] text-[#697586] max-sm:min-w-[135px] max-sm:flex-1";
const presetBtn =
  "btn !px-[9px] !py-2 !text-[10px] !text-[#5e6a7d] hover:!border-[#cbd8f7] hover:!bg-[#f6f8ff] hover:!text-accent";

function PeriodPicker(props: {
  value: Period;
  onChange: (p: Period) => void;
  presets: { label: string; run: () => Period }[];
  label: string;
}) {
  const set = (key: "from" | "to", v: string) => {
    const next = { ...props.value, [key]: v };
    if (next.from && next.to && next.from > next.to)
      return toast("Начало периода не может быть позже окончания.");
    props.onChange(next);
  };
  return (
    <>
      <label class={dateField}>
        С даты
        <input
          type="date"
          class="control !px-2.5 !py-[9px] !text-xs"
          aria-label={`Начало периода ${props.label}`}
          value={props.value.from}
          onChange={(e) => set("from", e.currentTarget.value)}
        />
      </label>
      <label class={dateField}>
        По дату
        <input
          type="date"
          class="control !px-2.5 !py-[9px] !text-xs"
          aria-label={`Окончание периода ${props.label}`}
          value={props.value.to}
          onChange={(e) => set("to", e.currentTarget.value)}
        />
      </label>
      <div class="flex flex-wrap gap-[5px] max-sm:basis-full">
        <For each={props.presets}>
          {(p) => (
            <button type="button" class={presetBtn} onClick={() => props.onChange(p.run())}>
              {p.label}
            </button>
          )}
        </For>
      </div>
    </>
  );
}

function DataTable(props: {
  header: string[];
  rows: (string | number)[][];
  numericFrom: number;
  empty: string;
  onExport: () => void;
}) {
  return (
    <Show when={props.rows.length} fallback={<EmptyState title="Нет записей" text={props.empty} />}>
      <div class="w-full overflow-auto rounded-[11px] border border-line bg-surface">
        <table class="data-table">
          <thead>
            <tr>
              <For each={props.header}>
                {(h, i) => <th class={i() >= props.numericFrom ? "num" : ""}>{h}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(r) => (
                <tr>
                  <For each={r}>
                    {(c, i) => (
                      <td class={typeof c === "number" || i() >= props.numericFrom ? "num" : ""}>
                        {typeof c === "number" ? formatNumber(c) : c}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="mt-2.5 flex justify-end">
        <Button size="sm" onClick={() => props.onExport()}>
          Скачать Excel
        </Button>
      </div>
    </Show>
  );
}

function Insight(props: { mark: string; title: JSX.Element; text: string }) {
  return (
    <div class="flex items-start gap-2.5 border-b border-line-soft pb-[11px] last:border-b-0 last:pb-0">
      <div class="grid h-[30px] flex-[0_0_30px] place-items-center rounded-[9px] bg-[#f0f4ff] font-extrabold text-accent">
        {props.mark}
      </div>
      <div>
        <strong class="mt-px mb-[3px] block text-xs">{props.title}</strong>
        <span class="block text-[11px] leading-snug text-muted">{props.text}</span>
      </div>
    </div>
  );
}

/** Отчёты и сверка КВ. STUB Z-16: агрегация на клиенте по деталям выданных заявок. */
export default function ReportsPage() {
  const ws = useWorkspace();
  const details = useIssuedDetails(ws.wsId);
  const banks = useBanks(ws.wsId, () => true);
  const [period, setPeriod] = createSignal<Period>(presetPeriod("month"));
  const [recon, setRecon] = createSignal<Period>(presetPeriod("month"));
  const [reconBank, setReconBank] = createSignal("");
  const nameOf = (id: string) => bankName(banks.data, id);

  createEffect(() => {
    if (!reconBank() && banks.data?.length)
      setReconBank(banks.data.find((b) => b.is_active)?.id ?? banks.data[0]!.id);
  });

  const all = createMemo(() => issuanceRows(details.data ?? []));
  const rows = createMemo(() => rowsInPeriod(all(), period()));
  const t = createMemo(() => totals(rows()));
  const byBank = createMemo(() => totalsByBank(rows()));
  const max = () => Math.max(1, ...byBank().map((b) => b.amount.toNumber()));
  const reconRows = createMemo(() => rowsInPeriod(all(), recon(), reconBank()));
  const rt = createMemo(() => totals(reconRows()));
  const lines = () => rows().map((r) => reportLine(r, nameOf));

  const exportReport = () => void exportXlsx([REPORT_HEADER, ...lines()], "otchet_vydachi");
  const exportRecon = () => void exportXlsx([RECON_HEADER, ...reconRows().map(reconLine)], "sverka_agent");

  return (
    <>
      <PageHeader
        eyebrow="Аналитика"
        title="Отчёты и сверка"
        description="Настройте даты через календарь и сравнивайте выдачи и агентское вознаграждение."
        actions={<Button onClick={exportReport}>Экспорт отчёта</Button>}
      />
      <div class="mb-4 flex flex-wrap items-end gap-[9px] rounded-xl border border-line bg-surface p-3 max-sm:items-stretch">
        <span class="mr-px self-center text-[11px] font-bold text-muted">ПЕРИОД ОТЧЁТА</span>
        <PeriodPicker
          label="отчёта"
          value={period()}
          onChange={setPeriod}
          presets={[
            { label: "Сегодня", run: () => presetPeriod("today") },
            { label: "Этот месяц", run: () => presetPeriod("month") },
            { label: "Прошлый месяц", run: () => presetPeriod("previous") },
            { label: "Этот год", run: () => presetPeriod("year") },
          ]}
        />
        <span class="ml-auto self-center text-[11px] text-muted max-lg:ml-0">По дате фактической выдачи</span>
      </div>

      <Show
        when={!details.isError}
        fallback={<ErrorState message={errorMessage(details.error)} onRetry={() => void details.refetch()} />}
      >
        <Show
          when={!details.isLoading}
          fallback={<SkeletonCards count={4} class="grid-cols-4 max-md:grid-cols-2" />}
        >
          <div class="mb-[17px] grid grid-cols-4 gap-[13px] max-md:grid-cols-2 max-sm:gap-[9px]">
            <KpiCard
              label="Выдано гарантий"
              value={t().count}
              sub={`${formatDate(period().from)} — ${formatDate(period().to)}`}
              icon={<ArrowUpRight size={16} />}
            />
            <KpiCard
              label="Сумма БГ"
              value={formatMoney(t().amount)}
              sub="Совокупный объём выдач"
              icon={<Coins size={16} />}
            />
            <KpiCard
              label="Комиссии клиентов"
              value={formatMoney(t().commission)}
              sub="Комиссия в пользу банков"
              icon={<Repeat size={16} />}
            />
            <KpiCard
              label="Вознаграждение агента"
              value={formatMoney(t().agent)}
              sub={`${t().withAgent} ${t().withAgent === 1 ? "гарантия с КВ" : "гарантий с КВ"}`}
              icon={<Check size={16} />}
            />
          </div>

          <div class="mb-4 grid grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] gap-3.5 max-md:grid-cols-1">
            <section class="card min-w-0 p-[17px] max-sm:p-[13px]">
              <h3 class="m-0 mb-1 text-sm font-bold">Распределение по банкам</h3>
              <div class="mb-[15px] text-[11px] text-muted">
                Сумма выданных гарантий · {byBank().length} {byBank().length === 1 ? "банк" : "банков"}
              </div>
              <Show
                when={byBank().length}
                fallback={
                  <EmptyState
                    title="Пока нет выдач за период"
                    text="Измените диапазон дат или добавьте данные выдачи."
                  />
                }
              >
                <div class="grid gap-3.5">
                  <For each={byBank()}>
                    {(b) => (
                      <div class="grid grid-cols-[minmax(74px,120px)_minmax(50px,1fr)_auto] items-center gap-2.5 max-sm:grid-cols-[80px_minmax(30px,1fr)_auto] max-sm:gap-[7px]">
                        <div class="text-xs font-[650] [overflow-wrap:anywhere]">{nameOf(b.bankId)}</div>
                        <div
                          class="h-[9px] overflow-hidden rounded-full bg-[#eef1f6]"
                          role="img"
                          aria-label={`${nameOf(b.bankId)}: ${formatMoney(b.amount)}`}
                        >
                          <div
                            class="h-full rounded-full bg-[linear-gradient(90deg,#507be4,#86a4f4)]"
                            style={{ width: `${Math.max(1, (b.amount.toNumber() / max()) * 100)}%` }}
                          />
                        </div>
                        <div class="text-[11px] whitespace-nowrap text-muted tabular">
                          {formatMoney(b.amount)}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
            <section class="card min-w-0 p-[17px] max-sm:p-[13px]">
              <h3 class="m-0 mb-1 text-sm font-bold">Ключевые показатели</h3>
              <div class="mb-[15px] text-[11px] text-muted">Короткая сводка по выбранному периоду</div>
              <div class="grid gap-[11px]">
                <Insight
                  mark="№"
                  title={`${t().count ? formatMoney(t().amount.div(t().count)) : "0 ₽"} — средняя сумма БГ`}
                  text="Средний размер одной гарантии по выдачам."
                />
                <Insight
                  mark="%"
                  title={`${t().amount.gt(0) ? formatNumber(t().agent.div(t().amount).times(100).round(2)) : "0"}% — КВ от суммы БГ`}
                  text="Общий размер агентского вознаграждения относительно объёма выдач."
                />
                <Insight
                  mark="Б"
                  title={byBank()[0] ? nameOf(byBank()[0]!.bankId) : "Нет лидирующего банка"}
                  text={
                    byBank()[0]
                      ? `${byBank()[0]!.count} выдач · ${formatMoney(byBank()[0]!.amount)} суммарно`
                      : "Добавьте или выдайте гарантию, чтобы сравнить банки."
                  }
                />
              </div>
            </section>
          </div>

          <details class="card mt-3.5 mb-[18px] overflow-hidden p-0">
            <summary class="cursor-pointer px-4 py-3.5 text-xs font-bold">
              Детализация всех выдач · {rows().length} {rows().length === 1 ? "запись" : "записей"}
            </summary>
            <div class="border-t border-line px-3.5 pt-3.5 pb-3.5">
              <DataTable
                header={REPORT_HEADER}
                rows={lines()}
                numericFrom={8}
                empty="В этом периоде пока нет фактических выдач."
                onExport={exportReport}
              />
            </div>
          </details>

          <div class="mt-6 mb-3 flex items-start justify-between gap-3.5 max-sm:block">
            <div>
              <h2 class="m-0 mb-1 text-base font-bold">Сверка агентского вознаграждения</h2>
              <p class="m-0 text-xs text-muted">
                Выберите банк и диапазон фактических дат выдачи для сверки.
              </p>
            </div>
            <div class="flex flex-wrap items-end gap-2 max-sm:mt-3 max-sm:grid max-sm:grid-cols-2">
              <label class={dateField}>
                Банк
                <select
                  class="control !px-2.5 !py-[9px] !text-xs"
                  aria-label="Банк для сверки"
                  value={reconBank()}
                  onChange={(e) => setReconBank(e.currentTarget.value)}
                >
                  <For each={banks.data ?? []}>
                    {(b) => (
                      <option value={b.id} selected={b.id === reconBank()}>
                        {b.name}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <PeriodPicker
                label="сверки"
                value={recon()}
                onChange={setRecon}
                presets={[
                  { label: "Этот месяц", run: () => presetPeriod("month") },
                  { label: "Прошлый месяц", run: () => presetPeriod("previous") },
                  { label: "Как в отчёте", run: () => ({ ...period() }) },
                ]}
              />
              <Button onClick={exportRecon}>Excel</Button>
            </div>
          </div>
          <div class="mb-3 flex flex-wrap gap-[11px]">
            <div class="card min-w-[155px] flex-1 px-[15px] py-3">
              <span class="text-[11px] text-muted">Количество выдач</span>
              <strong class="mt-1 block text-lg tabular">{rt().count}</strong>
            </div>
            <div class="card min-w-[155px] flex-1 px-[15px] py-3">
              <span class="text-[11px] text-muted">Комиссии клиентов</span>
              <strong class="mt-1 block text-lg tabular">{formatMoney(rt().commission)}</strong>
            </div>
            <div class="card min-w-[155px] flex-1 px-[15px] py-3">
              <span class="text-[11px] text-muted">КВ к сверке</span>
              <strong class="mt-1 block text-lg tabular">{formatMoney(rt().agent)}</strong>
            </div>
          </div>
          <DataTable
            header={RECON_HEADER}
            rows={reconRows().map(reconLine)}
            numericFrom={3}
            empty="За выбранный банк и даты выдач не найдено."
            onExport={exportRecon}
          />
        </Show>
      </Show>
    </>
  );
}
