const errors = require('./errors')

module.exports = class SQLiteTagStore {
  constructor(db, maxSize = 1000) {
    if (typeof maxSize !== 'number' || !Number.isInteger(maxSize) || maxSize <= 0) {
      throw errors.INVALID_ARGUMENT('maxSize must be a positive integer')
    }

    this._db = db
    this._maxSize = maxSize
    this._cache = new Map()
  }

  get db() {
    return this._db
  }

  get size() {
    return this._cache.size
  }

  get capacity() {
    return this._maxSize
  }

  clear() {
    this._cache.clear()
  }

  all(strings, ...params) {
    return this._lookup(strings).all({}, ...params)
  }

  values(strings, ...params) {
    return this._lookup(strings).values({}, ...params)
  }

  get(strings, ...params) {
    return this._lookup(strings).get({}, ...params)
  }

  iterate(strings, ...params) {
    return this._lookup(strings).iterate({}, ...params)
  }

  run(strings, ...params) {
    return this._lookup(strings).run({}, ...params)
  }

  _lookup(strings) {
    const sql = strings.join('?')

    let stmt = this._cache.get(sql)
    if (stmt !== undefined) {
      this._cache.delete(sql)
      this._cache.set(sql, stmt)
      return stmt
    }

    stmt = this._db.prepare(sql)
    this._cache.set(sql, stmt)

    if (this._cache.size > this._maxSize) {
      const oldest = this._cache.keys().next().value
      this._cache.delete(oldest)
    }

    return stmt
  }
}
