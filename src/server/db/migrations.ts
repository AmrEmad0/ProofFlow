import type { Database } from "bun:sqlite";

const migrations = [{
  version: 1,
  sql: `
    CREATE TABLE plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE plan_versions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      version INTEGER NOT NULL CHECK (version > 0),
      status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
      title_snapshot TEXT NOT NULL,
      goal_snapshot TEXT NOT NULL,
      steps_json TEXT NOT NULL CHECK (json_valid(steps_json)),
      limitations_json TEXT NOT NULL CHECK (json_valid(limitations_json)),
      contract_hash TEXT,
      approved_at TEXT,
      UNIQUE(plan_id, version),
      CHECK (status != 'approved' OR (contract_hash IS NOT NULL AND approved_at IS NOT NULL))
    );
    CREATE TRIGGER immutable_approved_plan_update BEFORE UPDATE ON plan_versions
      WHEN OLD.status = 'approved' BEGIN SELECT RAISE(ABORT, 'Approved plans are immutable'); END;
    CREATE TRIGGER immutable_approved_plan_delete BEFORE DELETE ON plan_versions
      WHEN OLD.status = 'approved' BEGIN SELECT RAISE(ABORT, 'Approved plans are immutable'); END;
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      plan_version_id TEXT NOT NULL REFERENCES plan_versions(id),
      state TEXT NOT NULL CHECK (state IN ('queued', 'preprocessing', 'uploading', 'analyzing', 'verifying', 'completed', 'failed')),
      video_path TEXT NOT NULL,
      video_sha256 TEXT,
      duration_ms INTEGER CHECK (duration_ms > 0 AND duration_ms <= 20000),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      completed_at TEXT,
      error_message TEXT
    );
    CREATE TRIGGER runs_require_approved_plan BEFORE INSERT ON runs
      WHEN (SELECT status FROM plan_versions WHERE id = NEW.plan_version_id) != 'approved'
      BEGIN SELECT RAISE(ABORT, 'Runs require an approved plan'); END;
    CREATE TABLE findings (
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('observed', 'not_observed', 'uncertain')),
      start_ms INTEGER,
      end_ms INTEGER,
      explanation TEXT NOT NULL,
      evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
      PRIMARY KEY (run_id, step_id),
      CHECK ((start_ms IS NULL AND end_ms IS NULL) OR (start_ms IS NOT NULL AND end_ms IS NOT NULL AND start_ms >= 0 AND end_ms >= start_ms))
    );
    CREATE TABLE track_artifacts (
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      concept TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      model_version TEXT NOT NULL,
      outcome TEXT NOT NULL,
      PRIMARY KEY (run_id, concept)
    );
    CREATE INDEX runs_state_created_at ON runs(state, created_at);
    CREATE INDEX plan_versions_plan_id ON plan_versions(plan_id);
  `,
}, {
  version: 2,
  sql: `
    CREATE TABLE planner_owners (
      plan_id TEXT PRIMARY KEY REFERENCES plans(id),
      session_hash TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX planner_owners_session ON planner_owners(session_hash);
    CREATE TABLE planner_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX planner_messages_plan ON planner_messages(plan_id, id);
  `,
}, {
  version: 3,
  sql: `
    ALTER TABLE runs ADD COLUMN normalized_path TEXT;
    ALTER TABLE runs ADD COLUMN remote_file_id TEXT;
    ALTER TABLE runs ADD COLUMN media_json TEXT CHECK (media_json IS NULL OR json_valid(media_json));
    ALTER TABLE runs ADD COLUMN receipt_json TEXT CHECK (receipt_json IS NULL OR json_valid(receipt_json));
    ALTER TABLE runs ADD COLUMN timings_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(timings_json));
    ALTER TABLE runs ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json));
    ALTER TABLE runs ADD COLUMN consent_at TEXT;
    ALTER TABLE runs ADD COLUMN expires_at TEXT;
    CREATE TABLE verification_worker (
      id INTEGER PRIMARY KEY CHECK (id = 1), owner TEXT NOT NULL, lease_until INTEGER NOT NULL
    );
  `,
}, {
  version: 4,
  sql: `ALTER TABLE plans ADD COLUMN deleted_at TEXT;`,
}];

export function migrate(db: Database): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const applied = db.query<{ version: number }, []>("SELECT version FROM schema_migrations").all();
  for (const migration of migrations) {
    if (applied.some((row) => row.version === migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      db.query("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
    })();
  }
}
