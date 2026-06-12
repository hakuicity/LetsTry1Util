// ══════════════════════════════════════════════════════════
// supabase-bridge.js — Let's Try 2 Supabase + GradeBook Bridge
//
// Instructions:
// 1. Copy supabase-client.js and this file into the LetsTry2Utility repo.
// 2. In index.html, BEFORE the closing </body>, add:
//      <script src="supabase-client.js"></script>
//      <script src="supabase-bridge.js"></script>
// 3. Replace YOUR_PROJECT_ID and YOUR_ANON_KEY in supabase-client.js.
//
// What this adds:
//   • Login button in the top-right header
//   • Auth modal (email + student-ID tabs, same pattern as NH6)
//   • Saves quiz/build results to quiz_results + gradebook_entries
//   • Loads user's cumulative stats on the home screen
// ══════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── CSS injection ────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #lt2-auth-btn {
      padding: 7px 14px; border-radius: 8px;
      border: 2px solid #1565C0; background: transparent;
      cursor: pointer; font-size: 13px; font-weight: 600;
      color: #1565C0; transition: all .15s; font-family: inherit;
    }
    #lt2-auth-btn:hover { background: #E3F2FD; }
    #lt2-auth-btn.logged-in { background: #1565C0; color: #fff; }
    #lt2-auth-modal {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }
    #lt2-auth-modal.hidden { display: none !important; }
    .lt2-modal-box {
      background: var(--surface, #fff); border-radius: 16px;
      padding: 24px; max-width: 360px; width: 90%; position: relative;
      box-shadow: 0 8px 32px rgba(0,0,0,.2);
    }
    .lt2-modal-close {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none; font-size: 20px; cursor: pointer;
      color: #90A4AE;
    }
    .lt2-modal-title { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .lt2-modal-sub { font-size: 13px; color: #607D8B; margin-bottom: 16px; }
    .lt2-modal-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
    .lt2-modal-tab {
      flex: 1; padding: 8px; border-radius: 8px; border: 2px solid #e0e0e0;
      background: #fff; cursor: pointer; font-size: 13px; font-weight: 600;
      font-family: inherit; color: #607D8B; transition: all .15s;
    }
    .lt2-modal-tab.active { background: #1565C0; color: #fff; border-color: #1565C0; }
    .lt2-modal-field { margin-bottom: 12px; }
    .lt2-modal-field label { display: block; font-size: 12px; font-weight: 700; color: #607D8B; margin-bottom: 5px; }
    .lt2-modal-field input {
      width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0;
      border-radius: 8px; font-size: 15px; background: #ECEFF1;
      color: inherit; font-family: inherit;
    }
    .lt2-modal-field input:focus { outline: none; border-color: #1565C0; }
    .lt2-modal-submit {
      display: block; width: 100%; padding: 12px;
      background: #1565C0; color: #fff; border: none; border-radius: 10px;
      font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 8px;
    }
    .lt2-modal-submit:hover { background: #0D47A1; }
    .lt2-modal-err {
      background: #FFEBEE; border: 1px solid #FFCDD2; border-radius: 8px;
      padding: 10px 12px; font-size: 13px; color: #c62828; margin-bottom: 12px;
    }
    .lt2-modal-user-info {
      background: #ECEFF1; border-radius: 10px; padding: 14px; margin-bottom: 14px;
    }
    .lt2-modal-user-name { font-size: 16px; font-weight: 700; margin-bottom: 3px; }
    .lt2-modal-user-email { font-size: 13px; color: #607D8B; }
    .lt2-dashboard-link {
      display: block; text-align: center; padding: 10px;
      background: #E3F2FD; color: #1565C0; border-radius: 8px;
      font-size: 13px; font-weight: 700; text-decoration: none; margin-bottom: 10px;
    }
    .lt2-signout-btn {
      display: block; width: 100%; padding: 10px; background: none;
      border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; font-family: inherit; color: #607D8B;
    }
    .lt2-signout-btn:hover { border-color: #c62828; color: #c62828; }
    .lt2-sync-banner {
      background: #E8F5E9; border: 1px solid #A5D6A7; border-radius: 10px;
      padding: 10px 14px; font-size: 13px; color: #2E7D32;
      margin-top: 10px; display: flex; align-items: center; gap: 8px;
    }
    .lt2-sync-banner.error { background: #FFF8E1; border-color: #FFE082; color: #F57F17; }
  `;
  document.head.appendChild(style);

  // ── Auth modal HTML ───────────────────────────────────
  const modalHTML = `
    <div id="lt2-auth-modal" class="hidden">
      <div class="lt2-modal-box">
        <button class="lt2-modal-close" id="lt2-modal-close">×</button>
        <h2 class="lt2-modal-title">ログイン</h2>
        <p class="lt2-modal-sub">成績をクラウドに保存します</p>
        <div class="lt2-modal-err hidden" id="lt2-modal-err"></div>
        <div id="lt2-login-form">
          <div class="lt2-modal-tabs">
            <button class="lt2-modal-tab active" id="lt2-tab-email">📧 メール</button>
            <button class="lt2-modal-tab" id="lt2-tab-sid">🎓 学籍番号</button>
          </div>
          <div id="lt2-email-form">
            <div class="lt2-modal-field"><label>メールアドレス</label><input type="email" id="lt2-m-email" placeholder="example@school.ed.jp"></div>
            <div class="lt2-modal-field"><label>パスワード</label><input type="password" id="lt2-m-pass" placeholder="••••••••"></div>
          </div>
          <div id="lt2-sid-form" style="display:none">
            <div class="lt2-modal-field"><label>学籍番号</label><input type="text" id="lt2-m-sid" placeholder="例：S001"></div>
            <div class="lt2-modal-field"><label>パスワード</label><input type="password" id="lt2-m-sidpass" placeholder="••••••••"></div>
          </div>
          <button class="lt2-modal-submit" id="lt2-modal-submit">ログイン</button>
        </div>
        <div id="lt2-loggedin" style="display:none">
          <div class="lt2-modal-user-info">
            <div class="lt2-modal-user-name" id="lt2-user-name"></div>
            <div class="lt2-modal-user-email" id="lt2-user-email"></div>
          </div>
          <a href="https://hakuicity.github.io/site/account/" target="_blank" class="lt2-dashboard-link">📊 マイページを見る →</a>
          <button class="lt2-signout-btn" id="lt2-signout">ログアウト</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  // ── State ─────────────────────────────────────────────
  let currentUser = null;

  // ── Inject auth button ────────────────────────────────
  function injectAuthButton() {
    const topControls = document.querySelector(".top-controls");
    if (!topControls) { setTimeout(injectAuthButton, 500); return; }

    const btn = document.createElement("button");
    btn.id = "lt2-auth-btn";
    btn.textContent = "ログイン";
    // Insert before theme button
    const themeBtn = topControls.querySelector(".theme-btn");
    if (themeBtn) topControls.insertBefore(btn, themeBtn);
    else topControls.appendChild(btn);

    btn.addEventListener("click", openModal);
    console.log("[LT2 Bridge] Auth button injected");
  }

  // ── Modal controls ────────────────────────────────────
  function openModal() {
    const modal = document.getElementById("lt2-auth-modal");
    modal.classList.remove("hidden");
    if (currentUser) {
      document.getElementById("lt2-login-form").style.display = "none";
      document.getElementById("lt2-loggedin").style.display = "block";
      document.getElementById("lt2-user-name").textContent = currentUser.display_name || "ユーザー";
      document.getElementById("lt2-user-email").textContent = currentUser.email || "";
    } else {
      document.getElementById("lt2-login-form").style.display = "block";
      document.getElementById("lt2-loggedin").style.display = "none";
    }
  }

  function closeModal() {
    document.getElementById("lt2-auth-modal").classList.add("hidden");
    document.getElementById("lt2-modal-err").classList.add("hidden");
    document.getElementById("lt2-modal-err").textContent = "";
  }

  document.getElementById("lt2-modal-close").addEventListener("click", closeModal);
  document.getElementById("lt2-auth-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("lt2-auth-modal")) closeModal();
  });

  // Tab switching
  document.getElementById("lt2-tab-email").addEventListener("click", () => {
    document.getElementById("lt2-tab-email").classList.add("active");
    document.getElementById("lt2-tab-sid").classList.remove("active");
    document.getElementById("lt2-email-form").style.display = "block";
    document.getElementById("lt2-sid-form").style.display = "none";
  });
  document.getElementById("lt2-tab-sid").addEventListener("click", () => {
    document.getElementById("lt2-tab-sid").classList.add("active");
    document.getElementById("lt2-tab-email").classList.remove("active");
    document.getElementById("lt2-email-form").style.display = "none";
    document.getElementById("lt2-sid-form").style.display = "block";
  });

  // Login submit
  document.getElementById("lt2-modal-submit").addEventListener("click", async () => {
    const errEl = document.getElementById("lt2-modal-err");
    errEl.classList.add("hidden");

    if (!window.hk) {
      errEl.textContent = "接続中です。少々お待ちください。";
      errEl.classList.remove("hidden");
      return;
    }

    const isSid = document.getElementById("lt2-tab-sid").classList.contains("active");
    const submitBtn = document.getElementById("lt2-modal-submit");
    submitBtn.textContent = "ログイン中...";

    try {
      let data;
      if (isSid) {
        const sid = document.getElementById("lt2-m-sid").value.trim();
        const password = document.getElementById("lt2-m-sidpass").value;
        if (!sid) throw new Error("学籍番号を入力してください。");
        if (!password) throw new Error("パスワードを入力してください。");
        data = await window.hk.signInWithStudentId(sid, password);
      } else {
        const email = document.getElementById("lt2-m-email").value.trim();
        const password = document.getElementById("lt2-m-pass").value;
        if (!email) throw new Error("メールアドレスを入力してください。");
        if (!password) throw new Error("パスワードを入力してください。");
        data = await window.hk.signIn(email, password);
      }
      const user = data.user || data.session?.user;
      const profile = await window.hk.getProfile(user.id);
      currentUser = {
        id: user.id,
        email: user.email,
        display_name: profile?.display_name || user.email,
        role: profile?.role || "student"
      };
      updateAuthUI();
      closeModal();
    } catch(e) {
      errEl.textContent = e.message || "ログインに失敗しました。";
      errEl.classList.remove("hidden");
    } finally {
      submitBtn.textContent = "ログイン";
    }
  })

  document.getElementById("lt2-signout").addEventListener("click", async () => {
    if (window.hk) await window.hk.signOut().catch(() => {});
    currentUser = null;
    updateAuthUI();
    closeModal();
  });

  function updateAuthUI() {
    const btn = document.getElementById("lt2-auth-btn");
    if (!btn) return;
    if (currentUser) {
      btn.textContent = currentUser.display_name || currentUser.email || "ログイン中";
      btn.classList.add("logged-in");
    } else {
      btn.textContent = "ログイン";
      btn.classList.remove("logged-in");
    }
  }

  // ── Grade saving ──────────────────────────────────────
  async function saveResult(actType, unitId, score, total) {
    if (!currentUser || !window.hk) return false;
    try {
      await window.hk.syncQuizResult({
        app_id: 'letstry2',
        level: 'unit' + unitId,
        setId: 'unit' + unitId,
        category: actType,
        correct: score,
        total: total
      });
      return true;
    } catch(e) {
      console.warn("[LT2 Bridge] Save failed:", e.message);
      return false;
    }
  }

  // ── Hook into existing review screen ─────────────────
  //
  // The LetsTry2 app shows #review-screen when done.
  // We use a MutationObserver to detect when it becomes visible,
  // then extract the score and save it.
  //
  function hookReviewScreen() {
    const reviewScreen = document.getElementById("review-screen");
    if (!reviewScreen) { setTimeout(hookReviewScreen, 1000); return; }

    const observer = new MutationObserver(() => {
      if (!reviewScreen.classList.contains("hidden")) {
        // Extract score from DOM elements that LetsTry2 already renders
        const pctEl    = document.getElementById("rv-pct");
        const correctEl= document.getElementById("rv-correct");
        const totalEl  = document.getElementById("rv-total");
        if (!pctEl || !correctEl || !totalEl) return;

        const score = parseInt(correctEl.textContent) || 0;
        const total = parseInt(totalEl.textContent) || 0;
        if (total === 0) return;

        // Get unit from active tab
        const activeTab = document.querySelector(".unit-tab.active");
        const unitId = activeTab ? parseInt(activeTab.dataset.unit) || 0 : 0;

        // Determine activity from current screen transition
        // We sniff which screen was last shown before review
        const actType = window._lt2LastActivity || "vocab";

        (async () => {
          const saved = await saveResult(actType, unitId, score, total);
          // Inject sync banner below the score area if not already there
          if (!document.getElementById("lt2-rv-sync")) {
            const syncDiv = document.createElement("div");
            syncDiv.id = "lt2-rv-sync";
            const scoreCircle = reviewScreen.querySelector(".score-circle")?.parentElement;
            if (scoreCircle) scoreCircle.after(syncDiv);
            else reviewScreen.insertBefore(syncDiv, reviewScreen.firstChild);
          }
          const syncDiv = document.getElementById("lt2-rv-sync");
          if (currentUser) {
            syncDiv.innerHTML = saved
              ? `<div class="lt2-sync-banner">☁️ 成績をクラウドに保存しました！</div>`
              : `<div class="lt2-sync-banner error">⚠️ 保存に失敗しました。</div>`;
          } else {
            syncDiv.innerHTML = `<div class="lt2-sync-banner error" style="cursor:pointer" id="lt2-rv-login">🔑 ログインして成績を保存しましょう！</div>`;
            document.getElementById("lt2-rv-login")?.addEventListener("click", openModal);
          }
        })();
      }
    });
    observer.observe(reviewScreen, { attributes: true, attributeFilter: ["class"] });

    // Track last activity type
    ["quiz-screen","flash-screen","match-screen","build-screen"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => {
        if (!el.classList.contains("hidden")) {
          window._lt2LastActivity = id.replace("-screen","");
        }
      }).observe(el, { attributes: true, attributeFilter: ["class"] });
    });

    console.log("[LT2 Bridge] Review screen hook active");
  }

  // ── Session restore ───────────────────────────────────
  async function restoreSession() {
    if (!window.hk) return;
    window.hk.onAuthChange(async (user) => {
      if (user) {
        const profile = await window.hk.getProfile(user.id);
        currentUser = {
          id: user.id,
          email: user.email,
          display_name: profile?.display_name || user.email,
          role: profile?.role || "student"
        };
      } else {
        currentUser = null;
      }
      updateAuthUI();
    });
  }

  // ── Init ─────────────────────────────────────────────
  function init() {
    injectAuthButton();
    hookReviewScreen();
    // hk client loads itself; onAuthChange waits internally
    restoreSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for external calls
  window.lt2Bridge = { saveResult, openModal, getCurrentUser: () => currentUser };
  console.log("[LT2 Bridge] supabase-bridge.js loaded");
})();
