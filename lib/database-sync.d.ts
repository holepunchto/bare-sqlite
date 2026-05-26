import StatementSync from './statement-sync'

interface SQLiteDatabaseSync {
  readonly isOpen: boolean

  open(): void
  close(): void

  exec(sql: string): void
  prepare(sql: string): StatementSync

  enableLoadExtension(allow: boolean): void
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
