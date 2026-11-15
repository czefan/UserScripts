// ==UserScript==
// @name         GitHub 用户名检测
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.1
// @description  批量检测 GitHub 用户名可用性
// @author       czefan
// @license      GPL-3.0
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        https://github.com/settings/admin
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/release/github-username-checker.meta.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/release/github-username-checker.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // userscripts/github-username-checker/core.ts
  var DEFAULT_CHECK_TIMEOUT = 8e3;
  var DEFAULT_CHECK_INTERVAL = 500;
  var DEFAULT_RATE_LIMIT_COOL = 2e4;
  var USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
  var SK = {
    LIST: "gh_check_list",
    SOUND: "gh_check_sound",
    LEFT: "gh_check_secondary_left",
    TOP: "gh_check_secondary_top",
    FONT: "gh_check_font_size"
  };
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function jsonSafe(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function parseList(text) {
    return [...new Set(text.toLowerCase().split(/[\s,，]+/).filter(Boolean))];
  }
  function getListKey(list) {
    const s = JSON.stringify(list || []);
    let h1 = 3735928559;
    let h2 = 1103547991;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return `v2_${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}`;
  }
  async function checkUsername(name, acEl, signal, deps = {}) {
    const endpoint = acEl.getAttribute("src");
    if (!endpoint) return "unknown";
    const origin = deps.locationOrigin ?? window.location.origin;
    const href = deps.locationHref ?? window.location.href;
    const url = new URL(endpoint, href);
    if (url.origin !== origin || url.pathname !== "/account/rename_check") {
      return "unknown";
    }
    const method = acEl.getAttribute("http-method") === "GET" ? "GET" : "POST";
    const body = new FormData();
    if (method === "POST") {
      const csrf = acEl.getAttribute("csrf") || acEl.querySelector("input[data-csrf]")?.value;
      if (!csrf) return "unknown";
      body.append(acEl.getAttribute("csrf-field") || "authenticity_token", csrf);
      body.append("value", name);
    } else {
      url.searchParams.set("value", name);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const fetchImpl = deps.fetchFn ?? fetch;
    const timeoutMs = deps.checkTimeout ?? DEFAULT_CHECK_TIMEOUT;
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        body: method === "POST" ? body : void 0,
        credentials: "same-origin",
        redirect: "error",
        signal: controller.signal
      });
      if (signal.aborted) return "cancelled";
      if (response.ok) return "success";
      if (response.status === 429) return "rate-limited";
      if (response.status === 422) return "unavailable";
      return "unknown";
    } catch {
      return signal.aborted ? "cancelled" : "unknown";
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }
  function createCheckerController(deps) {
    const doc = deps.doc ?? document;
    const storage = deps.storage ?? localStorage;
    const checkInterval = deps.checkInterval ?? DEFAULT_CHECK_INTERVAL;
    const rateLimitCool = deps.rateLimitCool ?? DEFAULT_RATE_LIMIT_COOL;
    const { ui } = deps;
    let isRunning = false;
    let activeRun = null;
    let targetList = [];
    let confirmedList = [];
    let currentIndex = 0;
    function resetUI() {
      ui.setListDisabled(false);
      ui.setGoButton("开始检测", "#2da44e", false);
    }
    function stopChecking() {
      const run = activeRun;
      activeRun = null;
      isRunning = false;
      run?.controller.abort();
      resetUI();
    }
    function syncListState() {
      targetList = parseList(ui.getListText());
      const key = getListKey(targetList);
      const savedIdx = storage.getItem("gh_check_index_" + key);
      const idx = Number(savedIdx);
      currentIndex = Number.isInteger(idx) ? Math.max(0, Math.min(idx, targetList.length)) : 0;
      ui.updateProgress(currentIndex, targetList.length);
      const savedWinners = jsonSafe(
        storage.getItem("gh_check_winners_" + key),
        []
      );
      confirmedList = Array.isArray(savedWinners) ? savedWinners.filter(
        (name) => typeof name === "string" && targetList.includes(name)
      ) : [];
      ui.updateWinners(confirmedList);
    }
    async function startChecking() {
      if (activeRun) return;
      syncListState();
      if (!targetList.length) {
        ui.alertUser("请先粘贴待测名单！");
        return;
      }
      const inputEl = doc.querySelector("input#login");
      const acEl = inputEl?.closest?.("auto-check");
      const dialog = inputEl?.closest?.("dialog");
      if (!inputEl || !acEl || dialog && !dialog.open) {
        ui.alertUser("未检测到输入框或校验组件！请先打开更改用户名弹窗。");
        return;
      }
      const run = {
        controller: new AbortController(),
        list: [...targetList]
      };
      activeRun = run;
      isRunning = true;
      const onClose = () => {
        if (activeRun !== run) return;
        stopChecking();
        ui.setStatus("改名窗口已关闭，检测已暂停", "#bf8700");
      };
      dialog?.addEventListener("close", onClose, {
        signal: run.controller.signal
      });
      dialog?.addEventListener("cancel", onClose, {
        signal: run.controller.signal
      });
      ui.setListDisabled(true);
      ui.setGoButton("停止检测", "#cf222e");
      ui.setStatus("正在检测中...", "#0969da");
      const key = getListKey(run.list);
      const isActive = () => activeRun === run && !run.controller.signal.aborted;
      ui.logToPanel(`▶ 启动检测：总量=${run.list.length}`, "#2da44e");
      let completed = false;
      try {
        storage.setItem(SK.LIST, ui.getListText());
        for (let i = currentIndex; i < run.list.length; i++) {
          if (!isActive()) return;
          if (!inputEl.isConnected || dialog && !dialog.open) {
            ui.setStatus("改名窗口已关闭，检测已暂停", "#bf8700");
            return;
          }
          const name = run.list[i];
          currentIndex = i;
          ui.updateProgress(i, run.list.length);
          storage.setItem("gh_check_index_" + key, String(i));
          if (USERNAME_RE.test(name)) {
            const result = await checkUsername(name, acEl, run.controller.signal, {
              fetchFn: deps.fetchFn,
              locationHref: deps.locationHref,
              locationOrigin: deps.locationOrigin,
              checkTimeout: deps.checkTimeout
            });
            if (!isActive()) return;
            if (!inputEl.isConnected || dialog && !dialog.open) {
              ui.setStatus("改名窗口已关闭，检测已暂停", "#bf8700");
              return;
            }
            if (result === "success") {
              ui.logToPanel(`✔️ 发现可用: ${name}`, "#2da44e");
              if (!confirmedList.includes(name)) {
                confirmedList.push(name);
                ui.updateWinners(confirmedList);
                storage.setItem(
                  "gh_check_winners_" + key,
                  JSON.stringify(confirmedList)
                );
              }
              ui.playSound();
            } else if (result === "rate-limited") {
              ui.logToPanel(
                `触发限流，冷却 ${rateLimitCool / 1e3}s 后重试`,
                "#cf222e"
              );
              const end = Date.now() + rateLimitCool;
              while (Date.now() < end && isActive()) {
                ui.setStatus(
                  `限流冷却 (${Math.max(0, (end - Date.now()) / 1e3).toFixed(1)}s)`,
                  "#cf222e"
                );
                await sleep(100);
              }
              if (!isActive()) return;
              ui.setStatus("正在检测中...", "#0969da");
              i--;
              continue;
            } else if (result === "unavailable") {
              ui.logToPanel(`检查 [${name}] -> 不可用`, "#8c959f");
            } else {
              ui.setStatus("校验未确认，已暂停；可点击开始重试", "#bf8700");
              ui.logToPanel(
                `⚠️ [${name}] 请求失败或超时，保留当前位置，不计入可用名单`,
                "#bf8700"
              );
              return;
            }
          } else {
            ui.logToPanel(`❌ [${name}] 格式不合法，略过`, "#8c959f");
          }
          currentIndex = i + 1;
          storage.setItem("gh_check_index_" + key, String(currentIndex));
          ui.updateProgress(currentIndex, run.list.length);
          if (i + 1 < run.list.length && checkInterval > 0) {
            await sleep(checkInterval);
          }
        }
        completed = true;
      } catch (err) {
        if (isActive()) {
          const message = err instanceof Error ? err.message : String(err);
          ui.setStatus("检测异常，已暂停", "#cf222e");
          ui.logToPanel(`检测失败: ${message}`, "#cf222e");
        }
      } finally {
        if (activeRun === run) {
          run.controller.abort();
          activeRun = null;
          isRunning = false;
          resetUI();
          if (completed) {
            ui.setStatus("检测结束！", "#2da44e");
            ui.logToPanel("🎉 检测全部结束！", "#2da44e");
          }
        }
      }
    }
    function handleStartClick() {
      if (!isRunning) {
        const tmpList = parseList(ui.getListText());
        const key = getListKey(tmpList);
        const savedIdx = storage.getItem("gh_check_index_" + key);
        if (savedIdx !== null && parseInt(savedIdx, 10) >= tmpList.length) {
          if (ui.confirmAction("🔍 当前名单已全部检测完毕！\n是否重置进度重新扫描？")) {
            currentIndex = 0;
            confirmedList = [];
            storage.setItem("gh_check_index_" + key, "0");
            storage.setItem("gh_check_winners_" + key, "[]");
            ui.updateWinners([]);
            ui.updateProgress(0, tmpList.length);
            ui.logToPanel("🔄 已重置进度，重新检测...", "#cf222e");
          } else {
            return;
          }
        }
        void startChecking();
      } else {
        stopChecking();
        ui.setStatus("任务已中止", "#bf8700");
        ui.logToPanel("⏸️ 任务已手动中止", "#bf8700");
      }
    }
    function handleResetClick() {
      if (!ui.confirmAction(
        "⚠️ 确定重置当前名单的进度吗？\n将清空检测进度与已发现的可用 ID。"
      )) {
        return;
      }
      stopChecking();
      targetList = parseList(ui.getListText());
      currentIndex = 0;
      confirmedList = [];
      const key = getListKey(targetList);
      storage.removeItem("gh_check_index_" + key);
      storage.removeItem("gh_check_winners_" + key);
      ui.updateWinners([]);
      ui.updateProgress(0, targetList.length);
      ui.setStatus("进度已重置", "#cf222e");
      ui.logToPanel("🔄 进度和可用 ID 已全部重置", "#cf222e");
      resetUI();
    }
    return {
      isRunning: () => isRunning,
      getState: () => ({
        isRunning,
        currentIndex,
        targetList: [...targetList],
        confirmedList: [...confirmedList]
      }),
      syncListState,
      startChecking,
      stopChecking,
      handleStartClick,
      handleResetClick
    };
  }

  // userscripts/github-username-checker/panel.ts
  function initGithubChecker() {
    let fontSize = parseInt(localStorage.getItem(SK.FONT) || "15", 10);
    let soundEnabled = localStorage.getItem(SK.SOUND) === "true";
    let audioCtx = null;
    const box = document.createElement("div");
    box.className = "fs-panel";
    box.style.setProperty("--fs", `${fontSize}px`);
    box.style.opacity = "0";
    box.style.transform = "translateY(10px) scale(0.98)";
    box.innerHTML = `
    <style>
    .fs-panel { position:fixed; z-index:2147483647; width:340px; background:#fff; border:1px solid #d0d7de; border-radius:6px; box-shadow:0 8px 24px rgba(140,149,159,.5); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; color:#24292f; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; transition:opacity .35s cubic-bezier(.16,1,.3,1),transform .35s cubic-bezier(.16,1,.3,1); }
    .fs-hdr { cursor:move; user-select:none; padding:8px 15px; border-bottom:1px solid #d0d7de; background:#f6f8fa; border-radius:6px 6px 0 0; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
    .fs-hdr .t { font-weight:bold; font-size:calc(var(--fs) + 2px); pointer-events:none; }
    .fs-hdr .c { display:flex; align-items:center; gap:12px; }
    .fs-fc { display:flex; align-items:center; gap:3px; font-size:calc(var(--fs) - 1px); user-select:none; }
    .fs-fb { position:relative; display:flex; align-items:center; background:#fff; border:1px solid #d0d7de; border-radius:3px; padding:0 16px 0 4px; height:18px; min-width:18px; box-sizing:border-box; overflow:hidden; }
    .fs-fb .v { font-size:calc(var(--fs) - 2px); line-height:1; }
    .fs-faw { position:absolute; right:0; top:0; bottom:0; width:14px; border-left:1px solid #d0d7de; display:flex; flex-direction:column; }
    .fs-fa { flex:1; display:flex; align-items:center; justify-content:center; cursor:pointer; background:#f6f8fa; color:#57606a; user-select:none; }
    .fs-fa:hover { background:#e3e6e9; }
    .fs-fa:first-child { border-bottom:1px solid #d0d7de; }
    .fs-fa span { width:4px; height:4px; display:inline-block; border:0 solid #57606a; }
    .fs-fa-u span { border-top-width:1px; border-left-width:1px; transform:rotate(45deg); margin-top:2px; }
    .fs-fa-d span { border-bottom-width:1px; border-right-width:1px; transform:rotate(45deg); margin-bottom:2px; }
    .fs-snd { font-size:calc(var(--fs) - 1px); cursor:pointer; display:flex; align-items:center; gap:2px; user-select:none; font-weight:normal; }
    .fs-body { display:flex; flex-direction:column; gap:6px; padding:8px 15px; flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; box-sizing:border-box; }
    .fs-hint { font-size:calc(var(--fs) - 1px); color:#57606a; line-height:1.2; flex-shrink:0; }
    .fs-ta { width:100%; font-size:calc(var(--fs) - 1px); border:1px solid #d0d7de; border-radius:4px; padding:6px; box-sizing:border-box; font-family:monospace; resize:vertical; flex-shrink:1; margin:0; }
    #fs-ipt { height:95px; min-height:35px; }
    .fs-btns { display:flex; gap:4px; flex-shrink:0; }
    .fs-btn { border:1px solid rgba(27,31,36,.15); padding:5px 8px; border-radius:6px; font-size:calc(var(--fs) - 1px); cursor:pointer; }
    #fs-go { background:#2da44e; color:#fff; font-weight:600; flex:1.5; }
    #fs-rst { background:#f6f8fa; color:#24292f; flex:.8; }
    .fs-stline { font-size:var(--fs); flex-shrink:0; line-height:1.2; }
    .fs-loghdr { font-size:var(--fs); font-weight:bold; color:#57606a; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; line-height:1.2; }
    .fs-loghdr .p { font-weight:normal; font-size:calc(var(--fs) - 1px); color:#24292f; }
    #fs-log { width:100%; height:135px; min-height:45px; font-size:calc(var(--fs) - 1px); border:1px solid #3e4451; border-radius:4px; background:#323641; color:#abb2bf; padding:6px; box-sizing:border-box; overflow:auto; font-family:monospace; line-height:1.3; resize:vertical; flex-shrink:1; margin:0; }
    .fs-wt { font-size:var(--fs); font-weight:bold; color:#1a7f37; flex-shrink:0; line-height:1.2; }
    #fs-win { height:95px; min-height:30px; border-color:#2da44e; background:#f0fff4; color:#1a7f37; font-weight:bold; }
    #fs-win:focus { outline:none; border-color:#2da44e; box-shadow:none; }
    .fs-body::-webkit-scrollbar, #fs-log::-webkit-scrollbar, #fs-win::-webkit-scrollbar, #fs-ipt::-webkit-scrollbar { width:8px; height:8px; }
    .fs-body::-webkit-scrollbar-track, #fs-log::-webkit-scrollbar-track, #fs-win::-webkit-scrollbar-track, #fs-ipt::-webkit-scrollbar-track { background:transparent; }
    #fs-log::-webkit-scrollbar-thumb { background:rgba(180,180,180,.4); border:3px solid transparent; background-clip:padding-box; border-radius:10px; min-height:24px; }
    #fs-log:hover::-webkit-scrollbar-thumb { background-color:rgba(180,180,180,.5); }
    #fs-log::-webkit-scrollbar-thumb:hover { background-color:rgba(180,180,180,.6) !important; border-width:1px; }
    .fs-body::-webkit-scrollbar-thumb, #fs-win::-webkit-scrollbar-thumb, #fs-ipt::-webkit-scrollbar-thumb { background:rgba(140,149,159,.35); border:3px solid transparent; background-clip:padding-box; border-radius:10px; min-height:24px; }
    .fs-body:hover::-webkit-scrollbar-thumb, #fs-win:hover::-webkit-scrollbar-thumb, #fs-ipt:hover::-webkit-scrollbar-thumb { background-color:rgba(140,149,159,.45); }
    .fs-body::-webkit-scrollbar-thumb:hover, #fs-win::-webkit-scrollbar-thumb:hover, #fs-ipt::-webkit-scrollbar-thumb:hover { background-color:rgba(140,149,159,.55) !important; border-width:1px; }
    </style>
    <div class="fs-hdr" id="fs-hdr">
        <span class="t">GitHub 用户名检测</span>
        <div class="c">
            <div class="fs-fc"><span>字号:</span>
                <div class="fs-fb"><span class="v" id="fs-fv">${fontSize}</span>
                    <div class="fs-faw">
                        <div class="fs-fa fs-fa-u" id="fs-fu"><span></span></div>
                        <div class="fs-fa fs-fa-d" id="fs-fd"><span></span></div>
                    </div>
                </div>
            </div>
            <label class="fs-snd"><input type="checkbox" id="fs-snd" style="margin:0;cursor:pointer" ${soundEnabled ? "checked" : ""}> 语音</label>
        </div>
    </div>
    <div class="fs-body">
        <div class="fs-hint">在下方粘贴待测名单 (空格、逗号或回车分隔):</div>
        <textarea id="fs-ipt" class="fs-ta" placeholder="example: api, bus, cxk"></textarea>
        <div class="fs-btns">
            <button type="button" id="fs-go" class="fs-btn">开始检测</button>
            <button type="button" id="fs-rst" class="fs-btn">重置</button>
        </div>
        <div class="fs-stline">状态: <span id="fs-st" style="font-weight:bold;color:#0969da">等待启动</span></div>
        <div class="fs-loghdr">
            <span>实时网络日志:</span>
            <span class="p">进度: <span id="fs-i">0</span> / <span id="fs-n">0</span> <span id="fs-p" style="color:#57606a;margin-left:3px">(0.00%)</span></span>
        </div>
        <div id="fs-log"></div>
        <div class="fs-wt" style="display:flex;justify-content:space-between;align-items:center">
            <span>可用 ID (<span id="fs-wc">0</span>):</span>
            <button type="button" id="fs-cpy" style="font-size:calc(var(--fs) - 2px);font-weight:normal;color:#24292f;padding:2px 6px;border:1px solid rgba(27,31,36,.15);border-radius:4px;background:#f6f8fa;cursor:pointer">复制</button>
        </div>
        <textarea id="fs-win" class="fs-ta" readonly></textarea>
    </div>`;
    const $ = (id) => box.querySelector("#" + id);
    const iptList = $("fs-ipt");
    const btnGo = $("fs-go");
    const btnRst = $("fs-rst");
    const lblIdx = $("fs-i");
    const lblTotal = $("fs-n");
    const lblPct = $("fs-p");
    const lblSt = $("fs-st");
    const logEl = $("fs-log");
    const txtWin = $("fs-win");
    const lblWc = $("fs-wc");
    const btnCpy = $("fs-cpy");
    const chkSnd = $("fs-snd");
    const lblFv = $("fs-fv");
    function setStatus(text, color = "#57606a") {
      lblSt.innerText = text;
      lblSt.style.color = color;
    }
    function logToPanel(text, color = "#abb2bf") {
      const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false });
      const line = document.createElement("div");
      line.style.color = color;
      line.textContent = `[${time}] ${text}`;
      logEl.insertBefore(line, logEl.firstChild);
      if (logEl.childNodes.length > 50 && logEl.lastChild) {
        logEl.removeChild(logEl.lastChild);
      }
    }
    function updateProgress(idx, total) {
      lblIdx.innerText = String(idx);
      lblTotal.innerText = String(total);
      lblPct.innerText = total > 0 ? `(${(idx / total * 100).toFixed(2)}%)` : "(0.00%)";
    }
    function playSound() {
      if (!soundEnabled) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx || audioCtx.state === "closed") {
          audioCtx = new Ctx();
        }
        if (audioCtx.state === "suspended") {
          void audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.stop(audioCtx.currentTime + 0.4);
      } catch {
      }
    }
    const controller = createCheckerController({
      ui: {
        getListText: () => iptList.value,
        setListDisabled: (disabled) => {
          iptList.disabled = disabled;
        },
        setGoButton: (text, background, disabled = false) => {
          btnGo.innerText = text;
          btnGo.style.background = background;
          btnGo.disabled = disabled;
        },
        setStatus,
        logToPanel,
        updateProgress,
        updateWinners: (winners) => {
          txtWin.value = winners.join(", ");
          lblWc.innerText = String(winners.length);
        },
        playSound,
        confirmAction: (msg) => confirm(msg),
        alertUser: (msg) => alert(msg)
      }
    });
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target?.closest("button");
        if (btn && controller.isRunning() && ["更改我的", "Change username", "更改"].some(
          (k) => (btn.textContent || "").includes(k)
        )) {
          e.preventDefault();
          e.stopPropagation();
          alert(
            "⚠️ 安全拦截：脚本运行中，已阻止改名操作。\n请先停止任务再修改用户名。"
          );
        }
      },
      { capture: true }
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && controller.isRunning() && document.activeElement?.id === "login") {
          e.preventDefault();
          e.stopPropagation();
          setStatus("⚠️ 已拦截 Enter 键防误触！", "#cf222e");
          logToPanel("⚠️ 已拦截 Enter 回车键", "#cf222e");
        }
      },
      { capture: true }
    );
    document.addEventListener(
      "submit",
      (e) => {
        if (controller.isRunning() && e.target?.querySelector("input#login")) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setStatus("检测中，请先停止任务再修改用户名", "#cf222e");
        }
      },
      { capture: true }
    );
    function applyPosition() {
      const l = localStorage.getItem(SK.LEFT);
      const t = localStorage.getItem(SK.TOP);
      if (l !== null && t !== null) {
        Object.assign(box.style, {
          bottom: "auto",
          right: "auto",
          left: l,
          top: t
        });
      } else {
        Object.assign(box.style, {
          bottom: "auto",
          left: "auto",
          right: "0",
          top: "0"
        });
      }
    }
    function updateMaxH() {
      let top = 0;
      if (box.style.top?.endsWith("px")) {
        top = parseFloat(box.style.top);
      } else {
        const r = box.getBoundingClientRect();
        top = r?.top > 0 ? r.top : 0;
      }
      box.style.maxHeight = `${Math.max(180, window.innerHeight - top)}px`;
    }
    applyPosition();
    window.addEventListener("resize", updateMaxH);
    setInterval(() => {
      const inputEl = document.querySelector("input#login");
      const dialog = inputEl?.closest("dialog");
      if (inputEl && (!dialog || dialog.open)) {
        const container = inputEl.closest("dialog") || inputEl.closest('[role="dialog"]') || document.body;
        if (container && !container.contains(box)) {
          box.style.opacity = "0";
          box.style.transform = "translateY(10px) scale(0.98)";
          applyPosition();
          container.appendChild(box);
          updateMaxH();
          setTimeout(() => {
            box.style.opacity = "1";
            box.style.transform = "translateY(0) scale(1)";
            updateMaxH();
          }, 20);
        }
      } else {
        if (box.parentNode) box.parentNode.removeChild(box);
        if (controller.isRunning()) {
          controller.stopChecking();
          setStatus("窗口已关闭，自动中止任务", "#bf8700");
          logToPanel("⚠️ 更改用户名窗口已关闭，自动中止", "#bf8700");
        }
      }
    }, 200);
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initL = 0;
    let initT = 0;
    const onMove = (e) => {
      if (!isDragging) return;
      let nl = initL + e.clientX - startX;
      let nt = initT + e.clientY - startY;
      nl = Math.max(0, Math.min(nl, window.innerWidth - box.offsetWidth));
      nt = Math.max(0, Math.min(nt, window.innerHeight - box.offsetHeight));
      box.style.left = `${nl}px`;
      box.style.top = `${nt}px`;
      updateMaxH();
    };
    const onUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      localStorage.setItem(SK.TOP, box.style.top);
      localStorage.setItem(SK.LEFT, box.style.left);
    };
    $("fs-hdr").addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      const r = box.getBoundingClientRect();
      initL = r.left;
      initT = r.top;
      startX = e.clientX;
      startY = e.clientY;
      Object.assign(box.style, {
        bottom: "auto",
        right: "auto",
        left: `${initL}px`,
        top: `${initT}px`
      });
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
    const adjustFont = (delta) => {
      const next = fontSize + delta;
      if (next >= 12 && next <= 20) {
        fontSize = next;
        box.style.setProperty("--fs", `${fontSize}px`);
        lblFv.innerText = String(fontSize);
        localStorage.setItem(SK.FONT, String(fontSize));
      }
    };
    $("fs-fu").addEventListener("click", () => adjustFont(1));
    $("fs-fd").addEventListener("click", () => adjustFont(-1));
    chkSnd.addEventListener("change", (e) => {
      soundEnabled = e.target.checked;
      localStorage.setItem(SK.SOUND, String(soundEnabled));
      logToPanel(`🔊 语音提示已${soundEnabled ? "开启" : "关闭"}`, "#0969da");
    });
    iptList.addEventListener("input", () => {
      if (!controller.isRunning()) {
        controller.syncListState();
        localStorage.setItem(SK.LIST, iptList.value);
      }
    });
    btnCpy.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hasVal = !!txtWin.value;
      if (hasVal) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(txtWin.value);
          } else {
            throw new Error("Clipboard API unavailable");
          }
        } catch {
          txtWin.select();
          document.execCommand("copy");
          window.getSelection()?.removeAllRanges();
          txtWin.blur();
        }
      }
      btnCpy.textContent = hasVal ? "✔ 已复制" : "❌ 无数据";
      btnCpy.style.color = hasVal ? "#1a7f37" : "#cf222e";
      setTimeout(() => {
        btnCpy.textContent = "复制";
        btnCpy.style.color = "#24292f";
      }, 500);
    });
    btnGo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      controller.handleStartClick();
    });
    btnRst.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      controller.handleResetClick();
    });
    setTimeout(() => {
      if (controller.isRunning() || iptList.value) return;
      try {
        const saved = localStorage.getItem(SK.LIST);
        if (saved) {
          iptList.value = saved;
          controller.syncListState();
          setStatus("已恢复上次进度", "#2da44e");
          logToPanel("🔄 已自动恢复上次进度", "#2da44e");
        } else {
          logToPanel("系统就绪，等待启动...", "#57606a");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logToPanel("❌ 恢复进度失败: " + message, "#cf222e");
      }
    }, 500);
  }

  // userscripts/github-username-checker/index.ts
  initGithubChecker();
})();
