interface SQLiteError extends Error {
  readonly code: string
}

declare class SQLiteError {}

export = SQLiteError
