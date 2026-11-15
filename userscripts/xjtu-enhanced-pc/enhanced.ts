import { injectStyle } from '../../shared/dom.ts';

export const DEAN_STYLE = `
            .wow, .animated {
                visibility: visible !important;
                opacity: 1 !important;
                animation: none !important;
            }
        `;

export const JWXT_STYLE = `
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `;

export function init(
  doc: Document = document,
  loc: Pick<Location, 'hostname' | 'pathname'> = window.location,
  openFn: (url: string, target: string) => unknown = window.open.bind(window),
): void {
  const host = loc.hostname;
  const path = loc.pathname;

  // 1. 针对教务处网站：抹平全站过渡与延迟动画
  if (host.includes('dean.xjtu.edu.cn') || host.includes('jwc.xjtu.edu.cn')) {
    injectStyle(DEAN_STYLE, { doc });
  }

  // 2. 针对本科教务系统：解除卡片标题 text-overflow 限制
  if (host.includes('jwxt.xjtu.edu.cn') || host.includes('ehall.xjtu.edu.cn')) {
    injectStyle(JWXT_STYLE, { doc });
  }

  // 3. 针对思源学堂 LMS/Class 平台：拦截活动点击，新标签页打开，防止返回刷新丢失大纲状态
  if (
    (host.includes('lms.xjtu.edu.cn') || host.includes('class.xjtu.edu.cn')) &&
    path.includes('/lesson')
  ) {
    const courseId = path.match(/\/course\/(\d+)/)?.[1];
    doc.addEventListener(
      'click',
      (e: MouseEvent) => {
        if (e.button === 0 && courseId) {
          const target = e.target as Element | null;
          const item = target?.closest('.learning-activity');
          if (item?.id && target?.closest('.clickable-area')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const activityId = item.id.split('-').pop();
            openFn(`/course/${courseId}/learning-activity#/${activityId}`, '_blank');
          }
        }
      },
      true,
    );
  }
}
