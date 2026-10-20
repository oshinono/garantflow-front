import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationSummary } from "@/domain/types";
import { ArchiveDialog } from "../TransitionDialogs";

const app = { id: "a1", number: "7", client_name: "ООО Ромашка" } as ApplicationSummary;

describe("ArchiveDialog", () => {
  it("передаёт причину и ответ «Клиент получил БГ самостоятельно»", async () => {
    const onConfirm = vi.fn();
    render(() => <ArchiveDialog app={app} onCancel={() => {}} onConfirm={onConfirm} />);
    expect(await screen.findByText("Перенести в архив")).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("Причина"), { target: { value: "Отказ банков" } });
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    fireEvent.click(screen.getByRole("button", { name: "В архив" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Отказ банков", self: true });
  });

  it("по умолчанию — «Не указано»", async () => {
    const onConfirm = vi.fn();
    render(() => <ArchiveDialog app={app} onCancel={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(await screen.findByRole("button", { name: "В архив" }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "", self: null });
  });
});
