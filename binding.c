#include <assert.h>
#include <bare.h>
#include <js.h>
#include <sqlite3.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <utf.h>
#include <uv.h>

typedef utf8_t bare_sqlite_path_t[4096];

typedef struct bare_sqlite_statement_s bare_sqlite_statement_t;

typedef struct {
  sqlite3 *handle;

  bare_sqlite_statement_t *statements;
} bare_sqlite_t;

struct bare_sqlite_statement_s {
  sqlite3_stmt *handle;

  bool read_bigints;
  bool allow_bare_named_parameters;
  bool allow_unknown_named_parameters;

  bare_sqlite_t *db;
  bare_sqlite_statement_t *prev;
  bare_sqlite_statement_t *next;
};

static void
bare_sqlite__insert_statement(bare_sqlite_t *db, bare_sqlite_statement_t *stmt) {
  stmt->db = db;
  stmt->prev = NULL;
  stmt->next = db->statements;

  if (db->statements != NULL) db->statements->prev = stmt;

  db->statements = stmt;
}

static void
bare_sqlite__remove_statement(bare_sqlite_statement_t *stmt) {
  if (stmt->db == NULL) return;

  if (stmt->prev != NULL) stmt->prev->next = stmt->next;
  else stmt->db->statements = stmt->next;

  if (stmt->next != NULL) stmt->next->prev = stmt->prev;

  stmt->db = NULL;
  stmt->prev = NULL;
  stmt->next = NULL;
}

static void
bare_sqlite__finalize_statements(bare_sqlite_t *db) {
  bare_sqlite_statement_t *stmt = db->statements;

  while (stmt != NULL) {
    bare_sqlite_statement_t *next = stmt->next;

    if (stmt->handle != NULL) {
      sqlite3_finalize(stmt->handle);
      stmt->handle = NULL;
    }

    stmt->db = NULL;
    stmt->prev = NULL;
    stmt->next = NULL;

    stmt = next;
  }

  db->statements = NULL;
}

static const char *
bare_sqlite__code(int errcode) {
  switch (errcode & 0xff) {
#define V(name) \
  case SQLITE_##name: \
    return #name;
    V(ERROR)
    V(INTERNAL)
    V(PERM)
    V(ABORT)
    V(BUSY)
    V(LOCKED)
    V(NOMEM)
    V(READONLY)
    V(INTERRUPT)
    V(IOERR)
    V(CORRUPT)
    V(NOTFOUND)
    V(FULL)
    V(CANTOPEN)
    V(PROTOCOL)
    V(EMPTY)
    V(SCHEMA)
    V(TOOBIG)
    V(CONSTRAINT)
    V(MISMATCH)
    V(MISUSE)
    V(NOLFS)
    V(AUTH)
    V(FORMAT)
    V(RANGE)
    V(NOTADB)
    V(NOTICE)
    V(WARNING)
#undef V
  default:
    return "ERROR";
  }
}

static int
bare_sqlite__throw_error(js_env_t *env, int errcode, const char *errmsg) {
  return js_throw_error(env, bare_sqlite__code(errcode), errmsg);
}

static void
bare_sqlite__on_finalize_db(js_env_t *env, void *data, void *hint) {
  bare_sqlite_t *db = (bare_sqlite_t *) data;

  bare_sqlite__finalize_statements(db);

  if (db->handle != NULL) sqlite3_close_v2(db->handle);

  free(db);
}

static void
bare_sqlite__on_finalize_statement(js_env_t *env, void *data, void *hint) {
  bare_sqlite_statement_t *stmt = (bare_sqlite_statement_t *) data;

  if (stmt->handle != NULL) sqlite3_finalize(stmt->handle);

  bare_sqlite__remove_statement(stmt);

  free(stmt);
}

