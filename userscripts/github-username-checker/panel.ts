import { createCheckerController, SK } from './core.ts';

export function initGithubChecker(): void {
  let fontSize = parseInt(localStorage.getItem(SK.FONT) || '15', 10);
  let soundEnabled = localStorage.getItem(SK.SOUND) === 'true';
  let audioCtx: AudioContext | null = null;

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
            <label class="fs-snd"><input type="checkbox" id="fs-snd" style="margin:0;cursor:pointer" ${soundEnabled ? 'checked' : ''}> 语音</label>
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

  const $ = <T extends HTMLElement>(id: string): T =>
    box.querySelector<T>('#' + id)!;
  const iptList = $<HTMLTextAreaElement>('fs-ipt');
  const btnGo = $<HTMLButtonElement>('fs-go');
  const btnRst = $<HTMLButtonElement>('fs-rst');
  const lblIdx = $<HTMLElement>('fs-i');
  const lblTotal = $<HTMLElement>('fs-n');
  const lblPct = $<HTMLElement>('fs-p');
  const lblSt = $<HTMLElement>('fs-st');
  const logEl = $<HTMLElement>('fs-log');
  const txtWin = $<HTMLTextAreaElement>('fs-win');
  const lblWc = $<HTMLElement>('fs-wc');
  const btnCpy = $<HTMLButtonElement>('fs-cpy');
  const chkSnd = $<HTMLInputElement>('fs-snd');
  const lblFv = $<HTMLElement>('fs-fv');

  function setStatus(text: string, color = '#57606a'): void {
    lblSt.innerText = text;
    lblSt.style.color = color;
  }

  function logToPanel(text: string, color = '#abb2bf'): void {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = `[${time}] ${text}`;
    logEl.insertBefore(line, logEl.firstChild);
    if (logEl.childNodes.length > 50 && logEl.lastChild) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  function updateProgress(idx: number, total: number): void {
    lblIdx.innerText = String(idx);
    lblTotal.innerText = String(total);
    lblPct.innerText =
      total > 0 ? `(${((idx / total) * 100).toFixed(2)}%)` : '(0.00%)';
  }

  function playSound(): void {
    if (!soundEnabled) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      g.gain.setValueAtTime(0.1, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.stop(audioCtx.currentTime + 0.4);
    } catch {
      // 忽略音频上下文受限异常
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
        txtWin.value = winners.join(', ');
        lblWc.innerText = String(winners.length);
      },
      playSound,
      confirmAction: (msg) => confirm(msg),
      alertUser: (msg) => alert(msg),
    },
  });

  // ==================== 安全锁：运行时拦截改名操作 ====================
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      const btn = (e.target as Element | null)?.closest('button');
      if (
        btn &&
        controller.isRunning() &&
        ['更改我的', 'Change username', '更改'].some((k) =>
          (btn.textContent || '').includes(k),
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
        alert(
          '⚠️ 安全拦截：脚本运行中，已阻止改名操作。\n请先停止任务再修改用户名。',
        );
      }
    },
    { capture: true },
  );

  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        controller.isRunning() &&
        document.activeElement?.id === 'login'
      ) {
        e.preventDefault();
        e.stopPropagation();
        setStatus('⚠️ 已拦截 Enter 键防误触！', '#cf222e');
        logToPanel('⚠️ 已拦截 Enter 回车键', '#cf222e');
      }
    },
    { capture: true },
  );

  // 拦截表单提交本身，覆盖键盘、不同语言按钮及 requestSubmit。
  document.addEventListener(
    'submit',
    (e: SubmitEvent) => {
      if (
        controller.isRunning() &&
        (e.target as Element | null)?.querySelector('input#login')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setStatus('检测中，请先停止任务再修改用户名', '#cf222e');
      }
    },
    { capture: true },
  );

  // ==================== 定位与高度管理 ====================
  function applyPosition(): void {
    const l = localStorage.getItem(SK.LEFT);
    const t = localStorage.getItem(SK.TOP);
    if (l !== null && t !== null) {
      Object.assign(box.style, {
        bottom: 'auto',
        right: 'auto',
        left: l,
        top: t,
      });
    } else {
      Object.assign(box.style, {
        bottom: 'auto',
        left: 'auto',
        right: '0',
        top: '0',
      });
    }
  }

  function updateMaxH(): void {
    let top = 0;
    if (box.style.top?.endsWith('px')) {
      top = parseFloat(box.style.top);
    } else {
      const r = box.getBoundingClientRect();
      top = r?.top > 0 ? r.top : 0;
    }
    box.style.maxHeight = `${Math.max(180, window.innerHeight - top)}px`;
  }

  applyPosition();
  window.addEventListener('resize', updateMaxH);

  // ==================== 面板挂载：轮询 input#login 出现/消失 ====================
  setInterval(() => {
    const inputEl = document.querySelector('input#login');
    const dialog = inputEl?.closest('dialog') as
      | (Element & { open?: boolean })
      | null;
    if (inputEl && (!dialog || dialog.open)) {
      const container =
        inputEl.closest('dialog') ||
        inputEl.closest('[role="dialog"]') ||
        document.body;
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
      if (controller.isRunning()) {
        controller.stopChecking();
        setStatus('窗口已关闭，自动中止任务', '#bf8700');
        logToPanel('⚠️ 更改用户名窗口已关闭，自动中止', '#bf8700');
      }
    }
  }, 200);

  // ==================== 拖拽 ====================
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initL = 0;
  let initT = 0;

  const onMove = (e: MouseEvent) => {
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
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    localStorage.setItem(SK.TOP, box.style.top);
    localStorage.setItem(SK.LEFT, box.style.left);
  };

  $('fs-hdr').addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    isDragging = true;
    const r = box.getBoundingClientRect();
    initL = r.left;
    initT = r.top;
    startX = e.clientX;
    startY = e.clientY;
    Object.assign(box.style, {
      bottom: 'auto',
      right: 'auto',
      left: `${initL}px`,
      top: `${initT}px`,
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  // ==================== 控件事件绑定 ====================
  const adjustFont = (delta: number) => {
    const next = fontSize + delta;
    if (next >= 12 && next <= 20) {
      fontSize = next;
      box.style.setProperty('--fs', `${fontSize}px`);
      lblFv.innerText = String(fontSize);
      localStorage.setItem(SK.FONT, String(fontSize));
    }
  };
  $('fs-fu').addEventListener('click', () => adjustFont(1));
  $('fs-fd').addEventListener('click', () => adjustFont(-1));

  chkSnd.addEventListener('change', (e) => {
    soundEnabled = (e.target as HTMLInputElement).checked;
    localStorage.setItem(SK.SOUND, String(soundEnabled));
    logToPanel(`🔊 语音提示已${soundEnabled ? '开启' : '关闭'}`, '#0969da');
  });

  iptList.addEventListener('input', () => {
    if (!controller.isRunning()) {
      controller.syncListState();
      localStorage.setItem(SK.LIST, iptList.value);
    }
  });

  btnCpy.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const hasVal = !!txtWin.value;
    if (hasVal) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(txtWin.value);
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch {
        txtWin.select();
        document.execCommand('copy');
        window.getSelection()?.removeAllRanges();
        txtWin.blur();
      }
    }
    btnCpy.textContent = hasVal ? '✔ 已复制' : '❌ 无数据';
    btnCpy.style.color = hasVal ? '#1a7f37' : '#cf222e';
    setTimeout(() => {
      btnCpy.textContent = '复制';
      btnCpy.style.color = '#24292f';
    }, 500);
  });

  btnGo.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller.handleStartClick();
  });

  btnRst.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller.handleResetClick();
  });

  // ==================== 初始化：恢复上次进度 ====================
  setTimeout(() => {
    if (controller.isRunning() || iptList.value) return;
    try {
      const saved = localStorage.getItem(SK.LIST);
      if (saved) {
        iptList.value = saved;
        controller.syncListState();
        setStatus('已恢复上次进度', '#2da44e');
        logToPanel('🔄 已自动恢复上次进度', '#2da44e');
      } else {
        logToPanel('系统就绪，等待启动...', '#57606a');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logToPanel('❌ 恢复进度失败: ' + message, '#cf222e');
    }
  }, 500);
}
