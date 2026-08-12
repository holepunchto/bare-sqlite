import Buffer from 'bare-buffer'

interface SQLiteStatementSync {
  /** The original SQL string that the statement was compiled from. */
  readonly sourceSQL: string
  /** The SQL with bound parameter values substituted in, or `null` if SQLite couldn't expand it. */
  readonly expandedSQL: string | null

  /** Execute the statement and return all rows as an array of objects keyed by column name. */
  all<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): T[]

  /**
   * Execute the statement and return all rows as an array of value tuples, one per row, in the
   * order given by `stmt.columns()`. Cheaper than `stmt.all()` when column names aren't needed.
   */
  values<T extends SQLiteStatementSync.Value[] = SQLiteStatementSync.Value[]>(
    ...params: SQLiteStatementSync.Parameters
  ): T[]

  /** Execute the statement and return the first row, or `undefined` if there are no rows. */
  get<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): T | undefined

  /**
   * Execute the statement and return a result object with `changes` (the number of rows modified)
   * and `lastInsertRowid`.
   */
  run(...params: SQLiteStatementSync.Parameters): SQLiteStatementSync.RunResult

  /**
   * Execute the statement and return an iterator that yields result rows one at a time as objects
   * keyed by column name.
   */
  iterate<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): IterableIterator<T>

  /**
   * Return an array describing the statement's result columns.
   * @returns An array describing the statement result columns.
   */
  columns(): SQLiteStatementSync.Column[]

  /**
   * When `true` (the default), named-parameter lookup falls back to the bare key when the
   * sigil-prefixed key (`':foo'`) is not found. When `false`, only sigil-prefixed keys are
   * considered.
   * @param allow - When `true` (the default), named-parameter lookup falls back to the bare key
   * when the sigil-prefixed key is not found; when `false`, only sigil-prefixed keys match.
   */
  setAllowBareNamedParameters(allow: boolean): void
  /**
   * When `false` (the default), passing a named-parameters object with keys that don't correspond
   * to any placeholder throws `INVALID_ARGUMENT`. When `true`, extras are silently ignored.
   * @param allow - When `false` (the default), unknown named-parameter keys throw; when `true`,
   * they are silently ignored.
   */
  setAllowUnknownNamedParameters(allow: boolean): void
  /**
   * When `true`, `INTEGER` columns are returned as `BigInt` rather than `Number`. `changes` and
   * `lastInsertRowid` from `stmt.run()` are returned as `BigInt` too. Default is `false`.
   * @param enabled - When `true`, `INTEGER` columns (and the `changes`/`lastInsertRowid` from
   * `run()`) are returned as `BigInt` rather than `Number` (default `false`).
   */
  setReadBigInts(enabled: boolean): void

  [Symbol.dispose](): void
}

declare class SQLiteStatementSync {}

declare namespace SQLiteStatementSync {
  export type Value = null | number | bigint | string | Buffer

  export type BindValue =
    null | undefined | number | bigint | string | ArrayBuffer | ArrayBufferView

  export type Row = Record<string, Value>

  export type NamedParameters = Record<string, BindValue>

  export type Parameters = [NamedParameters, ...BindValue[]] | BindValue[]

  export interface RunResult {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export interface Column {
    column: string | null
    name: string | null
    database: string | null
    table: string | null
    type: string | null
  }
}

export = SQLiteStatementSync
