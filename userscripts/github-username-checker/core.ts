export const DEFAULT_CHECK_TIMEOUT = 8000;
export const DEFAULT_CHECK_INTERVAL = 500;
export const DEFAULT_RATE_LIMIT_COOL = 20000;

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;

export const SK = {
  LIST: 'gh_check_list',
  SOUND: 'gh_check_sound',
  LEFT: 'gh_check_secondary_left',
  TOP: 'gh_check_secondary_top',
  FONT: 'gh_check_font_size',
} as const;

export type CheckOutcome =
  | 'success'
  | 'rate-limited'
  | 'unavailable'
  | 'cancelled'
  | 'unknown';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function jsonSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseList(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[\s,，]+/).filter(Boolean))];
}

export function getListKey(list: string[]): string {
  // 顺序参与哈希；使用 v2 前缀避免沿用旧版结果，同时保持固定短键名防止撑爆 localStorage。
  const s = JSON.stringify(list || []);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `v2_${(h2 >>> 0).toString(36)}_${(h1 >>> 0).toString(36)}`;
}

export interface AutoCheckLike {
  getAttribute(name: string): string | null;
  querySelector(selector: string): { value?: string } | null;
}

export interface CheckRequestDeps {
  fetchFn?: typeof fetch;
  locationHref?: string;
  locationOrigin?: string;
  checkTimeout?: number;
}