static js_value_t *
bare_sqlite_open(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 6;
  js_value_t *argv[6];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 6);

  bare_sqlite_path_t location;
  err = js_get_value_string_utf8(env, argv[0], location, sizeof(location), NULL);
  assert(err == 0);

  bool read_only;
  err = js_get_value_bool(env, argv[1], &read_only);
  assert(err == 0);

  bool foreign_keys;
  err = js_get_value_bool(env, argv[2], &foreign_keys);
  assert(err == 0);

  bool dqs;
  err = js_get_value_bool(env, argv[3], &dqs);
  assert(err == 0);

  bool allow_extension;
  err = js_get_value_bool(env, argv[4], &allow_extension);
  assert(err == 0);

  int32_t timeout;
  err = js_get_value_int32(env, argv[5], &timeout);
  assert(err == 0);

  int flags = read_only ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;

  sqlite3 *handle = NULL;

  int status = sqlite3_open_v2((const char *) location, &handle, flags, NULL);

  if (status != SQLITE_OK) {
    const char *errmsg = handle != NULL ? sqlite3_errmsg(handle) : sqlite3_errstr(status);

    err = bare_sqlite__throw_error(env, status, errmsg);
    assert(err == 0);

    if (handle != NULL) sqlite3_close_v2(handle);

    return NULL;
  }

  sqlite3_db_config(handle, SQLITE_DBCONFIG_ENABLE_FKEY, foreign_keys ? 1 : 0, NULL);
  sqlite3_db_config(handle, SQLITE_DBCONFIG_DQS_DML, dqs ? 1 : 0, NULL);
  sqlite3_db_config(handle, SQLITE_DBCONFIG_DQS_DDL, dqs ? 1 : 0, NULL);
  sqlite3_db_config(handle, SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION, allow_extension ? 1 : 0, NULL);

  if (timeout > 0) sqlite3_busy_timeout(handle, timeout);

  bare_sqlite_t *db = malloc(sizeof(bare_sqlite_t));
  db->handle = handle;
  db->statements = NULL;

  js_value_t *result;
  err = js_create_external(env, db, bare_sqlite__on_finalize_db, NULL, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_sqlite_close(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_t *db;
  err = js_get_value_external(env, argv[0], (void **) &db);
  assert(err == 0);

  bare_sqlite__finalize_statements(db);

  int status = sqlite3_close_v2(db->handle);

  if (status != SQLITE_OK) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(db->handle));
    assert(err == 0);

    return NULL;
  }

  db->handle = NULL;

  return NULL;
}

static js_value_t *
bare_sqlite_exec(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_t *db;
  err = js_get_value_external(env, argv[0], (void **) &db);
  assert(err == 0);

  size_t sql_len;
  err = js_get_value_string_utf8(env, argv[1], NULL, 0, &sql_len);
  assert(err == 0);

  sql_len += 1;

  utf8_t *sql = malloc(sql_len);

  err = js_get_value_string_utf8(env, argv[1], sql, sql_len, NULL);
  assert(err == 0);

  const char *cursor = (const char *) sql;

  while (*cursor != '\0') {
    sqlite3_stmt *stmt = NULL;
    const char *tail;
    int status = sqlite3_prepare_v2(db->handle, cursor, -1, &stmt, &tail);

    if (status != SQLITE_OK) {
      err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(db->handle));
      assert(err == 0);

      if (stmt != NULL) sqlite3_finalize(stmt);

      free(sql);
      return NULL;
    }

    cursor = tail;

    if (stmt == NULL) continue;

    while ((status = sqlite3_step(stmt)) == SQLITE_ROW) {
    }

    sqlite3_finalize(stmt);

    if (status != SQLITE_DONE) {
      err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(db->handle));
      assert(err == 0);

      free(sql);
      return NULL;
    }
  }

  free(sql);
  return NULL;
}

static js_value_t *
bare_sqlite_enable_load_extension(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_t *db;
  err = js_get_value_external(env, argv[0], (void **) &db);
  assert(err == 0);

  bool enabled;
  err = js_get_value_bool(env, argv[1], &enabled);
  assert(err == 0);

  int status = sqlite3_db_config(db->handle, SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION, enabled ? 1 : 0, NULL);

  if (status != SQLITE_OK) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(db->handle));
    assert(err == 0);
  }

  return NULL;
}

