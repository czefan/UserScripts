import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEAN_STYLE, JWXT_STYLE, init } from './enhanced.ts';

describe('xjtu-enhanced-pc', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('在教务处与本科教务域名下按站点注入对应样式', () => {
    init(document, { hostname: 'dean.xjtu.edu.cn', pathname: '/' });
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
    expect(document.head.textContent).toContain(DEAN_STYLE);

    document.head.innerHTML = '';
    init(document, { hostname: 'jwxt.xjtu.edu.cn', pathname: '/' });
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
    expect(document.head.textContent).toContain(JWXT_STYLE);
  });

  it('在思源学堂课程页拦截可点击活动并在新标签打开', () => {
    const openFn = vi.fn();
    document.body.innerHTML = `
      <div class="learning-activity" id="learning-activity-456">
        <div class="clickable-area"><span id="inner-text">课件</span></div>
      </div>
    `;

    init(
      document,
      { hostname: 'lms.xjtu.edu.cn', pathname: '/course/123/lesson' },
      openFn,
    );

    const inner = document.getElementById('inner-text')!;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    inner.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(openFn).toHaveBeenCalledWith(
      '/course/123/learning-activity#/456',
      '_blank',
    );
  });
});
