// ==UserScript==
// @name         GitHub 用户名助手 - 精筛版
// @namespace    https://github.com/czefan/UserScripts
// @version      1.0.0
// @description  批量检测 GitHub 用户名可用性
// @author       czefan
// @match        https://github.com/settings/admin
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 常量 ====================
    const CHECK_TIMEOUT = 8000;      // 单次接口校验的超时时间限制(毫秒)
    const RATE_LIMIT_COOL = 20000;   // 遭遇 GitHub 限流时的冷却退避时长(毫秒)

    const USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
    const SK = {
        LIST: 'gh_check_list', SOUND: 'gh_check_sound',
        LEFT: 'gh_check_secondary_left', TOP: 'gh_check_secondary_top', FONT: 'gh_check_font_size'
    };

    // ==================== 状态 ====================
    let isRunning = false;
    let targetList = [], confirmedList = [], currentIndex = 0;
    let fontSize = parseInt(localStorage.getItem(SK.FONT) || '15', 10);
    let soundEnabled = localStorage.getItem(SK.SOUND) === 'true';

    // ==================== 工具函数 ====================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const jsonSafe = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
    const parseList = text => [...new Set(text.split(/[\s,，]+/).filter(s => s))];

    function getListKey(list) {
        if (!list?.length) return 'empty';
        const s = [...new Set(list)].sort().join(',');
        let h = 0;
        for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
        return 'hash_' + Math.abs(h);
    }

    // ==================== 安全锁：运行时拦截改名操作 ====================
    document.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (btn && isRunning && ['更改我的', 'Change username', '更改'].some(k => btn.textContent.includes(k))) {
            e.preventDefault(); e.stopPropagation();
            alert('⚠️ 安全拦截：脚本运行中，已阻止改名操作。\n请先停止任务再修改用户名。');
        }
    }, { capture: true });

    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && isRunning && document.activeElement?.id === 'login') {
            e.preventDefault(); e.stopPropagation();
            setStatus('⚠️ 已拦截 Enter 键防误触！', '#cf222e');
            logToPanel('⚠️ 已拦截 Enter 回车键', '#cf222e');
        }
    }, { capture: true });

    // ==================== 输入赋值（等同粘贴） ====================
    function setInputValue(el, text) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!setter) return;
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ==================== UI 面板 ====================
    const box = document.createElement('div');
    box.className = 'fs-panel';
    box.style.setProperty('--fs', `${fontSize}px`);
    box.style.opacity = '0';
    box.style.transform = 'translateY(10px) scale(0.98)';

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
        <span class="t">GitHub 用户名精筛</span>
        <div class="c">
            <div class="fs-fc"><span>字号:</span>
                <div class="fs-fb"><span class="v" id="fs-fv">${fontSize}</span>
                    <div class="fs-faw">
                        <div class="fs-fa fs-fa-u" id="fs-fu"><span></span></div>
                        <div class="fs-fa fs-fa-d" id="fs-fd"><span></span></div>
                    </div>
                </div>
            </div>
            <label class="fs-snd"><input type="checkbox" id="fs-snd" style="margin:0;cursor:pointer" ${soundEnabled ? 'checked' : ''}> 语音</label>
        </div>
    </div>
    <div class="fs-body">
        <div class="fs-hint">在下方粘贴待测名单 (空格、逗号或回车分隔):</div>
        <textarea id="fs-ipt" class="fs-ta" placeholder="example: api, bus, cxk"></textarea>
        <div class="fs-btns">
            <button type="button" id="fs-go" class="fs-btn">开始精筛</button>
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

    // ==================== 定位与高度管理 ====================
    function applyPosition() {
        const l = localStorage.getItem(SK.LEFT), t = localStorage.getItem(SK.TOP);
        if (l !== null && t !== null) {
            Object.assign(box.style, { bottom: 'auto', right: 'auto', left: l, top: t });
        } else {
            Object.assign(box.style, { bottom: 'auto', left: 'auto', right: '0', top: '0' });
        }
    }

    function updateMaxH() {
        let top = 0;
        if (box.style.top?.endsWith('px')) top = parseFloat(box.style.top);
        else { const r = box.getBoundingClientRect(); top = r?.top > 0 ? r.top : 0; }
        box.style.maxHeight = `${Math.max(180, window.innerHeight - top)}px`;
    }

    applyPosition();
    window.addEventListener('resize', updateMaxH);

    // ==================== DOM 引用 ====================
    const $ = id => box.querySelector('#' + id);
    const iptList = $('fs-ipt'), btnGo = $('fs-go'), btnRst = $('fs-rst');
    const lblIdx = $('fs-i'), lblTotal = $('fs-n'), lblPct = $('fs-p'), lblSt = $('fs-st');
    const logEl = $('fs-log'), txtWin = $('fs-win'), lblWc = $('fs-wc'), btnCpy = $('fs-cpy');
    const chkSnd = $('fs-snd'), lblFv = $('fs-fv');

    // ==================== UI 辅助函数 ====================
    function setStatus(text, color = '#57606a') { lblSt.innerText = text; lblSt.style.color = color; }

    function logToPanel(text, color = '#abb2bf') {
        const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const line = document.createElement('div');
        line.style.color = color;
        line.textContent = `[${time}] ${text}`;
        logEl.insertBefore(line, logEl.firstChild);
        if (logEl.childNodes.length > 50) logEl.removeChild(logEl.lastChild);
    }

    function updateProgress(idx, total) {
        lblIdx.innerText = idx;
        lblTotal.innerText = total;
        lblPct.innerText = total > 0 ? `(${((idx / total) * 100).toFixed(2)}%)` : '(0.00%)';
    }

    function resetUI() {
        iptList.disabled = false;
        btnGo.innerText = '开始精筛';
        btnGo.style.background = '#2da44e';
    }

    function playSound() {
        if (!soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(), g = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = 880;
            osc.connect(g); g.connect(ctx.destination);
            osc.start(ctx.currentTime);
            g.gain.setValueAtTime(0.1, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.stop(ctx.currentTime + 0.4);
        } catch { }
    }

    // 从 localStorage 恢复当前名单的进度与可用 ID
    function syncListState() {
        targetList = parseList(iptList.value);
        const key = getListKey(targetList);
        const savedIdx = localStorage.getItem('gh_check_index_' + key);
        currentIndex = savedIdx !== null ? parseInt(savedIdx, 10) : 0;
        updateProgress(currentIndex, targetList.length);
        confirmedList = jsonSafe(localStorage.getItem('gh_check_winners_' + key), []);
        txtWin.value = confirmedList.join(', ');
        lblWc.innerText = confirmedList.length;
    }

    // ==================== 面板挂载：轮询 input#login 出现/消失 ====================
    setInterval(() => {
        const inputEl = document.querySelector('input#login');
        if (inputEl) {
            const container = inputEl.closest('dialog') || inputEl.closest('[role="dialog"]') || document.body;
            if (container && !container.contains(box)) {
                box.style.opacity = '0';
                box.style.transform = 'translateY(10px) scale(0.98)';
                applyPosition();
                container.appendChild(box);
                updateMaxH();
                setTimeout(() => {
                    box.style.opacity = '1';
                    box.style.transform = 'translateY(0) scale(1)';
                    updateMaxH();
                }, 20);
            }
        } else {
            if (box.parentNode) box.parentNode.removeChild(box);
            if (isRunning) {
                isRunning = false;
                setStatus('窗口已关闭，自动中止任务', '#bf8700');
                logToPanel('⚠️ 更改用户名窗口已关闭，自动中止', '#bf8700');
                resetUI();
            }
        }
    }, 50);

    // ==================== 拖拽 ====================
    let isDragging = false, startX = 0, startY = 0, initL = 0, initT = 0;

    $('fs-hdr').addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        isDragging = true;
        const r = box.getBoundingClientRect();
        initL = r.left; initT = r.top; startX = e.clientX; startY = e.clientY;
        Object.assign(box.style, { bottom: 'auto', right: 'auto', left: `${initL}px`, top: `${initT}px` });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });

    function onMove(e) {
        if (!isDragging) return;
        let nl = initL + e.clientX - startX, nt = initT + e.clientY - startY;
        nl = Math.max(0, Math.min(nl, window.innerWidth - box.offsetWidth));
        nt = Math.max(0, Math.min(nt, window.innerHeight - box.offsetHeight));
        box.style.left = `${nl}px`;
        box.style.top = `${nt}px`;
        updateMaxH();
    }

    function onUp() {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        localStorage.setItem(SK.TOP, box.style.top);
        localStorage.setItem(SK.LEFT, box.style.left);
    }

    // ==================== 控件事件绑定 ====================
    const adjustFont = delta => {
        const next = fontSize + delta;
        if (next >= 12 && next <= 20) {
            fontSize = next;
            box.style.setProperty('--fs', `${fontSize}px`);
            lblFv.innerText = fontSize;
            localStorage.setItem(SK.FONT, fontSize);
        }
    };
    $('fs-fu').addEventListener('click', () => adjustFont(1));
    $('fs-fd').addEventListener('click', () => adjustFont(-1));

    chkSnd.addEventListener('change', e => {
        soundEnabled = e.target.checked;
        localStorage.setItem(SK.SOUND, soundEnabled);
        logToPanel(`🔊 语音提示已${soundEnabled ? '开启' : '关闭'}`, '#0969da');
    });

    iptList.addEventListener('input', () => {
        if (!isRunning) { syncListState(); localStorage.setItem(SK.LIST, iptList.value); }
    });

    btnCpy.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const hasVal = !!txtWin.value;
        if (hasVal) {
            try {
                navigator.clipboard.writeText(txtWin.value);
            } catch {
                txtWin.select();
                document.execCommand('copy');
                window.getSelection()?.removeAllRanges();
                txtWin.blur();
            }
        }
        btnCpy.textContent = hasVal ? '✔ 已复制' : '❌ 无数据';
        btnCpy.style.color = hasVal ? '#1a7f37' : '#cf222e';
        setTimeout(() => { btnCpy.textContent = '复制'; btnCpy.style.color = '#24292f'; }, 500);
    });


    // ==================== 核心检测引擎 ====================
    async function startScreening() {
        targetList = parseList(iptList.value);
        if (!targetList.length) { alert('请先粘贴待测名单！'); return; }

        const inputEl = document.querySelector('input#login');
        const acEl = inputEl?.closest('auto-check');
        if (!inputEl || !acEl) {
            alert('未检测到输入框或校验组件！\n请先点击「更改用户名」按钮显示弹窗。');
            return;
        }

        isRunning = true;
        setStatus('⚡ 正在精筛中...', '#0969da');
        iptList.disabled = true;
        btnGo.innerText = '停止精筛';
        btnGo.style.background = '#cf222e';
        lblTotal.innerText = targetList.length;
        const key = getListKey(targetList);
        logToPanel(`▶ 启动精筛：总量=${targetList.length}`, '#2da44e');
        localStorage.setItem(SK.LIST, iptList.value);

        for (let i = currentIndex; i < targetList.length; i++) {
            if (!isRunning) break;
            currentIndex = i;
            updateProgress(i + 1, targetList.length);
            localStorage.setItem('gh_check_index_' + key, i);

            const name = targetList[i].trim();

            // 本地格式校验
            if (!USERNAME_RE.test(name)) {
                logToPanel(`❌ [${name}] 格式不合法，略过`, '#8c959f');
                continue;
            }

            inputEl.classList.remove('is-autocheck-successful', 'is-autocheck-errored');
            setInputValue(inputEl, '');
            setInputValue(inputEl, name);

            // 事件监听 + class 轮询双机制等待校验结果（done 标志防重复 resolve）
            const checkPromise = new Promise(resolve => {
                let done = false, timer, timeout;
                const finish = r => {
                    if (done) return;
                    done = true;
                    clearInterval(timer); clearTimeout(timeout);
                    acEl.removeEventListener('auto-check-success', onOk);
                    acEl.removeEventListener('auto-check-error', onErr);
                    resolve(r);
                };
                const onOk = () => finish('success');
                const onErr = e => {
                    const s = e?.detail?.response?.status;
                    finish(s === 429 || s === 403 ? 'rate-limited' : 'error');
                };

                acEl.addEventListener('auto-check-success', onOk, { once: true });
                acEl.addEventListener('auto-check-error', onErr, { once: true });

                timer = setInterval(() => {
                    if (inputEl.classList.contains('is-autocheck-successful')) { finish('success'); }
                    else if (inputEl.classList.contains('is-autocheck-errored')) {
                        const el = acEl.querySelector('.note.error, .flash-error');
                        finish(el?.textContent?.match(/too many requests|许多/i) ? 'rate-limited' : 'error');
                    }
                }, 100);
                timeout = setTimeout(() => finish('timeout'), CHECK_TIMEOUT);
            });

            // 触发 auto-check 校验
            if (typeof acEl.triggerValidation === 'function') {
                acEl.triggerValidation();
            } else {
                inputEl.blur();
                inputEl.focus();
            }

            const result = await checkPromise;

            // 处理检测结果
            if (result === 'success' || result === 'timeout') {
                if (result === 'success') {
                    logToPanel(`✔️ 发现可用: ${name}`, '#2da44e');
                } else {
                    logToPanel(`⚠️ 校验超时，追加到可用: ${name}`, '#bf8700');
                }
                if (!confirmedList.includes(name)) {
                    confirmedList.push(name);
                    txtWin.value = confirmedList.join(', ');
                    lblWc.innerText = confirmedList.length;
                    localStorage.setItem('gh_check_winners_' + key, JSON.stringify(confirmedList));
                }
                playSound();
            } else if (result === 'rate-limited') {
                logToPanel(`🚨 触发限流，冷却退避 ${RATE_LIMIT_COOL / 1000}s...`, '#cf222e');
                const end = Date.now() + RATE_LIMIT_COOL;
                while (Date.now() < end && isRunning) {
                    setStatus(`🚨 限流冷却 (${Math.max(0, (end - Date.now()) / 1000).toFixed(1)}s)`, '#cf222e');
                    await sleep(100);
                }
                if (isRunning) setStatus('⚡ 正在精筛中...', '#0969da');
                i--; // 回退索引，for 循环 i++ 后恢复原值，重试当前用户名
                continue;
            } else if (result === 'error') {
                logToPanel(`检查 [${name}] -> 不可用`, '#8c959f');
            }
        }

        // 任务结束
        if (isRunning) {
            isRunning = false;
            localStorage.setItem('gh_check_index_' + key, targetList.length);
            currentIndex = 0;
            setStatus('精筛结束！', '#2da44e');
            logToPanel('🎉 精筛全部结束！', '#2da44e');
            updateProgress(targetList.length, targetList.length);
        } else {
            setStatus('任务已中止', '#bf8700');
            logToPanel('⏸️ 任务已手动中止', '#bf8700');
        }
        btnGo.disabled = false;
        resetUI();
    }

    // ==================== 开始/停止按钮 ====================
    btnGo.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (!isRunning) {
            // 检查当前名单是否已全部筛完
            const tmpList = parseList(iptList.value);
            const key = getListKey(tmpList);
            const savedIdx = localStorage.getItem('gh_check_index_' + key);
            if (savedIdx !== null && parseInt(savedIdx, 10) >= tmpList.length) {
                if (confirm('🔍 当前名单已全部筛完！\n是否重置进度重新扫描？')) {
                    currentIndex = 0;
                    confirmedList = [];
                    localStorage.setItem('gh_check_index_' + key, 0);
                    localStorage.setItem('gh_check_winners_' + key, '[]');
                    txtWin.value = '';
                    updateProgress(0, tmpList.length);
                    lblWc.innerText = '0';
                    logToPanel('🔄 已重置进度，重新检测...', '#cf222e');
                } else {
                    return;
                }
            }
            startScreening();
        } else {
            isRunning = false;
            btnGo.disabled = true;
            btnGo.innerText = '正在停止...';
            btnGo.style.background = '#bf8700';
        }
    });

    // ==================== 重置按钮 ====================
    btnRst.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (!confirm('⚠️ 确定重置当前名单的进度吗？\n将清空检测进度与已发现的可用 ID。')) return;

        isRunning = false;
        currentIndex = 0;
        confirmedList = [];
        const key = getListKey(targetList);
        localStorage.removeItem('gh_check_index_' + key);
        localStorage.removeItem('gh_check_winners_' + key);

        txtWin.value = '';
        updateProgress(0, targetList.length);
        lblWc.innerText = '0';
        setStatus('进度已重置', '#cf222e');
        logToPanel('🔄 进度和可用 ID 已全部重置', '#cf222e');
        resetUI();
    });

    // ==================== 初始化：恢复上次进度 ====================
    setTimeout(() => {
        try {
            const saved = localStorage.getItem(SK.LIST);
            if (saved) {
                iptList.value = saved;
                syncListState();
                setStatus('已恢复上次进度', '#2da44e');
                logToPanel('🔄 已自动恢复上次进度', '#2da44e');
            } else {
                logToPanel('系统就绪，等待启动...', '#57606a');
            }
        } catch (e) {
            logToPanel('❌ 恢复进度失败: ' + e.message, '#cf222e');
        }
    }, 500);

})();
