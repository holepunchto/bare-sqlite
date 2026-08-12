import StatementSync from './statement-sync'
import TagStore from './tag-store'

interface SQLiteDatabaseSync {
  /** `true` if the database is currently open, `false` otherwise. */
  readonly isOpen: boolean

  /**
   * Open the database. Throws if already open. Useful when the database was constructed with `open:
   * false`.
   * @throws {DATABASE_ALREADY_OPEN} the database is already open.
   */
  open(): void
  /**
   * Close the database. Throws if not open. Prepared statements that are still reachable from
   * JavaScript remain valid until they are finalized; the underlying connection is released once
   * the last statement is gone.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   */
  close(): void

  /**
   * Execute one or more SQL statements without returning rows. `sql` may contain multiple
   * statements separated by `;`.
   * @param sql - One or more SQL statements to execute, separated by `;`.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   */
  exec(sql: string): void
  /**
   * Compile `sql` into a prepared statement. The returned `StatementSync` can be reused with
   * different parameter values.
   * @param sql - The SQL to compile into a reusable prepared statement.
   * @returns A `StatementSync` that can be reused with different parameter values.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   */
  prepare(sql: string): StatementSync

  /**
   * Create an LRU cache of prepared statements keyed on the SQL string produced by a tagged
   * template. `maxSize` defaults to `1000`. The returned store exposes `sql.all`, `sql.get`,
   * `sql.iterate`, and `sql.run` as tag functions; placeholder values are bound positionally.
   * @param maxSize - Maximum number of cached prepared statements before the least-recently-used
   * entry is evicted (default `1000`).
   * @returns A `TagStore` exposing `all`, `get`, `iterate`, and `run` as tagged-template functions.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   * @throws {INVALID_ARGUMENT} `maxSize` is not a positive integer.
   */
  createTagStore(maxSize?: number): TagStore

  /**
   * Toggle extension loading at runtime. Useful for enabling extension loading during setup and
   * disabling it before running user-supplied SQL. Throws if `allowExtension` was not enabled at
   * construction.
   * @param allow - When `true`, enable extension loading; when `false`, disable it.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   * @throws {LOAD_EXTENSION_DISABLED} `allowExtension` was not enabled at construction.
   */
  enableLoadExtension(allow: boolean): void
  /**
   * Load an SQLite extension from `path`. `entryPoint` is the C initialization function name; when
   * omitted, SQLite derives it from the filename. Throws if `allowExtension` was not enabled at
   * construction.
   * @param path - Path to the shared library implementing the SQLite extension.
   * @param entryPoint - Name of the C initialization function to call; when omitted (`null`),
   * SQLite derives it from the filename.
   * @throws {DATABASE_NOT_OPEN} the database is not open.
   * @throws {LOAD_EXTENSION_DISABLED} `allowExtension` was not enabled at construction.
   */
  loadExtension(path: string, entryPoint?: string | null): void

  [Symbol.dispose](): void
}

declare class SQLiteDatabaseSync {
  constructor(location: string, opts?: SQLiteDatabaseSync.Options)
}

declare namespace SQLiteDatabaseSync {
  export interface Options {
    open?: boolean
    readOnly?: boolean
    enableForeignKeyConstraints?: boolean
    enableDoubleQuotedStringLiterals?: boolean
    allowExtension?: boolean
    timeout?: number
  }
}

export = SQLiteDatabaseSync
