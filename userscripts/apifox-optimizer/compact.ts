import { injectStyle } from '../../shared/dom.ts';

export const STYLE_ID = 'apifox-compact-optimizer-style';
export const PRIMARY_SIDEBAR_SELECTOR =
  '#root > div > section > div.flex.h-full > div:first-child';

export const COMPACT_STYLES = `
        /* 1. 一级侧边导航栏宽度收窄为 46px，隐藏原生拖拽手柄 */
        ${PRIMARY_SIDEBAR_SELECTOR} { width: 46px !important; min-width: 46px !important; max-width: 46px !important; padding: 0 !important; overflow-x: hidden !important; }
        ${PRIMARY_SIDEBAR_SELECTOR} > div.drag { display: none !important; }

        /* 2. 定位原生二级菜单折叠按钮至左侧栏顶部，设置 z-index 确保低于模态弹窗 */
        div[class*="footer-"] > button.ui-btn-icon-only:first-child {
            position: fixed !important;
            top: 8px !important;
            left: 6px !important;
            z-index: 100 !important;
            width: 34px !important;
            height: 34px !important;
            min-height: 34px !important;
            max-height: 34px !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            border-radius: 8px !important;
            background: transparent !important;
            border: none !important;
            cursor: pointer !important;
            color: inherit !important;
            transition: background-color 0.15s ease !important;
        }
        div[class*="footer-"] > button.ui-btn-icon-only:first-child:hover {
            background-color: rgba(125, 125, 125, 0.12) !important;
        }

        /* 3. 项目 Logo 缩放为 28px 并水平居中，位于顶部折叠按钮下方 */
        ${PRIMARY_SIDEBAR_SELECTOR} [class*="logoContainer"] { transform: scale(0.7) !important; transform-origin: center center !important; margin: 0 auto !important; display: flex !important; justify-content: center !important; align-items: center !important; }

        /* 4. 隐藏导航项文本并保留图标，统一尺寸为 34x34px */
        ${PRIMARY_SIDEBAR_SELECTOR} a > span:not([role="img"]),
        ${PRIMARY_SIDEBAR_SELECTOR} button > :not([class*="icon"]):not([role="img"]) { display: none !important; }
        ${PRIMARY_SIDEBAR_SELECTOR} a,
        ${PRIMARY_SIDEBAR_SELECTOR} button:not(.ui-btn-icon-only) { width: 34px !important; height: 34px !important; min-height: 34px !important; max-height: 34px !important; padding: 0 !important; margin: 4px auto !important; display: flex !important; justify-content: center !important; align-items: center !important; border-radius: 8px !important; box-sizing: border-box !important; transition: background-color 0.15s ease !important; }
        ${PRIMARY_SIDEBAR_SELECTOR} :is(a, button) .appicon { font-size: 18px !important; margin: 0 !important; padding: 0 !important; }
        ${PRIMARY_SIDEBAR_SELECTOR} button > [class*="icon"] { margin: 0 !important; padding: 0 !important; display: flex !important; }
        ${PRIMARY_SIDEBAR_SELECTOR} .ui-divider { width: 24px !important; min-width: 24px !important; margin: 8px auto !important; }

        /* 5. 顶栏高度压缩至 35px，面包屑垂直居中，保持左右 16px 边距 */
        div[class*="webContainer"] { display: flex !important; flex-direction: column !important; height: 100% !important; max-height: 100% !important; overflow: hidden !important; flex: 1 1 auto !important; }
        div[class*="webTitleBar"] { flex: 0 0 35px !important; height: 35px !important; min-height: 35px !important; max-height: 35px !important; overflow: hidden !important; }
        div[class*="webTitleBar"] > div { height: 35px !important; min-height: 35px !important; max-height: 35px !important; padding-top: 0 !important; padding-bottom: 0 !important; display: flex !important; align-items: center !important; }
        div[class*="webTitleBar"] [class*="breadcrumbContainer"], div[class*="webTitleBar"] nav.ui-breadcrumb, div[class*="webTitleBar"] nav.ui-breadcrumb > ol, div[class*="webTitleBar"] nav.ui-breadcrumb li { height: 100% !important; display: flex !important; align-items: center !important; margin: 0 !important; padding: 0 !important; }
        div[class*="webTitleBar"] [class*="topNavProjectSelectWrap"] { display: inline-flex !important; align-items: center !important; }
        div[class*="webTitleBar"] [class*="toolbar"] button { height: 26px !important; width: 26px !important; padding: 0 !important; }

        /* 6. 主工作区容器高度自适应延展 */
        div[class*="layoutContainer"] { flex: 1 1 0% !important; height: calc(100% - 35px) !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; }
        div[class*="layoutContent"] { flex: 1 1 0% !important; height: 100% !important; min-height: 0 !important; }

        /* 7. 顶部接口标签栏高度压缩至 32px，限定直接子代选择器避免污染内容区标签 */
        [class*="main-tabs"] > .ui-tabs-nav { margin: 0 !important; min-height: 32px !important; height: 32px !important; }
        [class*="main-tabs"] > .ui-tabs-nav .ui-tabs-tab { padding: 3px 12px !important; height: 32px !important; font-size: 13px !important; }

        /* 8. 调试/设计栏与请求地址栏内边距压缩 */
        .httpApi_tabConfig_container { padding: 0 16px !important; margin: 0 !important; min-height: 30px !important; height: 30px !important; }
        .ui-tabs.ui-tabs-soft-primary-button > .httpApi_tabConfig_container .ui-tabs-tab { padding: 3px 8px !important; margin-top: 0 !important; margin-bottom: 0 !important; font-size: 13px !important; }
        .ui-tabs:not(.ui-tabs-soft-primary-button) > .httpApi_tabConfig_container .ui-tabs-nav-list { gap: 14px !important; }
        .ui-tabs:not(.ui-tabs-soft-primary-button) > .httpApi_tabConfig_container .ui-tabs-tab { padding: 3px 0 !important; margin: 0 !important; font-size: 13px !important; }
        [class*="tab-bar-"] { min-height: 30px !important; }
        [class*="tab-bar-"] .flex-1.items-center { height: 30px !important; display: flex !important; align-items: center !important; }
        .px-5.py-3.flex:has([class*="http-api-url-input-wrapper"]),
        .px-5.py-3.flex[style*="border-bottom"] { padding-top: 6px !important; padding-bottom: 6px !important; align-items: center !important; }
        .main-input-bar { padding-top: 6px !important; padding-bottom: 6px !important; margin-top: 0 !important; margin-bottom: 0 !important; min-height: 0 !important; align-items: center !important; }
        .main-input-bar .url-col,
        .main-input-bar .action-col .ui-btn { height: 30px !important; min-height: 30px !important; }
        .main-input-bar .url-col .ui-input { height: 28px !important; min-height: 28px !important; }
    `;

export function injectStyles(doc: Document = document): HTMLStyleElement {
  return injectStyle(COMPACT_STYLES, { id: STYLE_ID, doc });
}

export function bindHoverTooltip(doc: Document = document): void {
  doc.addEventListener(
    'mouseover',
    (e: Event) => {
      const target = e.target as Element | null;
      const item = target?.closest<HTMLElement>(
        `${PRIMARY_SIDEBAR_SELECTOR} :is(a, button)`,
      );
      if (item && !item.title) {
        const text = item.textContent?.trim();
        if (text) item.title = text;
      }
    },
    { passive: true },
  );
}

export function init(doc: Document = document): void {
  injectStyles(doc);
  bindHoverTooltip(doc);
}
