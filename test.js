const test = require('brittle')
const path = require('bare-path')
const { DatabaseSync, errors: SQLiteError } = require('.')

test('open and close in-memory database', (t) => {
  using db = new DatabaseSync(':memory:')
  t.is(db.isOpen, true)
  db.close()
  t.is(db.isOpen, false)
})

test('deferred open', (t) => {
  using db = new DatabaseSync(':memory:', { open: false })
  t.is(db.isOpen, false)
  db.open()
  t.is(db.isOpen, true)
  db.close()
  t.is(db.isOpen, false)
})

test('throws when opened twice', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(() => db.open(), /DATABASE_ALREADY_OPEN/)
})

test('throws when closed twice', (t) => {
  using db = new DatabaseSync(':memory:')
  db.close()
  t.exception(() => db.close(), /DATABASE_NOT_OPEN/)
})

test('prepare a statement', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('SELECT 1')
  t.is(stmt.sourceSQL, 'SELECT 1')
})

test('prepare throws on invalid SQL', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(() => db.prepare('NOT VALID SQL'))
})

test('prepare throws when database is not open', (t) => {
  using db = new DatabaseSync(':memory:')
  db.close()
  t.exception(() => db.prepare('SELECT 1'), /DATABASE_NOT_OPEN/)
})

test('SQLite errors are SQLiteError with the SQLite code as .code', (t) => {
  using db = new DatabaseSync(':memory:')
  try {
    db.prepare('NOT VALID SQL')
    t.fail('should have thrown')
  } catch (err) {
    t.ok(err instanceof SQLiteError)
    t.is(err.code, 'ERROR')
  }
})

test('closing a database with a live statement does not throw', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('SELECT 1')
  db.close()
  t.pass('close returned without throwing')
})

test('run a DDL statement', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
  const result = stmt.run()
  t.is(result.changes, 0)
  t.is(result.lastInsertRowid, 0)
})

test('insert and read back rows', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)').run()

  const insert = db.prepare('INSERT INTO t (name) VALUES (?)')
  const r1 = insert.run('alice')
  const r2 = insert.run('bob')

  t.is(r1.changes, 1)
  t.is(r1.lastInsertRowid, 1)
  t.is(r2.lastInsertRowid, 2)

  const rows = db.prepare('SELECT id, name FROM t ORDER BY id').all()
  t.alike(rows, [
    { id: 1, name: 'alice' },
    { id: 2, name: 'bob' }
  ])

  const first = db.prepare('SELECT id, name FROM t ORDER BY id').get()
  t.alike(first, { id: 1, name: 'alice' })

  const none = db.prepare('SELECT id FROM t WHERE id = ?').get(99)
  t.is(none, undefined)
})

test('round-trip values of all SQLite types', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (i INTEGER, f REAL, s TEXT, b BLOB, n TEXT)').run()

  const blob = new Uint8Array([1, 2, 3, 4])

  db.prepare('INSERT INTO t VALUES (?, ?, ?, ?, ?)').run(42, 3.5, 'hello', blob, null)

  const row = db.prepare('SELECT i, f, s, b, n FROM t').get()
  t.is(row.i, 42)
  t.is(row.f, 3.5)
  t.is(row.s, 'hello')
  t.ok(Buffer.isBuffer(row.b))
  t.alike(row.b, Buffer.from(blob))
  t.is(row.n, null)
})

test('bind a bigint parameter', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (v INTEGER)').run()
  db.prepare('INSERT INTO t VALUES (?)').run(1234n)
  t.is(db.prepare('SELECT v FROM t').get().v, 1234)
})

test('statement can be reused with different params', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)').run()
  const insert = db.prepare('INSERT INTO t (name) VALUES (?)')
  for (let i = 0; i < 5; i++) insert.run('row-' + i)
  const rows = db.prepare('SELECT name FROM t ORDER BY id').all()
  t.is(rows.length, 5)
  t.is(rows[0].name, 'row-0')
  t.is(rows[4].name, 'row-4')
})

test('runtime error during step is propagated', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY)').run()
  db.prepare('INSERT INTO t VALUES (1)').run()
  t.exception(() => db.prepare('INSERT INTO t VALUES (1)').run(), /UNIQUE/)
})

test('named parameters via :name with sigil', (t) => {
  using db = new DatabaseSync(':memory:')
  const row = db.prepare('SELECT :a + :b AS r').get({ ':a': 2, ':b': 3 })
  t.is(row.r, 5)
})

test('named parameters via :name without sigil (bare)', (t) => {
  using db = new DatabaseSync(':memory:')
  const row = db.prepare('SELECT :a + :b AS r').get({ a: 2, b: 3 })
  t.is(row.r, 5)
})

