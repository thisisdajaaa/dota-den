import { expect, type Locator, type Page } from "@playwright/test";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Picks a day ("YYYY-MM-DD") in a DatePicker (src/components/ui/date-picker.tsx): opens it
 * from its labelled button, jumps with the month and year dropdowns, then clicks the day.
 */
export async function pickDate(page: Page, trigger: Locator, day: string) {
  const [y, m] = day.split("-").map(Number);
  await trigger.click();
  const calendar = page.locator('[data-slot="popover-content"]');
  await expect(calendar).toBeVisible();
  await calendar.getByRole("combobox", { name: "Year" }).selectOption(String(y));
  await calendar.getByRole("combobox", { name: "Month" }).selectOption(String(m - 1));
  const full = new Intl.DateTimeFormat("en", { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
  await calendar.getByRole("button", { name: new RegExp(escape(full)) }).click();
  await expect(calendar).toBeHidden();
}
