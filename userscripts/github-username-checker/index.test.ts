import { describe, expect, it } from 'vitest';
import {
  createCheckerController,
  getListKey,
  parseList,
} from './core.ts';

function createGithubFixture(
  fetchImpl?: (url: URL | RequestInfo, init?: RequestInit) => Promise<any>,
) {
  const saved = new Map<string, string>();
  const dialog = new EventTarget() as EventTarget & { open: boolean };
  dialog.open = true;

  const ac = {
    getAttribute: (key: string) =>
      ({
        src: '/account/rename_check?suggest_usernames=true',
        csrf: 'test-token',
      })[key] || null,
    querySelector: () => null,
  };

  const input = {
    isConnected: true,
    value: 'original-user',
    closest: (selector: string) => (selector === 'dialog' ? dialog : ac),
  };

  let listText = 'aaa,bbb';
  let status = '';
  let winners: string[] = [];
  let progress: [number, number] = [0, 0];

  const storage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => {
      saved.set(k, String(v));
    },
    removeItem: (k: string) => {
      saved.delete(k);
    },
  };

  const controller = createCheckerController({
    doc: {
      querySelector: () => input as unknown as Element,
    },
    storage,
    fetchFn: fetchImpl as unknown as typeof fetch,
    locationHref: 'https://github.com/settings/admin',
    locationOrigin: 'https://github.com',
    checkTimeout: 20,
    checkInterval: 0,
    rateLimitCool: 1,
    ui: {
      getListText: () => listText,
      setListDisabled: () => {},
      setGoButton: () => {},
      setStatus: (text) => {
        status = text;
      },
      logToPanel: () => {},
      updateProgress: (idx, total) => {
        progress = [idx, total];
      },
      updateWinners: (next) => {
        winners = [...next];
      },
      playSound: () => {},
      confirmAction: () => true,
      alertUser: () => {},
    },
  });

  return {
    controller,
    saved,
    input,
    ac,
    dialog,
    setListText: (v: string) => {
      listText = v;
    },
    getStatus: () => status,
    getWinners: () => winners,
    getProgress: () => progress,
  };
}

describe('github-username-checker', () => {
  it('缓存键保留顺序、规范化大小写并限制键长度', () => {
    expect(getListKey(['aaa', 'bbb'])).not.toBe(getListKey(['bbb', 'aaa']));
    expect(parseList('AAA, aaa，BBB').join(',')).toBe('aaa,bbb');
    expect(getListKey(['aa', 'bb'])).not.toBe(getListKey(['bb', 'aa']));

    const largeKey = getListKey(
      Array.from({ length: 1000 }, (_, i) => `user-${i}`),
    );
    expect(largeKey).toMatch(/^v2_[0-9a-z]+_[0-9a-z]+$/);
    expect(largeKey.length).toBeLessThan(32);
  });

  it('仅将 200 成功结果计入可用名单，并保留原始改名输入框内容', async () => {
    let count = 0;
    const f = createGithubFixture(async (urlArg, options) => {
      const url = urlArg as URL;
      const body = options!.body as FormData;
      expect(url.pathname).toBe('/account/rename_check');
      expect(url.searchParams.get('suggest_usernames')).toBe('true');
      expect(body.get('authenticity_token')).toBe('test-token');
      expect(body.get('value')).toBe(count === 0 ? 'aaa' : 'bbb');
      expect(options!.redirect).toBe('error');
      return ++count === 1 ? { ok: true } : { ok: false, status: 422 };
    });

    await f.controller.startChecking();
    expect(f.controller.getState().confirmedList).toEqual(['aaa']);
    expect(f.controller.getState().currentIndex).toBe(2);
    expect(f.input.value).toBe('original-user');
    expect(f.controller.isRunning()).toBe(false);
  });

  it('请求超时后暂停任务，不误判可用且不跳过当前待检名', async () => {
    const f = createGithubFixture(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );

    await f.controller.startChecking();
    expect(f.controller.getState().confirmedList).toHaveLength(0);
    expect(f.controller.getState().currentIndex).toBe(0);
    expect(f.controller.isRunning()).toBe(false);
    expect(f.getStatus()).toMatch(/未确认/);
  });

  it('鉴权失效或服务端错误均保持未确认状态', async () => {
    for (const status of [403, 500, 502]) {
      const f = createGithubFixture(async () => ({ ok: false, status }));
      await f.controller.startChecking();
      expect(f.controller.getState().currentIndex).toBe(0);
      expect(f.controller.getState().confirmedList).toHaveLength(0);
    }
  });

  it('遇到 429 限流时冷却并重试同一用户名后再前进', async () => {
    const names: string[] = [];
    const f = createGithubFixture(async (_url, options) => {
      const body = options!.body as FormData;
      names.push(String(body.get('value')));
      return names.length === 1 ? { ok: false, status: 429 } : { ok: true };
    });

    await f.controller.startChecking();
    expect(names).toEqual(['aaa', 'aaa', 'bbb']);
    expect(f.controller.getState().confirmedList).toEqual(['aaa', 'bbb']);
  });

  it('重置后重新启动会忽略旧任务晚到的成功响应', async () => {
    let resolveOld!: (val: unknown) => void;
    let calls = 0;
    const f = createGithubFixture(async () => {
      if (++calls === 1) {
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return { ok: true };
    });

    const oldRun = f.controller.startChecking();
    f.controller.handleResetClick();
    expect(
      f.saved.has('gh_check_index_' + getListKey(['aaa', 'bbb'])),
    ).toBe(false);

    f.setListText('ccc');
    const nextRun = f.controller.startChecking();
    resolveOld({ ok: true });
    await Promise.all([oldRun, nextRun]);

    expect(f.controller.getState().confirmedList).toEqual(['ccc']);
    expect(f.controller.getState().targetList).toEqual(['ccc']);
    expect(f.controller.getState().currentIndex).toBe(1);
    expect(f.controller.isRunning()).toBe(false);
  });

  it('即使输入框仍挂载在 DOM 中，弹窗 close 事件也会取消检测', async () => {
    let resolveRequest!: (val: unknown) => void;
    const f = createGithubFixture(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const pending = f.controller.startChecking();
    f.dialog.open = false;
    f.dialog.dispatchEvent(new Event('close'));
    expect(f.input.isConnected).toBe(true);
    expect(f.controller.isRunning()).toBe(false);

    resolveRequest({ ok: true });
    await pending;
    expect(f.controller.getState().confirmedList).toHaveLength(0);
    expect(f.controller.getState().currentIndex).toBe(0);
  });

  it('输入框无 close 事件直接脱离 DOM 后忽略后续响应', async () => {
    let finish!: (val: unknown) => void;
    const f = createGithubFixture(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const pending = f.controller.startChecking();
    f.input.isConnected = false;
    finish({ ok: true });
    await pending;

    expect(f.controller.getState().confirmedList).toHaveLength(0);
    expect(f.controller.isRunning()).toBe(false);
  });

  it('弹窗处于关闭状态时不启动检测', async () => {
    const f = createGithubFixture(() => {
      throw new Error('Unexpected request');
    });
    f.dialog.open = false;
    await f.controller.startChecking();
    expect(f.controller.isRunning()).toBe(false);
  });

  it('非预期的校验端点在发起请求前即拒绝', async () => {
    const f = createGithubFixture(() => {
      throw new Error('Unexpected request');
    });
    f.ac.getAttribute = (key: string) =>
      key === 'src' ? '/account/rename' : 'test-token';
    await f.controller.startChecking();
    expect(f.controller.getState().currentIndex).toBe(0);
    expect(f.controller.getState().confirmedList).toHaveLength(0);
  });
});