test('named parameters via @name', (t) => {
  using db = new DatabaseSync(':memory:')
  const row = db.prepare('SELECT @a + @b AS r').get({ a: 4, b: 5 })
  t.is(row.r, 9)
})

test('named parameters via $name', (t) => {
  using db = new DatabaseSync(':memory:')
  const row = db.prepare('SELECT $a + $b AS r').get({ a: 7, b: 8 })
  t.is(row.r, 15)
})

test('mix of named and anonymous parameters', (t) => {
  using db = new DatabaseSync(':memory:')
  const row = db.prepare('SELECT :a AS a, ? AS b').get({ a: 1 }, 2)
  t.alike(row, { a: 1, b: 2 })
})

test('named placeholder with no object throws', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(() => db.prepare('SELECT :a AS a').get(), /INVALID_ARGUMENT/)
})

test('exec a single statement', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
  const r = db.prepare('SELECT count(*) AS n FROM t').get()
  t.is(r.n, 0)
})

test('exec multiple statements', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO t (name) VALUES ('a'), ('b'), ('c');
    CREATE INDEX idx_name ON t (name);
  `)
  const r = db.prepare('SELECT count(*) AS n FROM t').get()
  t.is(r.n, 3)
})

test('exec discards rows from SELECT', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('SELECT 1; SELECT 2;')
  t.pass('exec returned without error')
})

test('exec propagates errors from later statements', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(
    () => db.exec('CREATE TABLE t (id INTEGER); INSERT INTO nonexistent VALUES (1);'),
    /no such table/
  )
  const r = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t'").get()
  t.is(r.name, 't')
})

test('exec on closed database throws', (t) => {
  using db = new DatabaseSync(':memory:')
  db.close()
  t.exception(() => db.exec('SELECT 1'), /DATABASE_NOT_OPEN/)
})

test('exec on invalid SQL throws', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(() => db.exec('NOT VALID SQL'), /SQLiteError/)
})

test('exec accepts whitespace and comments only', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('   -- a comment\n  /* another */  \n')
  t.pass('exec returned without error')
})

test('iterate yields rows one at a time', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO t (name) VALUES ('a'), ('b'), ('c');
  `)

  const rows = []
  for (const row of db.prepare('SELECT id, name FROM t ORDER BY id').iterate()) {
    rows.push(row)
  }

  t.alike(rows, [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' }
  ])
})

test('iterate accepts named and positional parameters', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY, group_id INTEGER);
    INSERT INTO t (group_id) VALUES (1), (2), (1), (2), (1);
  `)

  const rows = []
  for (const row of db.prepare('SELECT id FROM t WHERE group_id = :g ORDER BY id').iterate({ g: 1 })) {
    rows.push(row.id)
  }

  t.alike(rows, [1, 3, 5])
})

test('iterate yields nothing for an empty result set', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER)')

  let count = 0
  for (const _row of db.prepare('SELECT id FROM t').iterate()) count++

  t.is(count, 0)
})

test('iterate cleans up the statement on early break', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY);
    INSERT INTO t VALUES (1), (2), (3), (4), (5);
  `)

  const stmt = db.prepare('SELECT id FROM t ORDER BY id')
  let first
  for (const row of stmt.iterate()) {
    first = row.id
    break
  }
  t.is(first, 1)

  // Statement should be in a clean state and be reusable.
  const rows = []
  for (const row of stmt.iterate()) rows.push(row.id)
  t.alike(rows, [1, 2, 3, 4, 5])
})

test('iterate propagates runtime errors mid-iteration', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER, src TEXT);
    INSERT INTO t VALUES (1, '{}'), (2, 'not json'), (3, '{}');
  `)

  const stmt = db.prepare('SELECT id, json(src) AS j FROM t')

  t.exception(() => {
    for (const _row of stmt.iterate()) {}
  }, /malformed/)

  db.exec('DELETE FROM t WHERE id = 2')

  const ids = []
  for (const row of stmt.iterate()) ids.push(row.id)
  t.alike(ids, [1, 3])
})

test('setReadBigInts returns INTEGER columns as BigInt', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER);
    INSERT INTO t (v) VALUES (1), (9007199254740993);
  `)

  const stmt = db.prepare('SELECT id, v FROM t ORDER BY id')
  stmt.setReadBigInts(true)

  const rows = stmt.all()
  t.is(rows[0].id, 1n)
  t.is(rows[0].v, 1n)
  t.is(rows[1].v, 9007199254740993n)
})

test('setReadBigInts(false) reverts to Number', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (v INTEGER); INSERT INTO t VALUES (42);')

  const stmt = db.prepare('SELECT v FROM t')
  stmt.setReadBigInts(true)
  t.is(stmt.get().v, 42n)
  stmt.setReadBigInts(false)
  t.is(stmt.get().v, 42)
})