static js_value_t *
bare_sqlite_load_extension(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_sqlite_t *db;
  err = js_get_value_external(env, argv[0], (void **) &db);
  assert(err == 0);

  size_t path_len;
  err = js_get_value_string_utf8(env, argv[1], NULL, 0, &path_len);
  assert(err == 0);

  path_len += 1;

  utf8_t *path = malloc(path_len);

  err = js_get_value_string_utf8(env, argv[1], path, path_len, NULL);
  assert(err == 0);

  utf8_t *entry = NULL;

  js_value_type_t entry_type;
  err = js_typeof(env, argv[2], &entry_type);
  assert(err == 0);

  if (entry_type == js_string) {
    size_t entry_len;
    err = js_get_value_string_utf8(env, argv[2], NULL, 0, &entry_len);
    assert(err == 0);

    entry_len += 1;

    entry = malloc(entry_len);

    err = js_get_value_string_utf8(env, argv[2], entry, entry_len, NULL);
    assert(err == 0);
  }

  char *errmsg = NULL;
  int status = sqlite3_load_extension(db->handle, (const char *) path, (const char *) entry, &errmsg);

  free(path);
  if (entry != NULL) free(entry);

  if (status != SQLITE_OK) {
    err = bare_sqlite__throw_error(env, status, errmsg != NULL ? errmsg : sqlite3_errstr(status));
    assert(err == 0);

    if (errmsg != NULL) sqlite3_free(errmsg);
  }

  return NULL;
}

static js_value_t *
bare_sqlite_prepare(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_t *db;
  err = js_get_value_external(env, argv[0], (void **) &db);
  assert(err == 0);

  size_t sql_len;
  err = js_get_value_string_utf8(env, argv[1], NULL, 0, &sql_len);
  assert(err == 0);

  sql_len += 1;

  utf8_t *sql = malloc(sql_len);

  err = js_get_value_string_utf8(env, argv[1], sql, sql_len, NULL);
  assert(err == 0);

  sqlite3_stmt *handle = NULL;
  int status = sqlite3_prepare_v2(db->handle, (const char *) sql, -1, &handle, NULL);

  free(sql);

  if (status != SQLITE_OK) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(db->handle));
    assert(err == 0);

    if (handle != NULL) sqlite3_finalize(handle);

    return NULL;
  }

  bare_sqlite_statement_t *stmt = malloc(sizeof(bare_sqlite_statement_t));
  stmt->handle = handle;
  stmt->read_bigints = false;
  stmt->allow_bare_named_parameters = true;
  stmt->allow_unknown_named_parameters = false;

  bare_sqlite__insert_statement(db, stmt);

  js_value_t *result;
  err = js_create_external(env, stmt, bare_sqlite__on_finalize_statement, NULL, &result);
  assert(err == 0);

  return result;
}

static int
bare_sqlite__bind_value(js_env_t *env, sqlite3_stmt *stmt, int index, js_value_t *value) {
  int err;
  int status;

  js_value_type_t type;
  err = js_typeof(env, value, &type);
  if (err < 0) return err;

  switch (type) {
  case js_null:
  case js_undefined:
    status = sqlite3_bind_null(stmt, index);
    break;

  case js_number: {
    double n;
    err = js_get_value_double(env, value, &n);
    if (err < 0) return err;

    int64_t i = (int64_t) n;

    if (n == (double) i) {
      status = sqlite3_bind_int64(stmt, index, i);
    } else {
      status = sqlite3_bind_double(stmt, index, n);
    }
    break;
  }

  case js_bigint: {
    int64_t n;
    bool lossless;
    err = js_get_value_bigint_int64(env, value, &n, &lossless);
    if (err < 0) return err;

    status = sqlite3_bind_int64(stmt, index, n);
    break;
  }

  case js_string: {
    size_t len;
    err = js_get_value_string_utf8(env, value, NULL, 0, &len);
    if (err < 0) return err;

    utf8_t *str = malloc(len + 1);

    err = js_get_value_string_utf8(env, value, str, len + 1, NULL);
    if (err < 0) {
      free(str);
      return err;
    }

    status = sqlite3_bind_text(stmt, index, (const char *) str, (int) len, SQLITE_TRANSIENT);
    free(str);
    break;
  }

  case js_object: {
    bool is_typedarray;
    err = js_is_typedarray(env, value, &is_typedarray);
    if (err < 0) return err;

    if (is_typedarray) {
      void *data;
      size_t len;
      err = js_get_typedarray_info(env, value, NULL, &data, &len, NULL, NULL);
      if (err < 0) return err;

      status = sqlite3_bind_blob(stmt, index, data, (int) len, SQLITE_TRANSIENT);
      break;
    }

    bool is_arraybuffer;
    err = js_is_arraybuffer(env, value, &is_arraybuffer);
    if (err < 0) return err;

    if (is_arraybuffer) {
      void *data;
      size_t len;
      err = js_get_arraybuffer_info(env, value, &data, &len);
      if (err < 0) return err;

      status = sqlite3_bind_blob(stmt, index, data, (int) len, SQLITE_TRANSIENT);
      break;
    }

    return js_throw_type_error(env, NULL, "Unsupported parameter type");
  }

  default:
    return js_throw_type_error(env, NULL, "Unsupported parameter type");
  }

  if (status != SQLITE_OK) {
    return bare_sqlite__throw_error(env, status, sqlite3_errmsg(sqlite3_db_handle(stmt)));
  }

  return 0;
}

