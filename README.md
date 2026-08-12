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

See the [full API reference](https://docs.pears.com/reference/bare/modules/bare-sqlite).

## License

Apache-2.0