// 与页面 auto-check 组件一致，只调用校验接口，不改写真实改名输入框。
export async function checkUsername(
  name: string,
  acEl: AutoCheckLike,
  signal: AbortSignal,
  deps: CheckRequestDeps = {},
): Promise<CheckOutcome> {
  const endpoint = acEl.getAttribute('src');
  if (!endpoint) return 'unknown';

  const origin = deps.locationOrigin ?? window.location.origin;
  const href = deps.locationHref ?? window.location.href;
  const url = new URL(endpoint, href);
  if (url.origin !== origin || url.pathname !== '/account/rename_check') {
    return 'unknown';
  }

  const method = acEl.getAttribute('http-method') === 'GET' ? 'GET' : 'POST';
  const body = new FormData();
  if (method === 'POST') {
    const csrf =
      acEl.getAttribute('csrf') ||
      acEl.querySelector('input[data-csrf]')?.value;
    if (!csrf) return 'unknown';
    body.append(acEl.getAttribute('csrf-field') || 'authenticity_token', csrf);
    body.append('value', name);
  } else {
    url.searchParams.set('value', name);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();

  const fetchImpl = deps.fetchFn ?? fetch;
  const timeoutMs = deps.checkTimeout ?? DEFAULT_CHECK_TIMEOUT;
  const timeout = setTimeout(abort, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      body: method === 'POST' ? body : undefined,
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
    });
    if (signal.aborted) return 'cancelled';
    if (response.ok) return 'success';
    if (response.status === 429) return 'rate-limited';
    if (response.status === 422) return 'unavailable';
    return 'unknown'; // 登录失效、CSRF 错误和服务故障均不能判为不可用。
  } catch {
    return signal.aborted ? 'cancelled' : 'unknown';
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export interface CheckerUiHooks {
  getListText: () => string;
  setListDisabled: (disabled: boolean) => void;
  setGoButton: (text: string, background: string, disabled?: boolean) => void;
  setStatus: (text: string, color?: string) => void;
  logToPanel: (text: string, color?: string) => void;
  updateProgress: (idx: number, total: number) => void;
  updateWinners: (winners: string[]) => void;
  playSound: () => void;
  confirmAction: (message: string) => boolean;
  alertUser: (message: string) => void;
}

export interface CheckerControllerDeps {
  doc?: Pick<Document, 'querySelector'>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  fetchFn?: typeof fetch;
  locationHref?: string;
  locationOrigin?: string;
  checkTimeout?: number;
  checkInterval?: number;
  rateLimitCool?: number;
  ui: CheckerUiHooks;
}

interface ActiveRun {
  controller: AbortController;
  list: string[];
}

export function createCheckerController(deps: CheckerControllerDeps) {
  const doc = deps.doc ?? document;
  const storage = deps.storage ?? localStorage;
  const checkInterval = deps.checkInterval ?? DEFAULT_CHECK_INTERVAL;
  const rateLimitCool = deps.rateLimitCool ?? DEFAULT_RATE_LIMIT_COOL;
  const { ui } = deps;

  let isRunning = false;
  let activeRun: ActiveRun | null = null;
  let targetList: string[] = [];
  let confirmedList: string[] = [];
  let currentIndex = 0;

  function resetUI(): void {
    ui.setListDisabled(false);
    ui.setGoButton('开始检测', '#2da44e', false);
  }

  function stopChecking(): void {
    const run = activeRun;
    activeRun = null;
    isRunning = false;
    run?.controller.abort();
    resetUI();
  }

  function syncListState(): void {
    targetList = parseList(ui.getListText());
    const key = getListKey(targetList);
    const savedIdx = storage.getItem('gh_check_index_' + key);
    const idx = Number(savedIdx);
    currentIndex = Number.isInteger(idx)
      ? Math.max(0, Math.min(idx, targetList.length))
      : 0;
    ui.updateProgress(currentIndex, targetList.length);

    const savedWinners = jsonSafe<unknown>(
      storage.getItem('gh_check_winners_' + key),
      [],
    );
    confirmedList = Array.isArray(savedWinners)
      ? savedWinners.filter(
          (name): name is string =>
            typeof name === 'string' && targetList.includes(name),
        )
      : [];
    ui.updateWinners(confirmedList);
  }

  async function startChecking(): Promise<void> {
    if (activeRun) return;
    syncListState();
    if (!targetList.length) {
      ui.alertUser('请先粘贴待测名单！');
      return;
    }

    const inputEl = doc.querySelector('input#login');
    const acEl = inputEl?.closest?.('auto-check') as AutoCheckLike | null;
    const dialog = inputEl?.closest?.('dialog') as
      | (Element & { open?: boolean })
      | null;
    if (!inputEl || !acEl || (dialog && !dialog.open)) {
      ui.alertUser('未检测到输入框或校验组件！请先打开更改用户名弹窗。');
      return;
    }

    const run: ActiveRun = {
      controller: new AbortController(),
      list: [...targetList],
    };
    activeRun = run;
    isRunning = true;

    const onClose = () => {
      if (activeRun !== run) return;
      stopChecking();
      ui.setStatus('改名窗口已关闭，检测已暂停', '#bf8700');
    };
    dialog?.addEventListener('close', onClose, {
      signal: run.controller.signal,
    });
    dialog?.addEventListener('cancel', onClose, {
      signal: run.controller.signal,
    });

    ui.setListDisabled(true);
    ui.setGoButton('停止检测', '#cf222e');
    ui.setStatus('正在检测中...', '#0969da');

    const key = getListKey(run.list);
    const isActive = () =>
      activeRun === run && !run.controller.signal.aborted;
    ui.logToPanel(`▶ 启动检测：总量=${run.list.length}`, '#2da44e');

    let completed = false;
    try {
      storage.setItem(SK.LIST, ui.getListText());
      for (let i = currentIndex; i < run.list.length; i++) {
        if (!isActive()) return;
        if (!inputEl.isConnected || (dialog && !dialog.open)) {
          ui.setStatus('改名窗口已关闭，检测已暂停', '#bf8700');
          return;
        }

        const name = run.list[i];
        currentIndex = i;
        ui.updateProgress(i, run.list.length);
        storage.setItem('gh_check_index_' + key, String(i));

        if (USERNAME_RE.test(name)) {
          const result = await checkUsername(name, acEl, run.controller.signal, {
            fetchFn: deps.fetchFn,
            locationHref: deps.locationHref,
            locationOrigin: deps.locationOrigin,
            checkTimeout: deps.checkTimeout,
          });
          if (!isActive()) return;
          if (!inputEl.isConnected || (dialog && !dialog.open)) {
            ui.setStatus('改名窗口已关闭，检测已暂停', '#bf8700');
            return;
          }

          if (result === 'success') {
            ui.logToPanel(`✔️ 发现可用: ${name}`, '#2da44e');
            if (!confirmedList.includes(name)) {
              confirmedList.push(name);
              ui.updateWinners(confirmedList);
              storage.setItem(
                'gh_check_winners_' + key,
                JSON.stringify(confirmedList),
              );
            }
            ui.playSound();
          } else if (result === 'rate-limited') {
            ui.logToPanel(
              `触发限流，冷却 ${rateLimitCool / 1000}s 后重试`,
              '#cf222e',
            );
            const end = Date.now() + rateLimitCool;
            while (Date.now() < end && isActive()) {
              ui.setStatus(
                `限流冷却 (${Math.max(0, (end - Date.now()) / 1000).toFixed(1)}s)`,
                '#cf222e',
              );
              await sleep(100);
            }
            if (!isActive()) return;
            ui.setStatus('正在检测中...', '#0969da');
            i--;
            continue;
          } else if (result === 'unavailable') {
            ui.logToPanel(`检查 [${name}] -> 不可用`, '#8c959f');
          } else {
            ui.setStatus('校验未确认，已暂停；可点击开始重试', '#bf8700');
            ui.logToPanel(
              `⚠️ [${name}] 请求失败或超时，保留当前位置，不计入可用名单`,
              '#bf8700',
            );
            return;
          }
        } else {
          ui.logToPanel(`❌ [${name}] 格式不合法，略过`, '#8c959f');
        }

        currentIndex = i + 1;
        storage.setItem('gh_check_index_' + key, String(currentIndex));
        ui.updateProgress(currentIndex, run.list.length);
        if (i + 1 < run.list.length && checkInterval > 0) {
          await sleep(checkInterval);
        }
      }
      completed = true;
    } catch (err) {
      if (isActive()) {
        const message = err instanceof Error ? err.message : String(err);
        ui.setStatus('检测异常，已暂停', '#cf222e');
        ui.logToPanel(`检测失败: ${message}`, '#cf222e');
      }
    } finally {
      // 旧任务不得修改重置后或新任务的界面及状态。
      if (activeRun === run) {
        run.controller.abort();
        activeRun = null;
        isRunning = false;
        resetUI();
        if (completed) {
          ui.setStatus('检测结束！', '#2da44e');
          ui.logToPanel('🎉 检测全部结束！', '#2da44e');
        }
      }
    }
  }

  function handleStartClick(): void {
    if (!isRunning) {
      const tmpList = parseList(ui.getListText());
      const key = getListKey(tmpList);
      const savedIdx = storage.getItem('gh_check_index_' + key);
      if (savedIdx !== null && parseInt(savedIdx, 10) >= tmpList.length) {
        if (ui.confirmAction('🔍 当前名单已全部检测完毕！\n是否重置进度重新扫描？')) {
          currentIndex = 0;
          confirmedList = [];
          storage.setItem('gh_check_index_' + key, '0');
          storage.setItem('gh_check_winners_' + key, '[]');
          ui.updateWinners([]);
          ui.updateProgress(0, tmpList.length);
          ui.logToPanel('🔄 已重置进度，重新检测...', '#cf222e');
        } else {
          return;
        }
      }
      void startChecking();
    } else {
      stopChecking();
      ui.setStatus('任务已中止', '#bf8700');
      ui.logToPanel('⏸️ 任务已手动中止', '#bf8700');
    }
  }

  function handleResetClick(): void {
    if (
      !ui.confirmAction(
        '⚠️ 确定重置当前名单的进度吗？\n将清空检测进度与已发现的可用 ID。',
      )
    ) {
      return;
    }
    stopChecking();
    targetList = parseList(ui.getListText());
    currentIndex = 0;
    confirmedList = [];
    const key = getListKey(targetList);
    storage.removeItem('gh_check_index_' + key);
    storage.removeItem('gh_check_winners_' + key);

    ui.updateWinners([]);
    ui.updateProgress(0, targetList.length);
    ui.setStatus('进度已重置', '#cf222e');
    ui.logToPanel('🔄 进度和可用 ID 已全部重置', '#cf222e');
    resetUI();
  }

  return {
    isRunning: () => isRunning,
    getState: () => ({
      isRunning,
      currentIndex,
      targetList: [...targetList],
      confirmedList: [...confirmedList],
    }),
    syncListState,
    startChecking,
    stopChecking,
    handleStartClick,
    handleResetClick,
  };
}
