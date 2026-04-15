import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import { runStorageMigrations } from "./migrations.js";

const defaultDatabaseFilename = "claude-usage.sqlite3";

export type AppDatabase = DatabaseSync;

export interface OpenAppDatabaseOptions {
  readonly baseDir?: string;
  readonly filename?: string;
  readonly path?: string;
  readonly inMemory?: boolean;
  readonly migrate?: boolean;
}

export interface OpenedAppDatabase {
  readonly database: AppDatabase;
  readonly path: string;
  readonly close: () => void;
}

export function resolveAppDatabasePath(options: OpenAppDatabaseOptions = {}): string {
  if (options.inMemory) {
    return ":memory:";
  }

  if (options.path) {
    return options.path;
  }

  const baseDir = options.baseDir ?? app.getPath("userData");
  const filename = options.filename ?? defaultDatabaseFilename;
  return join(baseDir, filename);
}

export function openAppDatabase(options: OpenAppDatabaseOptions = {}): OpenedAppDatabase {
  const databasePath = resolveAppDatabasePath(options);

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  configureDatabase(database);

  if (options.migrate ?? true) {
    runStorageMigrations(database);
  }

  return {
    database,
    path: databasePath,
    close: () => {
      database.close();
    }
  };
}

function configureDatabase(database: AppDatabase): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
}
