const binding = require('../binding')
const StatementSync = require('./statement-sync')
const errors = require('./errors')

module.exports = class SQLiteDatabaseSync {
  constructor(location, opts = {}) {
    const {
      open = true,
      readOnly = false,
      enableForeignKeyConstraints = true,
      enableDoubleQuotedStringLiterals = false,
      allowExtension = false,
      timeout = 0
    } = opts

    this._location = location
    this._readOnly = readOnly
    this._enableForeignKeyConstraints = enableForeignKeyConstraints
    this._enableDoubleQuotedStringLiterals = enableDoubleQuotedStringLiterals
    this._allowExtension = allowExtension
    this._timeout = timeout

    this._handle = null

    if (open) this.open()
  }

  get isOpen() {
    return this._handle !== null
  }

  get isTransaction() {
    throw errors.NOT_IMPLEMENTED('isTransaction is not implemented')
  }

  open() {
    if (this._handle !== null) {
      throw errors.DATABASE_ALREADY_OPEN('Database is already open')
    }

    try {
      this._handle = binding.open(
        this._location,
        this._readOnly,
        this._enableForeignKeyConstraints,
        this._enableDoubleQuotedStringLiterals,
        this._allowExtension,
        this._timeout
      )
    } catch (err) {
      throw errors.from(err)
    }
  }

  close() {
    if (this._handle === null) {
      throw errors.DATABASE_NOT_OPEN('Database is not open')
    }

    try {
      binding.close(this._handle)
    } catch (err) {
      throw errors.from(err)
    }

    this._handle = null
  }

  [Symbol.dispose]() {
    if (this.isOpen) this.close()
  }

  exec(sql) {
    if (this._handle === null) {
      throw errors.DATABASE_NOT_OPEN('Database is not open')
    }

    try {
      binding.exec(this._handle, sql)
    } catch (err) {
      throw errors.from(err)
    }
  }

  prepare(sql) {
    if (this._handle === null) {
      throw errors.DATABASE_NOT_OPEN('Database is not open')
    }

    return new StatementSync(this, sql)
  }

  function(name, opts, fn) {
    throw errors.NOT_IMPLEMENTED('function is not implemented')
  }

  aggregate(name, opts) {
    throw errors.NOT_IMPLEMENTED('aggregate is not implemented')
  }

  createSession(opts = {}) {
    throw errors.NOT_IMPLEMENTED('createSession is not implemented')
  }

  applyChangeset(changeset, opts = {}) {
    throw errors.NOT_IMPLEMENTED('applyChangeset is not implemented')
  }

  enableLoadExtension(allow) {
    if (this._handle === null) {
      throw errors.DATABASE_NOT_OPEN('Database is not open')
    }

    if (!this._allowExtension) {
      throw errors.LOAD_EXTENSION_DISABLED('Extension loading is disabled')
    }

    try {
      binding.enableLoadExtension(this._handle, !!allow)
    } catch (err) {
      throw errors.from(err)
    }
  }

  loadExtension(path, entryPoint = null) {
    if (this._handle === null) {
      throw errors.DATABASE_NOT_OPEN('Database is not open')
    }

    if (!this._allowExtension) {
      throw errors.LOAD_EXTENSION_DISABLED('Extension loading is disabled')
    }

    try {
      binding.loadExtension(this._handle, path, entryPoint)
    } catch (err) {
      throw errors.from(err)
    }
  }

  backup(destination, opts = {}) {
    throw errors.NOT_IMPLEMENTED('backup is not implemented')
  }

  location(dbName) {
    throw errors.NOT_IMPLEMENTED('location is not implemented')
  }
}
