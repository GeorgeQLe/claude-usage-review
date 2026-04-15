import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AccountAuthStatus, AccountId, AccountSummary } from "../../shared/types/accounts.js";

export interface AccountStoreOptions {
  readonly database: DatabaseSync;
  readonly idFactory?: () => AccountId;
  readonly now?: () => string;
}

export interface AddAccountInput {
  readonly label: string;
  readonly orgId?: string | null;
}

export interface AccountStore {
  readonly addAccount: (input: AddAccountInput) => AccountSummary;
  readonly renameAccount: (accountId: AccountId, label: string) => AccountSummary;
  readonly removeAccount: (accountId: AccountId) => readonly AccountSummary[];
  readonly setActiveAccount: (accountId: AccountId) => readonly AccountSummary[];
  readonly saveOrgId: (accountId: AccountId, orgId: string) => AccountSummary;
  readonly listAccounts: () => readonly AccountSummary[];
  readonly getActiveAccount: () => AccountSummary | null;
}

interface AccountRow {
  readonly id: string;
  readonly label: string;
  readonly org_id: string | null;
  readonly is_active: 0 | 1;
  readonly auth_status: AccountAuthStatus;
}

export function createAccountStore(options: AccountStoreOptions): AccountStore {
  const database = options.database;
  const idFactory = options.idFactory ?? createDefaultAccountId;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    addAccount: (input: AddAccountInput): AccountSummary => {
      const timestamp = now();
      const accountId = idFactory();
      const shouldActivate = listAccountRows(database).length === 0;

      database
        .prepare(
          `
            INSERT INTO accounts (id, label, org_id, is_active, auth_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'missing_credentials', ?, ?);
          `
        )
        .run(accountId, input.label, input.orgId ?? null, shouldActivate ? 1 : 0, timestamp, timestamp);

      normalizeActiveAccount(database, now);
      return getAccountOrThrow(database, accountId);
    },
    renameAccount: (accountId: AccountId, label: string): AccountSummary => {
      assertKnownAccount(database, accountId);

      database
        .prepare("UPDATE accounts SET label = ?, updated_at = ? WHERE id = ?;")
        .run(label, now(), accountId);

      return getAccountOrThrow(database, accountId);
    },
    removeAccount: (accountId: AccountId): readonly AccountSummary[] => {
      assertKnownAccount(database, accountId);

      database.prepare("DELETE FROM accounts WHERE id = ?;").run(accountId);
      normalizeActiveAccount(database, now);
      return listAccounts(database);
    },
    setActiveAccount: (accountId: AccountId): readonly AccountSummary[] => {
      assertKnownAccount(database, accountId);

      const timestamp = now();
      database.exec("BEGIN IMMEDIATE;");
      try {
        database.prepare("UPDATE accounts SET is_active = 0, updated_at = ? WHERE is_active = 1;").run(timestamp);
        database.prepare("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?;").run(timestamp, accountId);
        database.exec("COMMIT;");
      } catch (error) {
        database.exec("ROLLBACK;");
        throw error;
      }

      return listAccounts(database);
    },
    saveOrgId: (accountId: AccountId, orgId: string): AccountSummary => {
      assertKnownAccount(database, accountId);

      database
        .prepare("UPDATE accounts SET org_id = ?, updated_at = ? WHERE id = ?;")
        .run(orgId, now(), accountId);

      return getAccountOrThrow(database, accountId);
    },
    listAccounts: () => listAccounts(database),
    getActiveAccount: () => listAccounts(database).find((account) => account.isActive) ?? null
  };
}

function listAccounts(database: DatabaseSync): readonly AccountSummary[] {
  return listAccountRows(database).map(mapAccountRow);
}

function listAccountRows(database: DatabaseSync): readonly AccountRow[] {
  return database
    .prepare(
      `
        SELECT id, label, org_id, is_active, auth_status
        FROM accounts
        ORDER BY created_at ASC, id ASC;
      `
    )
    .all() as unknown as AccountRow[];
}

function getAccountOrThrow(database: DatabaseSync, accountId: AccountId): AccountSummary {
  const row = database
    .prepare(
      `
        SELECT id, label, org_id, is_active, auth_status
        FROM accounts
        WHERE id = ?;
      `
    )
    .get(accountId) as AccountRow | undefined;

  if (!row) {
    throw new Error(`Unknown account: ${accountId}`);
  }

  return mapAccountRow(row);
}

function assertKnownAccount(database: DatabaseSync, accountId: AccountId): void {
  getAccountOrThrow(database, accountId);
}

function normalizeActiveAccount(database: DatabaseSync, now: () => string): void {
  const rows = listAccountRows(database);

  if (rows.length === 0) {
    return;
  }

  const activeAccountId = rows.find((row) => row.is_active === 1)?.id ?? rows[0]?.id;
  if (!activeAccountId) {
    return;
  }

  const timestamp = now();
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.prepare("UPDATE accounts SET is_active = 0, updated_at = ? WHERE is_active = 1;").run(timestamp);
    database.prepare("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?;").run(timestamp, activeAccountId);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function mapAccountRow(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    label: row.label,
    orgId: row.org_id,
    isActive: row.is_active === 1,
    authStatus: row.auth_status
  };
}

function createDefaultAccountId(): AccountId {
  return `account-${randomUUID()}`;
}