test('setReadBigInts only affects INTEGER columns', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (i INTEGER, f REAL, s TEXT)')
  db.prepare('INSERT INTO t VALUES (?, ?, ?)').run(7, 1.5, 'hi')

  const stmt = db.prepare('SELECT i, f, s FROM t')
  stmt.setReadBigInts(true)
  const row = stmt.get()
  t.is(row.i, 7n)
  t.is(row.f, 1.5)
  t.is(row.s, 'hi')
})

test('setReadBigInts makes run() return BigInt changes and lastInsertRowid', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')

  const insert = db.prepare('INSERT INTO t (name) VALUES (?)')
  insert.setReadBigInts(true)
  const r = insert.run('alice')
  t.is(r.changes, 1n)
  t.is(r.lastInsertRowid, 1n)
})

test('setReadBigInts works with iterate', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY);
    INSERT INTO t VALUES (10), (20), (30);
  `)

  const stmt = db.prepare('SELECT id FROM t ORDER BY id')
  stmt.setReadBigInts(true)

  const ids = []
  for (const row of stmt.iterate()) ids.push(row.id)
  t.alike(ids, [10n, 20n, 30n])
})

test('expandedSQL returns the SQL with bound parameters substituted', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('SELECT :a + ? AS r')
  stmt.run({ a: 1 }, 2)
  t.is(stmt.expandedSQL, 'SELECT 1 + 2 AS r')
})

test('columns describes result columns', (t) => {
  using db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
  const stmt = db.prepare('SELECT id AS alias, name, 1 + 1 AS expr FROM t')

  t.alike(stmt.columns(), [
    { column: 'id', name: 'alias', database: 'main', table: 't', type: 'INTEGER' },
    { column: 'name', name: 'name', database: 'main', table: 't', type: 'TEXT' },
    { column: null, name: 'expr', database: null, table: null, type: null }
  ])
})

test('setAllowBareNamedParameters(false) rejects bare keys', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('SELECT :a AS a')
  stmt.setAllowBareNamedParameters(false)

  // Full name still works.
  t.is(stmt.get({ ':a': 1 }).a, 1)

  // Bare key is now considered unknown.
  t.exception(() => stmt.get({ a: 1 }), /Unknown named parameter/)
})

test('setAllowUnknownNamedParameters(false) is the default and throws on extras', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('SELECT :a AS a')
  t.exception(() => stmt.get({ a: 1, b: 2 }), /Unknown named parameter/)
})

test('setAllowUnknownNamedParameters(true) ignores unknown keys', (t) => {
  using db = new DatabaseSync(':memory:')
  const stmt = db.prepare('SELECT :a AS a')
  stmt.setAllowUnknownNamedParameters(true)
  t.is(stmt.get({ a: 1, b: 2 }).a, 1)
})

test('loadExtension and enableLoadExtension require allowExtension', (t) => {
  using db = new DatabaseSync(':memory:')
  t.exception(() => db.loadExtension('/anything'), /LOAD_EXTENSION_DISABLED/)
  t.exception(() => db.enableLoadExtension(true), /LOAD_EXTENSION_DISABLED/)
})

test('loadExtension with a missing file throws a SQLite error', (t) => {
  using db = new DatabaseSync(':memory:', { allowExtension: true })
  t.exception(
    () => db.loadExtension('/definitely/not/a/real/extension.so'),
    /SQLiteError/
  )
})

test('enableLoadExtension can be toggled when allowed', (t) => {
  using db = new DatabaseSync(':memory:', { allowExtension: true })
  db.enableLoadExtension(false)
  db.enableLoadExtension(true)
  t.pass('toggled without throwing')
})

test('extension methods throw when the database is closed', (t) => {
  using db = new DatabaseSync(':memory:', { allowExtension: true })
  db.close()
  t.exception(() => db.loadExtension('/anything'), /DATABASE_NOT_OPEN/)
  t.exception(() => db.enableLoadExtension(true), /DATABASE_NOT_OPEN/)
})

test('file-backed database persists across reopens', async (t) => {
  const tmp = await t.tmp()
  const file = path.join(tmp, 'test.db')

  {
    using db = new DatabaseSync(file)
    db.exec(`
      CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO t (name) VALUES ('alice'), ('bob');
    `)
  }

  {
    using db = new DatabaseSync(file)
    const rows = db.prepare('SELECT name FROM t ORDER BY id').all()
    t.alike(rows, [{ name: 'alice' }, { name: 'bob' }])
  }
})

test('Uint8Array first argument is treated as positional, not named', (t) => {
  using db = new DatabaseSync(':memory:')
  db.prepare('CREATE TABLE t (b BLOB)').run()
  const blob = new Uint8Array([1, 2, 3])
  db.prepare('INSERT INTO t VALUES (?)').run(blob)
  const row = db.prepare('SELECT b FROM t').get()
  t.alike(row.b, Buffer.from(blob))
})
