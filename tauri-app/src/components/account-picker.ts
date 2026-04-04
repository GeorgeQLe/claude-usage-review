import { AccountInfo } from "../types";

export function createAccountPicker(
  accounts: AccountInfo[],
  onSelect: (id: string) => void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "account-picker";

  accounts.forEach((account) => {
    const btn = document.createElement("button");
    btn.className = `account-picker-btn ${account.is_active ? "active" : ""}`;
    btn.textContent = account.name;
    btn.addEventListener("click", () => onSelect(account.id));
    container.appendChild(btn);
  });

  return container;
}
