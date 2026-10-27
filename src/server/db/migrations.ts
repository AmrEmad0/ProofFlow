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
