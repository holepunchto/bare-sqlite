import Buffer from 'bare-buffer'

interface SQLiteStatementSync {
  readonly sourceSQL: string
  readonly expandedSQL: string | null

  all<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): T[]

  values<T extends SQLiteStatementSync.Value[] = SQLiteStatementSync.Value[]>(
    ...params: SQLiteStatementSync.Parameters
  ): T[]

  get<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): T | undefined

  run(...params: SQLiteStatementSync.Parameters): SQLiteStatementSync.RunResult

  iterate<T extends SQLiteStatementSync.Row = SQLiteStatementSync.Row>(
    ...params: SQLiteStatementSync.Parameters
  ): IterableIterator<T>

  columns(): SQLiteStatementSync.Column[]

  setAllowBareNamedParameters(allow: boolean): void
  setAllowUnknownNamedParameters(allow: boolean): void
  setReadBigInts(enabled: boolean): void

  [Symbol.dispose](): void
}

declare class SQLiteStatementSync {}

declare namespace SQLiteStatementSync {
  export type Value = null | number | bigint | string | Buffer

  export type BindValue =
    | null
    | undefined
    | number
    | bigint
    | string
    | ArrayBuffer
    | ArrayBufferView

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
