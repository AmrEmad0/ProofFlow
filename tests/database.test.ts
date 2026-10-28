import { describe, expect, test } from "bun:test";
import { openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrations";
import { packproofTemplate } from "../src/shared/packproof";
import { hashContract } from "../src/server/engine/contract";

describe("SQLite migrations and constraints", () => {
  test("migrations are repeatable and foreign keys are enforced", () => {
    const db = openDatabase(":memory:");
    try {
      const applied = db.query("SELECT * FROM schema_migrations ORDER BY version").all();
      expect(applied.length).toBeGreaterThan(0);
      migrate(db);
      expect(db.query("SELECT * FROM schema_migrations ORDER BY version").all()).toEqual(applied);
      expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      expect(() => db.query("INSERT INTO runs (id, plan_version_id, state, video_path) VALUES (?, ?, ?, ?)")
        .run("run", "missing", "queued", "/private/clip.mp4")).toThrow();
    } finally { db.close(); }
  });

  test("approved versions cannot be changed or deleted; draft plans cannot create runs", () => {
    const db = openDatabase(":memory:");
    try {
      db.query("INSERT INTO plans (id, title) VALUES (?, ?)").run("plan", "PackProof");
      db.query("INSERT INTO plan_versions (id, plan_id, version, status, title_snapshot, goal_snapshot, steps_json, limitations_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run("version", "plan", 1, "draft", packproofTemplate.title, packproofTemplate.goal, JSON.stringify(packproofTemplate.steps), JSON.stringify(packproofTemplate.limitations));
      const run = db.query("INSERT INTO runs (id, plan_version_id, state, video_path) VALUES (?, ?, ?, ?)");
      expect(() => run.run("early", "version", "queued", "/private/clip.mp4")).toThrow("Runs require an approved plan");
      db.query("UPDATE plan_versions SET status = 'approved', contract_hash = ?, approved_at = ? WHERE id = ?")
        .run(hashContract(packproofTemplate), new Date().toISOString(), "version");
      expect(() => db.query("UPDATE plan_versions SET title_snapshot = ? WHERE id = ?").run("Changed", "version")).toThrow("immutable");
      expect(() => db.query("DELETE FROM plan_versions WHERE id = ?").run("version")).toThrow("immutable");
      run.run("valid", "version", "queued", "/private/clip.mp4");
      expect(() => run.run("invalid", "version", "passed", "/private/clip.mp4")).toThrow();
    } finally { db.close(); }
  });
});
