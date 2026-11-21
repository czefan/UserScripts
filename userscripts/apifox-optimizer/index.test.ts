import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMPACT_STYLES,
  PRIMARY_SIDEBAR_SELECTOR,
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
    expect(first.textContent).toContain('.httpApi_tabConfig_container .ui-tabs-tab');
    expect(first.textContent).toContain('.main-input-bar');
    expect(first.textContent).toContain('.px-5.py-3.flex:has([class*="http-api-url-input-wrapper"])');
  });

  it('编辑页请求地址栏选择器同时兼容旧版带底边框与新版无底边框结构', () => {
    document.body.innerHTML = `
      <div class="flex py-3 px-5" id="new-edit-url-bar">
        <div class="flex-grow">
          <div class="http-api-url-input-wrapper-cgtFaT"></div>
        </div>
      </div>
      <div class="px-5 py-3 flex" id="unrelated-row"></div>
    `;

    const matched = document.querySelectorAll(
      '.px-5.py-3.flex:has([class*="http-api-url-input-wrapper"])',
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('new-edit-url-bar');
  });

  it('侧边栏选择器仅命中顶层一级导航，不误伤调试请求栏与返回响应标题', () => {
    document.body.innerHTML = `
      <div id="root">
        <div class="h-screen w-full flex">
          <section class="flex flex-col w-full h-full">
            <div class="flex h-full">
              <div id="primary-sidebar"></div>
              <div class="webContainer">
                <section class="flex-1 overflow-hidden">
                  <form class="ui-form flex flex-col h-full">
                    <div id="debug-input-bar" class="main-input-bar debug-mode"></div>
                  </form>
                </section>
                <section class="w-full h-full flex flex-col">
                  <div class="flex w-full h-full">
                    <div id="response-header-title">返回响应</div>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    const matched = document.querySelectorAll(PRIMARY_SIDEBAR_SELECTOR);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('primary-sidebar');
  });

  it('悬停左侧导航项时补充缺失的 title，已有 title 不覆盖', () => {
    document.body.innerHTML = `
      <div id="root">
        <div>
          <section>
            <div class="flex h-full">
              <div>
                <a id="nav-no-title"><span>  接口管理  </span></a>
                <button id="nav-with-title" title="已有提示"><span>设置</span></button>
              </div>
            </div>
          </section>
        </div>
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
