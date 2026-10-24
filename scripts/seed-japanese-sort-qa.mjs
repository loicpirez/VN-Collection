import path from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH;
if (process.env.VNCOLL_QA !== '1' || !dbPath || !path.isAbsolute(dbPath) || !dbPath.includes(`${path.sep}.qa${path.sep}`)) {
  throw new Error('Use VNCOLL_QA=1 and an absolute disposable .qa DB_PATH');
}
const db = new Database(dbPath, { fileMustExist: true });
try {
  if (db.prepare('SELECT COUNT(*) AS n FROM collection').get().n !== 0) throw new Error('Refusing to seed a nonempty collection');
  db.transaction(() => {
    for (const [id, title, reading] of [
      ['v95081', 'Gojuon QA Alpha', 'う'],
      ['v95082', 'Gojuon QA Zulu', 'あ'],
      ['v95083', 'Gojuon QA Middle', 'い'],
    ]) {
      db.prepare('INSERT INTO vn (id, title, alttitle, fetched_at) VALUES (?, ?, ?, ?)').run(id, title, '空の見本', 1);
      db.prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)').run(id, 'planning', 1, 1);
      db.prepare('INSERT INTO egs_game (vn_id, gamename_furigana, fetched_at) VALUES (?, ?, ?)').run(id, reading, 1);
    }
    db.prepare("INSERT INTO app_setting (key, value) VALUES ('vndb_fanout', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
  })();
  console.log('Seeded three isolated Japanese-sort QA rows');
} finally { db.close(); }
