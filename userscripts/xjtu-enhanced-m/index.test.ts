import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEAN_MOBILE_BASE_STYLE,
  JXXX_MOBILE_STYLE,
  JWXT_MOBILE_STYLE,
  init,
  initDropdown,
} from './enhanced.ts';

describe('xjtu-enhanced-m', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('按域名与路径注入移动端优化样式', () => {
    init(document, {
      hostname: 'jwxt.xjtu.edu.cn',
      pathname: '/',
      href: 'https://jwxt.xjtu.edu.cn/',
    });
    expect(document.head.textContent).toContain(JWXT_MOBILE_STYLE);

    document.head.innerHTML = '';
    init(document, {
      hostname: 'dean.xjtu.edu.cn',
      pathname: '/jxxx/jxtz2/list.htm',
      href: 'https://dean.xjtu.edu.cn/jxxx/jxtz2/list.htm',
    });
    expect(document.head.textContent).toContain(DEAN_MOBILE_BASE_STYLE);
    expect(document.head.textContent).toContain(JXXX_MOBILE_STYLE);
  });

  it('生成双列分类菜单、高亮当前项并支持点击开关与外部收起', () => {
    document.body.innerHTML = `
      <div class="nav2"><span>教学通知</span></div>
      <ul class="nav-dh">
        <li class="on">
          <a href="/jxxx/list.htm">教学信息</a>
          <ul>
            <li><a href="/jxxx/jxtz2/tz.htm">通知公告</a></li>
            <li><a href="/jxxx/jxtz2/ks.htm">考试安排</a></li>
          </ul>
        </li>
      </ul>
    `;

    initDropdown(document, {
      pathname: '/jxxx/jxtz2/tz.htm',
      href: 'https://dean.xjtu.edu.cn/jxxx/jxtz2/tz.htm',
    });

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.mobile-dropdown-menu a'));
    expect(links.map((a) => a.textContent)).toEqual(['全部', '通知公告', '考试安排']);
    expect(links[0].classList.contains('curr-active')).toBe(false);
    expect(links[1].classList.contains('curr-active')).toBe(true);
    expect(links[2].classList.contains('curr-active')).toBe(false);

    const btn = document.querySelector<HTMLButtonElement>('.mobile-dropdown-btn')!;
    const menu = document.querySelector('.mobile-dropdown-menu')!;

    btn.click();
    expect(menu.classList.contains('show')).toBe(true);

    document.body.click();
    expect(menu.classList.contains('show')).toBe(false);
  });
});
