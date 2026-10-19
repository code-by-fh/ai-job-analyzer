import type { Locator } from "@playwright/test";
import { expect } from "./test";

// The prototype's page (FOUND_LINKS): two postings share the pattern the server derives.
export const CHOSEN_LINKS = [
  "Senior Java Developer (m/w/d) – Hamburg",
  "Backend-Entwickler Kotlin",
];
export const DERIVED_PATTERN = "/jobsuche/p/";

/** Step 2 as a user does it: two example postings, the derived pattern confirmed. */
export async function chooseLinksAndConfirm(wizard: Locator): Promise<void> {
  const list = wizard.getByRole("list", { name: "Stellenlinks wählen" });
  await list.getByRole("checkbox", { name: CHOSEN_LINKS[0] }).check();
  await list.getByRole("checkbox", { name: CHOSEN_LINKS[1] }).check();
  await expect(wizard.getByLabel("URL-Muster")).toHaveValue(DERIVED_PATTERN);
  await wizard.getByRole("checkbox", { name: "Muster passt" }).check();
}
