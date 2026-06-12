// ══════════════════════════════════════════════════════════
// GradeBook PATCH — gradebook-import.js
//
// Drop this file into the GradeBook repo and <script src="gradebook-import.js">
// AFTER supabase-client.js and app.js in index.html.
//
// What this patch adds:
//  1. Reads quiz_results rows for letstry1 and letstry2
//  2. Upserts them into gradebook_entries with the correct schema
//  3. Adds an "Import from Apps" button to the GradeBook UI
// ══════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── Required Supabase tables ────────────────────────────
  //
  // CREATE TABLE IF NOT EXISTS quiz_results (
  //   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  //   user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  //   app         text NOT NULL,          -- 'letstry1' | 'letstry2' | 'nh5' | 'nh6' ...
  //   activity    text NOT NULL,          -- 'vocab' | 'build' | 'match'
  //   unit_id     integer NOT NULL,
  //   score       integer NOT NULL,
  //   total       integer NOT NULL,
  //   pct         integer NOT NULL,
  //   created_at  timestamptz DEFAULT now()
  // );
  //
  // CREATE TABLE IF NOT EXISTS gradebook_entries (
  //   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  //   user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  //   app         text NOT NULL,
  //   unit_id     integer NOT NULL,
  //   activity    text NOT NULL,
  //   last_score  integer,
  //   last_total  integer,
  //   last_pct    integer,
  //   best_pct    integer,
  //   attempt_count integer DEFAULT 0,
  //   updated_at  timestamptz DEFAULT now(),
  //   UNIQUE (user_id, app, unit_id, activity)
  // );
  //
  // ── RLS (Row Level Security) policies ──────────────────
  // Enable RLS on both tables and add policies:
  //   - INSERT/SELECT/UPDATE for authenticated users on their own rows (user_id = auth.uid())
  //   - SELECT for teachers/admins based on role in profiles table

  const SUPPORTED_APPS = ["letstry1", "letstry2", "nh5", "nh6"];

  async function importGradesForUser(userId) {
    if (!window.hk) {
      console.warn("[GB Import] Supabase client not ready");
      return { imported: 0, errors: 0 };
    }

    let imported = 0;
    let errors = 0;

    // Fetch all quiz_results for this user from supported apps
    const { data: results, error: fetchErr } = await window.hk.client
      .from("quiz_results")
      .select("*")
      .eq("user_id", userId)
      .in("app", SUPPORTED_APPS)
      .order("created_at", { ascending: false });

    if (fetchErr) {
      console.error("[GB Import] fetch error:", fetchErr.message);
      return { imported: 0, errors: 1 };
    }

    if (!results || results.length === 0) return { imported: 0, errors: 0 };

    // Aggregate best/last per (user_id, app, unit_id, activity)
    const grouped = {};
    for (const r of results) {
      const key = `${r.user_id}|${r.app}|${r.unit_id}|${r.activity}`;
      if (!grouped[key]) {
        grouped[key] = {
          user_id: r.user_id,
          app: r.app,
          unit_id: r.unit_id,
          activity: r.activity,
          last_score: r.score,
          last_total: r.total,
          last_pct: r.pct,
          best_pct: r.pct,
          attempt_count: 1,
          updated_at: r.created_at,
        };
      } else {
        const g = grouped[key];
        // results are ordered newest first; first one is already "last"
        g.attempt_count++;
        if (r.pct > g.best_pct) g.best_pct = r.pct;
      }
    }

    const entries = Object.values(grouped);

    // Batch upsert in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const { error } = await window.hk.client
        .from("gradebook_entries")
        .upsert(chunk, { onConflict: "user_id,app,unit_id,activity" });
      if (error) {
        console.error("[GB Import] upsert error:", error.message);
        errors += chunk.length;
      } else {
        imported += chunk.length;
      }
    }

    return { imported, errors };
  }

  // ── All-students import (teacher/admin only) ───────────
  async function importAllStudents() {
    if (!window.hk) return;
    const session = await window.hk.getSession();
    if (!session) return;

    // Check role
    const { data: profile } = await window.hk.client
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (!profile || !["teacher", "admin", "moderator"].includes(profile.role)) {
      alert("この機能は教師・管理者のみ使用できます。");
      return;
    }

    const btn = document.getElementById("gb-import-btn");
    if (btn) { btn.disabled = true; btn.textContent = "インポート中..."; }

    // Get all students
    const { data: students, error } = await window.hk.client
      .from("profiles")
      .select("id")
      .eq("role", "student");

    if (error || !students) {
      alert("生徒リストの取得に失敗しました。");
      if (btn) { btn.disabled = false; btn.textContent = "📥 成績をインポート"; }
      return;
    }

    let totalImported = 0;
    let totalErrors = 0;

    for (const student of students) {
      const { imported, errors } = await importGradesForUser(student.id);
      totalImported += imported;
      totalErrors += errors;
    }

    if (btn) { btn.disabled = false; btn.textContent = "📥 成績をインポート"; }
    alert(`インポート完了！\n成功: ${totalImported} 件\nエラー: ${totalErrors} 件`);

    // Trigger GradeBook refresh if the function exists
    if (typeof window.refreshGradeBook === "function") window.refreshGradeBook();
  }

  // ── Inject Import button into GradeBook UI ────────────
  function injectImportButton() {
    // Try to find the GradeBook header/action area
    const targets = [
      document.querySelector(".app-header .header-right"),
      document.querySelector("#gb-root"),
      document.querySelector(".gb-toolbar"),
    ];
    const target = targets.find(Boolean);
    if (!target) {
      // Retry after DOM settles
      setTimeout(injectImportButton, 1000);
      return;
    }

    const btn = document.createElement("button");
    btn.id = "gb-import-btn";
    btn.textContent = "📥 成績をインポート";
    btn.style.cssText = [
      "padding: 8px 14px",
      "border-radius: 8px",
      "border: 2px solid #1565C0",
      "background: transparent",
      "color: #1565C0",
      "font-size: 13px",
      "font-weight: 600",
      "cursor: pointer",
      "font-family: inherit",
      "margin-left: 8px",
      "transition: all .15s",
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "#E3F2FD"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    btn.addEventListener("click", importAllStudents);

    if (target.id === "gb-root") {
      const wrap = document.createElement("div");
      wrap.style.cssText = "padding: 12px 14px 0; display: flex; justify-content: flex-end;";
      wrap.appendChild(btn);
      target.insertBefore(wrap, target.firstChild);
    } else {
      target.appendChild(btn);
    }

    console.log("[GB Import] Import button injected");
  }

  // ── Auto-import on login ───────────────────────────────
  function setupAutoImport() {
    if (!window.hk) {
      // hk loads itself; retry until ready
    setTimeout(setupAutoImport, 300);
      return;
    }
    window.hk.onAuthChange(async (user) => {
      if (user) {
        await importGradesForUser(user.id);
        if (typeof window.refreshGradeBook === "function") window.refreshGradeBook();
      }
    });
  }

  // ── Init ─────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectImportButton();
      setupAutoImport();
    });
  } else {
    injectImportButton();
    setupAutoImport();
  }

  // Expose for manual calls
  window.gbImport = { importGradesForUser, importAllStudents };
  console.log("[GB Import] gradebook-import.js loaded");
})();
