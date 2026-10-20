import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function login(page: import("@playwright/test").Page) {
  await page.getByLabel("Рабочая почта").fill("demo@garant.local");
  await page.getByLabel("Пароль").fill("demo12345");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Сегодня" })).toBeVisible();
}

test("вход и доска заявок", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Доска" }).first().click();
  await expect(page.getByRole("heading", { name: "Доска заявок" })).toBeVisible();
  await expect(page.getByLabel("Колонка «В работе»")).toBeVisible();
  await page.getByLabel("Поиск по заявкам").fill("ромашка");
  await expect(page.getByText("Найдено заявок: 1.")).toBeVisible();
});

test("создание заявки по НДС", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Доска" }).first().click();
  await page.getByRole("button", { name: "Новая заявка" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Тип закупки").selectOption("vat");
  await dialog.getByRole("combobox", { name: /Принципал/ }).fill("ООО Тест");
  await dialog.getByLabel("ИНН принципала").fill("7707083893");
  await dialog.getByLabel("Сумма БГ").fill("250 000");
  await dialog.getByRole("button", { name: "Создать заявку" }).click();
  await expect(dialog.getByText(/Заявка № \d+/)).toBeVisible();
  await expect(dialog.getByLabel("Бенефициар")).toHaveValue("ФНС");
});

test("архивация и возврат в работу через меню карточки", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Доска" }).first().click();
  const card = page.getByRole("button", { name: /Открыть заявку № 5/ });
  await card.getByRole("button", { name: "Переместить в…" }).click();
  await page.getByRole("menuitem", { name: "Архив" }).click();
  await page.getByLabel("Причина").fill("Клиент передумал");
  await page.getByRole("button", { name: "В архив" }).click();
  await expect(page.getByText("статус «Архив»")).toBeVisible();
});
