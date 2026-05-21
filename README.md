# bare-sqlite

SQLite bindings for Bare.

```
npm i bare-sqlite
```

## Usage

```js
const { DatabaseSync } = require('bare-sqlite')

const db = new DatabaseSync(':memory:')

db.exec(`
  CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT);
  INSERT INTO books (title) VALUES ('Dune'), ('Foundation');
`)

for (const row of db.prepare('SELECT id, title FROM books').iterate()) {
  console.log(row)
}

db.close()
```

## API

#### `const db = new DatabaseSync(location[, options])`

Open a SQLite database. `location` is a path to a database file, or `':memory:'` for an in-memory database.

Options include:

```js
options = {
  open: true,
  readOnly: false,
  enableForeignKeyConstraints: true,
  enableDoubleQuotedStringLiterals: false,
  allowExtension: false,
  timeout: 0
}
```

`open` controls whether the database is opened during construction. With `open: false`, the instance is initialised but the underlying connection is deferred until `db.open()` is called.

`readOnly` opens the database in read-only mode.

`enableForeignKeyConstraints` controls whether foreign key constraints are enforced.

`enableDoubleQuotedStringLiterals` controls whether double-quoted strings are interpreted as string literals (rather than identifiers) in DML and DDL.

`allowExtension` is the master switch for `db.loadExtension()` and `db.enableLoadExtension()`. When `false` (the default), both methods throw. When `true`, extension loading via the C API is enabled; the SQL `load_extension()` function remains disabled.

`timeout` is the busy timeout in milliseconds. When non-zero, SQLite waits up to that long for a lock before returning a `BUSY` error.

#### `db.isOpen`

`true` if the database is currently open, `false` otherwise.

#### `db.open()`

Open the database. Throws if already open. Useful when the database was constructed with `open: false`.

#### `db.close()`

Close the database. Throws if not open. Prepared statements that are still reachable from JavaScript remain valid until they are finalized; the underlying connection is released once the last statement is gone.

#### `db.exec(sql)`

Execute one or more SQL statements without returning rows. `sql` may contain multiple statements separated by `;`.

#### `const stmt = db.prepare(sql)`

Compile `sql` into a prepared statement. The returned `StatementSync` can be reused with different parameter values.

#### `db.loadExtension(path[, entryPoint])`

Load an SQLite extension from `path`. `entryPoint` is the C initialization function name; when omitted, SQLite derives it from the filename. Throws if `allowExtension` was not enabled at construction.

#### `db.enableLoadExtension(allow)`

Toggle extension loading at runtime. Useful for enabling extension loading during setup and disabling it before running user-supplied SQL. Throws if `allowExtension` was not enabled at construction.

#### `stmt.sourceSQL`

The original SQL string that the statement was compiled from.

#### `stmt.expandedSQL`

The SQL with bound parameter values substituted in, or `null` if SQLite couldn't expand it.

#### `const rows = stmt.all(...params)`

Execute the statement and return all rows as an array of objects keyed by column name.

#### `const row = stmt.get(...params)`

Execute the statement and return the first row, or `undefined` if there are no rows.

#### `const result = stmt.run(...params)`

Execute the statement, discarding any rows. Returns `{ changes, lastInsertRowid }`.

#### `for (const row of stmt.iterate(...params)) { ... }`

Execute the statement and yield rows one at a time. The statement is reset automatically once the iterator is exhausted or abandoned.

#### `const info = stmt.columns()`

Return an array describing the statement's result columns:

```js
;[{ column, name, database, table, type }]
```

`column` is the underlying column name, `name` is the alias used in the result, `database` and `table` identify the source, and `type` is the declared SQLite type. All five are `null` for expression columns.

#### `stmt.setReadBigInts(enabled)`

When `true`, `INTEGER` columns are returned as `BigInt` rather than `Number`. `changes` and `lastInsertRowid` from `stmt.run()` are returned as `BigInt` too. Default is `false`.

#### `stmt.setAllowBareNamedParameters(allow)`

When `true` (the default), named-parameter lookup falls back to the bare key when the sigil-prefixed key (`':foo'`) is not found. When `false`, only sigil-prefixed keys are considered.

#### `stmt.setAllowUnknownNamedParameters(allow)`

When `false` (the default), passing a named-parameters object with keys that don't correspond to any placeholder throws `INVALID_ARGUMENT`. When `true`, extras are silently ignored.

#### Parameter binding

The first argument to `stmt.all`, `stmt.get`, `stmt.run`, and `stmt.iterate` is treated as a named-parameters object when it is a non-null, non-array object that isn't a typed array or `ArrayBuffer`; otherwise all arguments are positional. Named and positional arguments may be combined by passing the object first and the positional values after it.

Supported input values map to SQLite types as follows. Any other value throws `INVALID_ARGUMENT`.

| JavaScript                                 | SQLite              |
| ------------------------------------------ | ------------------- |
| `null`, `undefined`                        | `NULL`              |
| `number`                                   | `INTEGER` or `REAL` |
| `BigInt`                                   | `INTEGER`           |
| `string`                                   | `TEXT`              |
| `ArrayBuffer`, `Uint8Array`, `Buffer`, ... | `BLOB`              |

Column values are returned as:

| SQLite    | JavaScript                                   |
| --------- | -------------------------------------------- |
| `NULL`    | `null`                                       |
| `INTEGER` | `Number` (or `BigInt` with `setReadBigInts`) |
| `REAL`    | `Number`                                     |
| `TEXT`    | `string`                                     |
| `BLOB`    | `Buffer`                                     |

## License

Apache-2.0