static int
bare_sqlite__bind_params(js_env_t *env, bare_sqlite_statement_t *stmt, js_value_t *named, js_value_t *positional) {
  int err;

  uint32_t pos_len;
  err = js_get_array_length(env, positional, &pos_len);
  if (err < 0) return err;

  js_value_type_t named_type;
  err = js_typeof(env, named, &named_type);
  if (err < 0) return err;

  bool has_named = named_type == js_object;

  int n = sqlite3_bind_parameter_count(stmt->handle);
  uint32_t pos_idx = 0;

  for (int i = 1; i <= n; i++) {
    const char *name = sqlite3_bind_parameter_name(stmt->handle, i);

    if (name == NULL) {
      if (pos_idx >= pos_len) continue;

      js_value_t *value;
      err = js_get_element(env, positional, pos_idx++, &value);
      if (err < 0) return err;

      err = bare_sqlite__bind_value(env, stmt->handle, i, value);
      if (err < 0) return err;

      continue;
    }

    if (!has_named) {
      return js_throw_type_error(env, NULL, "Missing named parameters object");
    }

    bool found;
    err = js_has_named_property(env, named, name, &found);
    if (err < 0) return err;

    const char *key = name;

    if (!found && stmt->allow_bare_named_parameters) {
      err = js_has_named_property(env, named, name + 1, &found);
      if (err < 0) return err;

      if (found) key = name + 1;
    }

    if (!found) continue;

    js_value_t *value;
    err = js_get_named_property(env, named, key, &value);
    if (err < 0) return err;

    err = bare_sqlite__bind_value(env, stmt->handle, i, value);
    if (err < 0) return err;
  }

  if (has_named && !stmt->allow_unknown_named_parameters) {
    js_value_t *keys;
    err = js_get_property_names(env, named, &keys);
    if (err < 0) return err;

    uint32_t keys_len;
    err = js_get_array_length(env, keys, &keys_len);
    if (err < 0) return err;

    for (uint32_t k = 0; k < keys_len; k++) {
      js_value_t *key_value;
      err = js_get_element(env, keys, k, &key_value);
      if (err < 0) return err;

      utf8_t key[256];
      err = js_get_value_string_utf8(env, key_value, key, sizeof(key), NULL);
      if (err < 0) return err;

      bool known = false;

      for (int i = 1; i <= n; i++) {
        const char *name = sqlite3_bind_parameter_name(stmt->handle, i);
        if (name == NULL) continue;

        if (strcmp(name, (const char *) key) == 0) {
          known = true;
          break;
        }

        if (stmt->allow_bare_named_parameters && strcmp(name + 1, (const char *) key) == 0) {
          known = true;
          break;
        }
      }

      if (!known) {
        return js_throw_type_error(env, NULL, "Unknown named parameter");
      }
    }
  }

  return 0;
}

static int
bare_sqlite__column_value(js_env_t *env, bare_sqlite_statement_t *stmt, int index, js_value_t **result) {
  int err;

  switch (sqlite3_column_type(stmt->handle, index)) {
  case SQLITE_INTEGER: {
    int64_t value = sqlite3_column_int64(stmt->handle, index);

    return stmt->read_bigints
             ? js_create_bigint_int64(env, value, result)
             : js_create_int64(env, value, result);
  }

  case SQLITE_FLOAT:
    return js_create_double(env, sqlite3_column_double(stmt->handle, index), result);

  case SQLITE_TEXT: {
    return js_create_string_utf8(env, (const utf8_t *) sqlite3_column_text(stmt->handle, index), (size_t) sqlite3_column_bytes(stmt->handle, index), result);
  }

  case SQLITE_BLOB: {
    int len = sqlite3_column_bytes(stmt->handle, index);

    void *buf;
    err = js_create_arraybuffer(env, (size_t) len, &buf, result);
    if (err < 0) return err;

    if (len > 0) memcpy(buf, sqlite3_column_blob(stmt->handle, index), (size_t) len);

    return 0;
  }

  case SQLITE_NULL:
  default:
    return js_get_null(env, result);
  }
}

