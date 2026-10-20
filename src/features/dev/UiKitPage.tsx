import { createSignal } from "solid-js";
import { Button } from "@/shared/ui/Button";
import { Dialog, confirmDialog } from "@/shared/ui/Dialog";
import { Avatar, EmptyState, KpiCard, Notice, Pill, Skeleton, Spinner } from "@/shared/ui/display";
import { FilterDropdown } from "@/shared/ui/FilterDropdown";
import { Checkbox, Field, Input, MoneyInput, SegmentedControl, Select, Textarea } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";

/** Демо-страница UI-кита (только dev-сборка): /dev/ui */
export default function UiKitPage() {
  const [money, setMoney] = createSignal("1250000.5");
  const [seg, setSeg] = createSignal<"a" | "b" | null>("a");
  const [check, setCheck] = createSignal(true);
  const [sel, setSel] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal(false);
  return (
    <div class="mx-auto grid max-w-[960px] gap-6 p-8">
      <h1 class="m-0 text-2xl font-bold">UI-кит</h1>
      <section class="flex flex-wrap gap-2">
        <Button>Default</Button>
        <Button variant="primary">Primary</Button>
        <Button variant="subtle">Subtle</Button>
        <Button variant="danger">Danger</Button>
        <Button size="sm">Small</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </section>
      <section class="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Field label="Input" hint="Подсказка">
          {(id) => <Input id={id} placeholder="Текст" />}
        </Field>
        <Field label="С ошибкой" error="Обязательное поле">
          {(id) => <Input id={id} invalid />}
        </Field>
        <Field label="Деньги">{(id) => <MoneyInput id={id} value={money()} onValue={setMoney} />}</Field>
        <Field label="Select">
          {(id) => <Select id={id} placeholder="Не выбран" options={[{ value: "1", label: "Один" }]} />}
        </Field>
        <Field label="Дата">{(id) => <Input id={id} type="date" />}</Field>
        <Field label="Textarea">{(id) => <Textarea id={id} rows={2} />}</Field>
      </section>
      <section class="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Демо"
          value={seg()}
          onChange={setSeg}
          allowReset
          options={[
            { value: "a", label: "Ставку, %" },
            { value: "b", label: "Сумму, ₽" },
          ]}
        />
        <Checkbox checked={check()} onChange={setCheck} label="Чекбокс" />
        <FilterDropdown
          name="Банк"
          options={[
            { value: "a", label: "Банк А", count: 3 },
            { value: "b", label: "Банк Б", count: 1 },
          ]}
          selected={sel()}
          onToggle={(v) => setSel(sel().includes(v) ? sel().filter((x) => x !== v) : [...sel(), v])}
          onClear={() => setSel([])}
        />
        <Pill>blue</Pill>
        <Pill tone="green">green</Pill>
        <Pill tone="amber">amber</Pill>
        <Pill tone="red">red</Pill>
        <Pill tone="gray">gray</Pill>
        <Avatar name="Анна Иванова" />
        <Spinner />
      </section>
      <section class="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <KpiCard label="KPI" value="12" sub="подпись" />
        <KpiCard label="Сумма" value="1 250 000 ₽" />
      </section>
      <Skeleton lines={3} />
      <Notice>Notice — информационный блок.</Notice>
      <EmptyState title="Пусто" text="Текст пустого состояния." />
      <section class="flex gap-2">
        <Button onClick={() => toast("Тост на 3 секунды")}>Тост</Button>
        <Button onClick={() => void confirmDialog({ title: "Подтвердите", text: "Точно?" })}>Confirm</Button>
        <Button onClick={() => setOpen(true)}>Dialog</Button>
      </section>
      <Dialog open={open()} onOpenChange={setOpen} title="Диалог" description="Описание">
        Содержимое диалога.
      </Dialog>
    </div>
  );
}
