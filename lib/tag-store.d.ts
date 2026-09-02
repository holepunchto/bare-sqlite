import DatabaseSync from './database-sync'
import StatementSync from './statement-sync'

interface SQLiteTagStore {
  /** The `DatabaseSync` this store prepares statements against. */
  readonly db: DatabaseSync
  /** The number of prepared statements currently cached. */
  readonly size: number
  /**
   * The maximum number of statements the cache holds before evicting the least-recently-used entry.
   */
  readonly capacity: number

  /** Execute the statement and return all rows as an array of objects keyed by column name. */
  all<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T[]

  /**
   * Execute the statement and return all rows as an array of value tuples, one per row, in the
   * order given by `stmt.columns()`. Cheaper than `stmt.all()` when column names aren't needed.
   */
  values<T extends StatementSync.Value[] = StatementSync.Value[]>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T[]

  /** Execute the statement and return the first row, or `undefined` if there are no rows. */
  get<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T | undefined

  /**
   * Execute the statement and return an iterator that yields result rows one at a time as objects
   * keyed by column name.
   */
  iterate<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): IterableIterator<T>

  /**
   * Execute the statement and return a result object with `changes` (the number of rows modified)
   * and `lastInsertRowid`.
   */
  run(strings: readonly string[], ...params: StatementSync.BindValue[]): StatementSync.RunResult

  /** Evict all cached prepared statements. */
  clear(): void
}

declare class SQLiteTagStore {}

export = SQLiteTagStore
