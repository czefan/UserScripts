export interface RawVideoInfo {
  url: string;
  title: string;
  author: string;
}

export interface DouyinMedia extends RawVideoInfo {
  filename: string;
}

// 此函数会被序列化注入页面主世界执行，内部不得引用外部模块变量
export function extractVideoFromDom(
  doc: Document = document,
  win: Pick<Window, 'innerHeight'> = window,
): RawVideoInfo | null {
  try {
    const vids = Array.from(doc.querySelectorAll('video')).filter(
      (v) =>
        (!v.paused && v.duration > 0) ||
        (v.offsetWidth > 60 && v.offsetHeight > 60),
    );
    if (!vids.length) return null;

    const cy = win.innerHeight / 2;
    const v =
      vids.find((x) => !x.paused && x.duration > 0) ||
      vids.reduce((p, c) =>
        Math.abs(
          (c.getBoundingClientRect().top + c.getBoundingClientRect().bottom) /
            2 -
            cy,
        ) <
        Math.abs(
          (p.getBoundingClientRect().top + p.getBoundingClientRect().bottom) /
            2 -
            cy,
        )
          ? c
          : p,
      );

    let el: HTMLElement | null = v;
    let k: string | undefined;
    let cleanUrl = '';
    let title = '';
    let author = '';

    while (
      el &&
      !(k = Object.keys(el).find(
        (key) =>
          key.startsWith('__reactFiber') ||
          key.startsWith('__reactInternalInstance'),
      ))
    ) {
      el = el.parentElement;
    }

    if (el && k) {
      let f = (el as unknown as Record<string, any>)[k];
      let d = 0;
      while (f && d++ < 60) {
        const p = f.memoizedProps || f.pendingProps;
        if (p) {
          const a = p.awemeInfo || p.itemData;
          const vid =
            p.xgplayerConfig?.vid ||
            a?.video?.uri ||
            a?.video?.play_addr?.uri;
          const xg = p.xgplayerConfig?.url || p.xgplayerConfig?.videoUrl;
          const xgList: Array<string | undefined> = Array.isArray(xg)
            ? xg.map((i: any) => (typeof i === 'string' ? i : i?.src))
            : typeof xg === 'string'
              ? [xg]
              : [];

          let playLink =
            xgList.find((s) => s && s.includes('/aweme/v1/play/')) || '';
          if (!playLink && vid) {
            playLink =
              'https://www.douyin.com/aweme/v1/play/?video_id=' +
              vid +
              '&ratio=1080p&line=0';
          }
          cleanUrl =
            cleanUrl ||
            playLink ||
            xgList.find(
              (s) => s?.startsWith('http') && !s.startsWith('blob:'),
            ) ||
            '';

          if (a) {
            title = title || a.desc || a.title || '';
            author =
              author ||
              a.author?.nickname ||
              a.author?.name ||
              a.authorInfo?.nickname ||
              a.user?.nickname ||
              '';
            if (!cleanUrl) {
              const pa = a.video?.playAddr || a.video?.play_addr?.url_list;
              if (Array.isArray(pa)) {
                cleanUrl =
                  pa
                    .map((i: any) => (typeof i === 'string' ? i : i?.src))
                    .find(
                      (s: string | undefined) =>
                        s?.startsWith('http') && !s.startsWith('blob:'),
                    ) || '';
              }
            }
          }
          if (cleanUrl && title && author) break;
        }
        f = f.return;
      }
    }

    if (!cleanUrl) {
      cleanUrl =
        v.currentSrc?.startsWith('http') && !v.currentSrc.startsWith('blob:')
          ? v.currentSrc
          : v.src?.startsWith('http') && !v.src.startsWith('blob:')
            ? v.src
            : '';
    }

    let c: HTMLElement | null = v;
    while (c && c !== doc.body && (!title || !author)) {
      if (!title) {
        title =
          c
            .querySelector?.(
              '[data-e2e="video-desc"], .video-desc, [data-e2e="detail-video-desc"]',
            )
            ?.textContent?.trim() || '';
      }
      if (!author) {
        const aEl = c.querySelector?.(
          '[data-e2e="video-author-name"], [data-e2e="user-info"], a[href*="/user/"], .author-info',
        );
        if (aEl) {
          author = (aEl.textContent || '')
            .trim()
            .split(/[\n·•]/)[0]
            .replace(/^@/, '')
            .trim();
        }
      }
      c = c.parentElement;
    }

    return cleanUrl ? { url: cleanUrl, title, author } : null;
  } catch {
    return null;
  }
}

export const MAIN_EXTRACT_SNIPPET = `(${extractVideoFromDom.toString()})(document, window)`;

export function normalizeDouyinMedia(
  res: RawVideoInfo | null | undefined,
  documentTitle = '',
): DouyinMedia | null {
  if (!res?.url) return null;

  const url = res.url.replace('playwm', 'play');
  const cleanTitle = (res.title || documentTitle.replace(/[-_] 抖音.*/, '') || '')
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_')
    .trim()
    .substring(0, 60);
  const safeTitle =
    (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleanTitle)
      ? `_${cleanTitle}`
      : cleanTitle) || 'douyin_video';
  const safeAuthor =
    (res.author || '抖音创作者')
      .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_')
      .trim()
      .substring(0, 30) || '抖音创作者';

  return {
    url,
    title: safeTitle,
    author: safeAuthor,
    filename: `${safeAuthor} - ${safeTitle}.mp4`,
  };
}