static int
bare_sqlite__build_row(js_env_t *env, bare_sqlite_statement_t *stmt, js_value_t **result) {
  int err;

  err = js_create_object(env, result);
  if (err < 0) return err;

  int n = sqlite3_column_count(stmt->handle);

  for (int i = 0; i < n; i++) {
    js_value_t *value;
    err = bare_sqlite__column_value(env, stmt, i, &value);
    if (err < 0) return err;

    err = js_set_named_property(env, *result, sqlite3_column_name(stmt->handle, i), value);
    if (err < 0) return err;
  }

  return 0;
}

static js_value_t *
bare_sqlite_bind(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  sqlite3_reset(stmt->handle);
  sqlite3_clear_bindings(stmt->handle);

  err = bare_sqlite__bind_params(env, stmt, argv[1], argv[2]);
  (void) err;

  return NULL;
}

static js_value_t *
bare_sqlite_step(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  int status = sqlite3_step(stmt->handle);

  if (status == SQLITE_ROW) {
    js_value_t *row;
    err = bare_sqlite__build_row(env, stmt, &row);
    if (err < 0) return NULL;

    return row;
  }

  if (status == SQLITE_DONE) {
    js_value_t *result;
    err = js_get_undefined(env, &result);
    assert(err == 0);

    return result;
  }

  err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(sqlite3_db_handle(stmt->handle)));
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_sqlite_expanded_sql(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  char *sql = sqlite3_expanded_sql(stmt->handle);

  js_value_t *result;

  if (sql == NULL) {
    err = js_get_null(env, &result);
    assert(err == 0);

    return result;
  }

  err = js_create_string_utf8(env, (const utf8_t *) sql, -1, &result);
  assert(err == 0);

  sqlite3_free(sql);

  return result;
}

static js_value_t *
bare_sqlite_columns(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  int n = sqlite3_column_count(stmt->handle);

  js_value_t *result;
  err = js_create_array_with_length(env, (size_t) n, &result);
  assert(err == 0);

  for (int i = 0; i < n; i++) {
    js_value_t *entry;
    err = js_create_object(env, &entry);
    assert(err == 0);

#define V(prop, source) \
  { \
    const char *value = source; \
    js_value_t *property; \
    if (value == NULL) { \
      err = js_get_null(env, &property); \
    } else { \
      err = js_create_string_utf8(env, (const utf8_t *) value, -1, &property); \
    } \
    assert(err == 0); \
    err = js_set_named_property(env, entry, prop, property); \
    assert(err == 0); \
  }

    V("column", sqlite3_column_origin_name(stmt->handle, i))
    V("name", sqlite3_column_name(stmt->handle, i))
    V("database", sqlite3_column_database_name(stmt->handle, i))
    V("table", sqlite3_column_table_name(stmt->handle, i))
    V("type", sqlite3_column_decltype(stmt->handle, i))

#undef V

    err = js_set_element(env, result, (uint32_t) i, entry);
    assert(err == 0);
  }

  return result;
}

static js_value_t *
bare_sqlite_allow_bare_named_parameters(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  bool enabled;
  err = js_get_value_bool(env, argv[1], &enabled);
  assert(err == 0);

  stmt->allow_bare_named_parameters = enabled;

  return NULL;
}

static js_value_t *
bare_sqlite_allow_unknown_named_parameters(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  bool enabled;
  err = js_get_value_bool(env, argv[1], &enabled);
  assert(err == 0);

  stmt->allow_unknown_named_parameters = enabled;

  return NULL;
}

static js_value_t *
bare_sqlite_read_bigints(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  bool enabled;
  err = js_get_value_bool(env, argv[1], &enabled);
  assert(err == 0);

  stmt->read_bigints = enabled;

  return NULL;
}

static js_value_t *
bare_sqlite_finalize(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  if (stmt->handle != NULL) {
    sqlite3_finalize(stmt->handle);
    stmt->handle = NULL;
  }

  bare_sqlite__remove_statement(stmt);

  return NULL;
}

static js_value_t *
bare_sqlite_reset(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  sqlite3_reset(stmt->handle);
  sqlite3_clear_bindings(stmt->handle);

  return NULL;
}

