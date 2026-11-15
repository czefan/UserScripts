import { describe, expect, it } from 'vitest';
import { createDownloadAction } from './downloader.ts';
import { extractVideoFromDom, type DouyinMedia } from './extractor.ts';

function runExtract(fiber: unknown, src = 'blob:test') {
  const v = {
    paused: false,
    duration: 10,
    __reactFiberTest: fiber,
    currentSrc: src,
    src,
    parentElement: null,
  };
  const fakeDoc = {
    querySelectorAll: () => [v],
    body: {},
  } as unknown as Document;
  return extractVideoFromDom(fakeDoc, { innerHeight: 1000 });
}

function createDownloadFixture(onDownloadCall?: () => void) {
  let currentMedia: DouyinMedia = {
    url: 'https://example.com/first.mp4',
    title: 'first',
    author: 'author',
    filename: 'first.mp4',
  };
  const btnDownload = { disabled: false };
  const links: string[] = [];
  const notices: string[] = [];
  let successes = 0;
  let capturedOptions: Tampermonkey.DownloadRequest | undefined;

  const fakeDoc = {
    createElement: () => {
      const el = {
        href: '',
        download: '',
        target: '',
        rel: '',
        click() {
          links.push(el.href);
        },
        remove() {},
      };
      return el;
    },
    body: { appendChild() {} },
  } as unknown as Document;

  const action = createDownloadAction({
    getMedia: () => currentMedia,
    btnDownload,
    onSuccess: () => {
      successes++;
    },
    gmDownload: ((opt: Tampermonkey.DownloadRequest) => {
      capturedOptions = opt;
      onDownloadCall?.();
      return { abort() {} };
    }) as typeof GM_download,
    doc: fakeDoc,
    notify: (msg) => notices.push(msg),
  });

  return {
    action,
    btnDownload,
    links,
    notices,
    getSuccesses: () => successes,
    getOptions: () => capturedOptions!,
    setCurrentMedia: (m: DouyinMedia) => {
      currentMedia = m;
    },
  };
}

describe('douyin-downloader', () => {
  it('子 Fiber 提供播放地址且父 Fiber 提供标题作者时合并提取', () => {
    const fiber = {
      memoizedProps: { xgplayerConfig: { url: 'https://example.com/child.mp4' } },
      return: {
        memoizedProps: {
          awemeInfo: { desc: 'title', author: { nickname: 'author' } },
        },
        return: null,
      },
    };
    const result = runExtract(fiber);
    expect(result).toEqual({
      url: 'https://example.com/child.mp4',
      title: 'title',
      author: 'author',
    });
  });

  it('支持直链兜底并拒绝纯 blob 地址视频', () => {
    expect(runExtract(null, 'https://example.com/direct.mp4')?.url).toBe(
      'https://example.com/direct.mp4',
    );
    expect(runExtract(null)).toBeNull();
  });

  it('下载超时后释放按钮状态并允许重试', () => {
    const f = createDownloadFixture();
    f.action.trigger();
    expect(f.btnDownload.disabled).toBe(true);

    f.getOptions().ontimeout!();
    expect(f.action.isDownloading()).toBe(false);
    expect(f.btnDownload.disabled).toBe(false);

    f.action.trigger();
    expect(f.action.isDownloading()).toBe(true);
  });

  it('下载失败兜底保存时使用点击瞬间的视频快照，且不计为下载成功', () => {
    const f = createDownloadFixture();
    f.action.trigger();
    f.setCurrentMedia({
      url: 'https://example.com/next.mp4',
      title: 'next',
      author: 'author',
      filename: 'next.mp4',
    });
    (f.getOptions().onerror as () => void)();

    expect(f.links).toEqual(['https://example.com/first.mp4']);
    expect(f.getSuccesses()).toBe(0);
    expect(f.action.isDownloading()).toBe(false);
  });

  it('忽略早先已超时的下载任务随后到达的重复回调', () => {
    const f = createDownloadFixture();
    f.action.trigger();
    const oldOptions = f.getOptions();
    oldOptions.ontimeout!();

    f.action.trigger();
    (oldOptions.onerror as () => void)();
    expect(f.action.isDownloading()).toBe(true);
    expect(f.btnDownload.disabled).toBe(true);
    expect(f.links).toHaveLength(0);

    (f.getOptions().onload as () => void)();
    expect(f.action.isDownloading()).toBe(false);
    expect(f.getSuccesses()).toBe(1);
  });

  it('GM_download 同步抛错时释放状态并走降级打开链接', () => {
    const f = createDownloadFixture(() => {
      throw new Error('disabled');
    });
    f.action.trigger();
    expect(f.action.isDownloading()).toBe(false);
    expect(f.links).toHaveLength(1);
  });
});
