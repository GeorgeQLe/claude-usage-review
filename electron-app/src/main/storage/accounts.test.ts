import { afterEach, describe, expect, it } from "vitest";
import { openAppDatabase, type OpenedAppDatabase } from "./database.js";

interface AccountStore {
  readonly addAccount: (input: { readonly label: string; readonly orgId?: string | null }) => AccountSummary;
  readonly renameAccount: (accountId: string, label: string) => AccountSummary;
  readonly removeAccount: (accountId: string) => readonly AccountSummary[];
  readonly setActiveAccount: (accountId: string) => readonly AccountSummary[];
  readonly saveOrgId: (accountId: string, orgId: string) => AccountSummary;
  readonly listAccounts: () => readonly AccountSummary[];
  readonly getActiveAccount: () => AccountSummary | null;
}

interface AccountSummary {
  readonly id: string;
  readonly label: string;
  readonly orgId: string | null;
  readonly isActive: boolean;
  readonly authStatus: "missing_credentials" | "configured" | "expired";
}

interface AccountsModule {
  readonly createAccountStore: (options: {
    readonly database: OpenedAppDatabase["database"];
    readonly idFactory?: () => string;
    readonly now?: () => string;
  }) => AccountStore;
}

const accountsModuleSpecifier = "./accounts.js";
let opened: OpenedAppDatabase | null = null;

describe("account metadata storage contract", () => {
  afterEach(() => {
    opened?.close();
    opened = null;
  });

  it("adds, renames, switches, and reloads account metadata without session keys", async () => {
    const store = await createStore(["account-1", "account-2"]);

    const personal = store.addAccount({ label: "Personal", orgId: "org_personal" });
    const work = store.addAccount({ label: "Work", orgId: "org_work" });
    store.renameAccount(work.id, "Client Work");
    store.setActiveAccount(work.id);

    expect(personal).toMatchObject({
      id: "account-1",
      isActive: true,
      label: "Personal",
      orgId: "org_personal"
    });
    expect(store.getActiveAccount()).toMatchObject({
      id: "account-2",
      isActive: true,
      label: "Client Work",
      orgId: "org_work"
    });

    const reloaded = await createStore();
    expect(reloaded.listAccounts()).toEqual([
      {
        id: "account-1",
        label: "Personal",
        orgId: "org_personal",
        isActive: false,
        authStatus: "missing_credentials"
      },
      {
        id: "account-2",
        label: "Client Work",
        orgId: "org_work",
        isActive: true,
        authStatus: "missing_credentials"
      }
    ]);
    expect(JSON.stringify(reloaded.listAccounts())).not.toContain("sessionKey");
  });

  it("normalizes the active account after deleting the active row", async () => {
    const store = await createStore(["account-1", "account-2", "account-3"]);
    const first = store.addAccount({ label: "First" });
    const second = store.addAccount({ label: "Second" });
    const third = store.addAccount({ label: "Third" });

    store.setActiveAccount(second.id);
    const remaining = store.removeAccount(second.id);

    expect(remaining).toEqual([
      { ...first, isActive: true },
      { ...third, isActive: false }
    ]);
    expect(store.getActiveAccount()?.id).toBe(first.id);
  });

  it("stores Claude org IDs as metadata while leaving credential material to the secret store", async () => {
    const store = await createStore(["account-1"]);
    const account = store.addAccount({ label: "Work" });

    const updated = store.saveOrgId(account.id, "org_123");

    expect(updated).toMatchObject({
      id: "account-1",
      orgId: "org_123"
    });
    expect(Object.keys(updated)).not.toContain("sessionKey");
    expect(JSON.stringify(store.listAccounts())).not.toContain("sk-ant-sid01");
  });
});

async function createStore(ids: readonly string[] = []): Promise<AccountStore> {
  if (!opened) {
    opened = openAppDatabase({ inMemory: true });
  }

  const { createAccountStore } = await loadAccountsModule();
  const queue = [...ids];
  return createAccountStore({
    database: opened.database,
    idFactory: () => queue.shift() ?? `generated-${queue.length}`,
    now: () => "2026-04-15T12:00:00.000Z"
  });
}

async function loadAccountsModule(): Promise<AccountsModule> {
  return import(accountsModuleSpecifier) as Promise<AccountsModule>;
}
