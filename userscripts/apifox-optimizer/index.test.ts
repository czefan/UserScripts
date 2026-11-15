import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPACT_STYLES,
  STYLE_ID,
  bindHoverTooltip,
  injectStyles,
} from './compact.ts';

describe('apifox-optimizer', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('注入样式且重复调用保持幂等', () => {
    const first = injectStyles(document);
    const second = injectStyles(document);

    expect(first).toBe(second);
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(first.textContent).toBe(COMPACT_STYLES);
    expect(first.textContent).toContain('width: 46px !important');
    expect(first.textContent).toContain('height: 35px !important');
  });

  it('悬停左侧导航项时补充缺失的 title，已有 title 不覆盖', () => {
    document.body.innerHTML = `
      <div id="root">
        <section>
          <div class="flex h-full">
            <div>
              <a id="nav-no-title"><span>  接口管理  </span></a>
              <button id="nav-with-title" title="已有提示"><span>设置</span></button>
            </div>
          </div>
        </section>
      </div>
    `;

    bindHoverTooltip(document);

    const linkSpan = document.querySelector('#nav-no-title span')!;
    linkSpan.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.getElementById('nav-no-title')!.title).toBe('接口管理');

    const btn = document.getElementById('nav-with-title')!;
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(btn.title).toBe('已有提示');
  });
});
