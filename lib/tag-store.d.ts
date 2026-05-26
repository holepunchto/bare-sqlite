import DatabaseSync from './database-sync'
import StatementSync from './statement-sync'

interface SQLiteTagStore {
  readonly db: DatabaseSync
  readonly size: number
  readonly capacity: number

  all<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T[]

  values<T extends StatementSync.Value[] = StatementSync.Value[]>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T[]

  get<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): T | undefined

  iterate<T extends StatementSync.Row = StatementSync.Row>(
    strings: readonly string[],
    ...params: StatementSync.BindValue[]
  ): IterableIterator<T>

  run(strings: readonly string[], ...params: StatementSync.BindValue[]): StatementSync.RunResult

  clear(): void
}

declare class SQLiteTagStore {}

export = SQLiteTagStore