static js_value_t *
bare_sqlite_run(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  sqlite3_reset(stmt->handle);
  sqlite3_clear_bindings(stmt->handle);

  err = bare_sqlite__bind_params(env, stmt, argv[1], argv[2]);
  if (err < 0) return NULL;

  int status;
  while ((status = sqlite3_step(stmt->handle)) == SQLITE_ROW) {
  }

  if (status != SQLITE_DONE) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(sqlite3_db_handle(stmt->handle)));
    assert(err == 0);

    return NULL;
  }

  sqlite3 *db = sqlite3_db_handle(stmt->handle);

  js_value_t *result;
  err = js_create_object(env, &result);
  assert(err == 0);

  js_value_t *changes;
  err = stmt->read_bigints
          ? js_create_bigint_int64(env, sqlite3_changes64(db), &changes)
          : js_create_int64(env, sqlite3_changes64(db), &changes);
  assert(err == 0);

  err = js_set_named_property(env, result, "changes", changes);
  assert(err == 0);

  js_value_t *last_insert_rowid;
  err = stmt->read_bigints
          ? js_create_bigint_int64(env, sqlite3_last_insert_rowid(db), &last_insert_rowid)
          : js_create_int64(env, sqlite3_last_insert_rowid(db), &last_insert_rowid);
  assert(err == 0);

  err = js_set_named_property(env, result, "lastInsertRowid", last_insert_rowid);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_sqlite_get(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  sqlite3_reset(stmt->handle);
  sqlite3_clear_bindings(stmt->handle);

  err = bare_sqlite__bind_params(env, stmt, argv[1], argv[2]);
  if (err < 0) return NULL;

  int status = sqlite3_step(stmt->handle);

  if (status == SQLITE_ROW) {
    js_value_t *result;
    err = bare_sqlite__build_row(env, stmt, &result);
    if (err < 0) return NULL;

    return result;
  }

  if (status != SQLITE_DONE) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(sqlite3_db_handle(stmt->handle)));
    assert(err == 0);
  }

  return NULL;
}

static js_value_t *
bare_sqlite_all(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_sqlite_statement_t *stmt;
  err = js_get_value_external(env, argv[0], (void **) &stmt);
  assert(err == 0);

  sqlite3_reset(stmt->handle);
  sqlite3_clear_bindings(stmt->handle);

  err = bare_sqlite__bind_params(env, stmt, argv[1], argv[2]);
  if (err < 0) return NULL;

  js_value_t *rows;
  err = js_create_array(env, &rows);
  assert(err == 0);

  int status;
  uint32_t i = 0;

  while ((status = sqlite3_step(stmt->handle)) == SQLITE_ROW) {
    js_value_t *row;
    err = bare_sqlite__build_row(env, stmt, &row);
    if (err < 0) return NULL;

    err = js_set_element(env, rows, i++, row);
    assert(err == 0);
  }

  if (status != SQLITE_DONE) {
    err = bare_sqlite__throw_error(env, status, sqlite3_errmsg(sqlite3_db_handle(stmt->handle)));
    assert(err == 0);

    return NULL;
  }

  return rows;
}

static js_value_t *
bare_sqlite_exports(js_env_t *env, js_value_t *exports) {
  int err;

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("open", bare_sqlite_open)
  V("close", bare_sqlite_close)
  V("exec", bare_sqlite_exec)
  V("enableLoadExtension", bare_sqlite_enable_load_extension)
  V("loadExtension", bare_sqlite_load_extension)
  V("prepare", bare_sqlite_prepare)
  V("bind", bare_sqlite_bind)
  V("step", bare_sqlite_step)
  V("reset", bare_sqlite_reset)
  V("finalize", bare_sqlite_finalize)
  V("expandedSQL", bare_sqlite_expanded_sql)
  V("columns", bare_sqlite_columns)
  V("allowBareNamedParameters", bare_sqlite_allow_bare_named_parameters)
  V("allowUnknownNamedParameters", bare_sqlite_allow_unknown_named_parameters)
  V("readBigInts", bare_sqlite_read_bigints)
  V("run", bare_sqlite_run)
  V("get", bare_sqlite_get)
  V("all", bare_sqlite_all)
#undef V

  return exports;
}

BARE_MODULE(bare_sqlite, bare_sqlite_exports)
