const binding = require('../binding')
const errors = require('./errors')

module.exports = class SQLiteStatementSync {
  constructor(db, sql) {
    this._db = db
    this._sourceSQL = sql

    try {
      this._handle = binding.prepare(db._handle, sql)
    } catch (err) {
      throw errors.from(err)
    }
  }

  [Symbol.dispose]() {
    if (this._handle === null) return

    binding.finalize(this._handle)
    this._handle = null
  }

  get sourceSQL() {
    return this._sourceSQL
  }

  get expandedSQL() {
    return binding.expandedSQL(this._handle)
  }

  all(...params) {
    const [named, positional] = splitParameters(params)

    try {
      const rows = binding.all(this._handle, named, positional)
      for (const row of rows) wrapBlobRow(row)
      return rows
    } catch (err) {
      throw errors.from(err)
    }
  }

  values(...params) {
    const [named, positional] = splitParameters(params)

    try {
      const rows = binding.values(this._handle, named, positional)
      for (const row of rows) wrapBlobValues(row)
      return rows
    } catch (err) {
      throw errors.from(err)
    }
  }

  get(...params) {
    const [named, positional] = splitParameters(params)

    try {
      const row = binding.get(this._handle, named, positional)
      return row === undefined ? undefined : wrapBlobRow(row)
    } catch (err) {
      throw errors.from(err)
    }
  }

  run(...params) {
    const [named, positional] = splitParameters(params)

    try {
      return binding.run(this._handle, named, positional)
    } catch (err) {
      throw errors.from(err)
    }
  }

  *iterate(...params) {
    const [named, positional] = splitParameters(params)

    try {
      binding.bind(this._handle, named, positional)

      let row
      while ((row = binding.step(this._handle)) !== undefined) {
        yield wrapBlobRow(row)
      }
    } catch (err) {
      throw errors.from(err)
    } finally {
      binding.reset(this._handle)
    }
  }

  columns() {
    return binding.columns(this._handle)
  }

  setAllowBareNamedParameters(allow) {
    binding.allowBareNamedParameters(this._handle, !!allow)
  }

  setAllowUnknownNamedParameters(allow) {
    binding.allowUnknownNamedParameters(this._handle, !!allow)
  }

  setReadBigInts(enabled) {
    binding.readBigInts(this._handle, !!enabled)
  }
}

function wrapBlobRow(row) {
  for (const key in row) {
    const value = row[key]
    if (value instanceof ArrayBuffer) row[key] = Buffer.from(value)
  }
  return row
}

function wrapBlobValues(row) {
  for (let i = 0; i < row.length; i++) {
    if (row[i] instanceof ArrayBuffer) row[i] = Buffer.from(row[i])
  }
  return row
}

function splitParameters(params) {
  if (params.length === 0) return [null, params]
  if (!isNamedParameters(params[0])) return [null, params]
  return [params[0], params.slice(1)]
}

function isNamedParameters(value) {
  if (value === null) return false
  if (typeof value !== 'object') return false
  if (Array.isArray(value)) return false
  if (ArrayBuffer.isView(value)) return false
  if (value instanceof ArrayBuffer) return false
  return true
}
