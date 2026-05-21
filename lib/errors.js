module.exports = class SQLiteError extends Error {
  constructor(msg, fn = SQLiteError, code = fn.name) {
    super(`${code}: ${msg}`)

    this.code = code

    if (Error.captureStackTrace) Error.captureStackTrace(this, fn)
  }

  get name() {
    return 'SQLiteError'
  }

  static DATABASE_ALREADY_OPEN(msg) {
    return new SQLiteError(msg, SQLiteError.DATABASE_ALREADY_OPEN)
  }

  static DATABASE_NOT_OPEN(msg) {
    return new SQLiteError(msg, SQLiteError.DATABASE_NOT_OPEN)
  }

  static INVALID_ARGUMENT(msg) {
    return new SQLiteError(msg, SQLiteError.INVALID_ARGUMENT)
  }

  static NOT_IMPLEMENTED(msg) {
    return new SQLiteError(msg, SQLiteError.NOT_IMPLEMENTED)
  }

  static LOAD_EXTENSION_DISABLED(msg) {
    return new SQLiteError(msg, SQLiteError.LOAD_EXTENSION_DISABLED)
  }

  static from(err) {
    if (err instanceof SQLiteError) return err

    if (err instanceof TypeError) {
      return SQLiteError.INVALID_ARGUMENT(err.message)
    }

    return new SQLiteError(err.message, SQLiteError.from, err.code || 'ERROR')
  }
}
