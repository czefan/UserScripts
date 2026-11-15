import { injectStyle } from '../../shared/dom.ts';

export interface ReplyItem {
  reply_control?: {
    location?: string;
  };
}

export interface BiliHostElement extends Element {
  data?: ReplyItem;
}

export interface VueTimeElement extends Element {
  __vueParentComponent?: {
    props?: {
      reply?: ReplyItem;
      subReply?: ReplyItem;
    };
  };
}

export const BILI_STYLE = `
        .reply-location {
          color: #9499A0;
          font-size: 13px;
          margin-right: 20px;
        }
        .reply-location.vue-style { margin-left: 8px; }
      `;

const ELEMENT_NODE = 1;
const BILI_TAG_PATTERN = /^BILI-(COMMENT|REPLY)/i;
const VUE_TIME_SELECTOR = '.reply-time, .sub-reply-time';
const COMMENT_ROOT_SELECTOR = '#comment, bili-comments';

// 同一批变更只扫描最外层新增子树，避免父子节点重复遍历。
export function addedRoots(
  mutations: Iterable<{ addedNodes: Iterable<Node> }>,
): Element[] {
  const roots = new Set<Element>();
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === ELEMENT_NODE) {
        roots.add(node as Element);
      }
    }
  }
  return [...roots].filter((node) => {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (roots.has(parent as Element)) return false;
    }
    return true;
  });
}

export interface ControllerDeps {
  doc?: Document;
  Observer?: typeof MutationObserver;
}

export function createIpDisplayController(deps: ControllerDeps = {}) {
  const doc = deps.doc ?? document;
  const Observer = deps.Observer ?? MutationObserver;

  // 标签与时间节点关联；组件复用节点时更新已有标签。
  const labels = new WeakMap<Element, HTMLSpanElement>();
  const shadowWatchers = new WeakMap<ShadowRoot, () => void>();
  let commentApp: Element | null = null;

  function handleNode(
    node: Element,
    item: ReplyItem | null | undefined,
    className?: string,
  ): void {
    const location = item?.reply_control?.location;
    let label = labels.get(node);
    if (!location) {
      label?.remove();
      labels.delete(node);
      return;
    }
    if (!label) {
      label = doc.createElement('span');
      label.className = `reply-location ${className ?? ''}`;
      labels.set(node, label);
    }
    if (label.textContent !== location) label.textContent = location;
    if (node.nextSibling !== label) node.after(label);
  }

  // 增量解析 Vue3 评论节点
  function checkVueNodes(addedNodes: Iterable<Node | Element>): void {
    for (const rootNode of addedNodes) {
      if (rootNode.nodeType !== ELEMENT_NODE) continue;
      const rootEl = rootNode as Element;
      const nodes: Iterable<Element> = rootEl.matches(VUE_TIME_SELECTOR)
        ? [rootEl]
        : rootEl.querySelectorAll(VUE_TIME_SELECTOR);

      for (const node of nodes) {
        const vueComp = (node as VueTimeElement).__vueParentComponent;
        const item = vueComp?.props?.reply || vueComp?.props?.subReply;
        if (item) {
          handleNode(node, item, 'vue-style');
        }
      }
    }
  }

  function scanShadowHosts(root: Element | ShadowRoot): void {
    const visit = (node: Element) => {
      if (BILI_TAG_PATTERN.test(node.tagName) && node.shadowRoot) {
        watchShadow(node.shadowRoot);
      }
    };
    if ('tagName' in root) {
      visit(root);
    }
    if (root.firstElementChild) {
      for (const node of root.querySelectorAll('*')) {
        visit(node);
      }
    }
  }

  function watchShadow(shadow: ShadowRoot): void {
    const existing = shadowWatchers.get(shadow);
    if (existing) {
      existing();
      return;
    }

    let previousPubdate: Element | null = null;
    const update = () => {
      const pubdate = shadow.getElementById('pubdate');
      if (previousPubdate && previousPubdate !== pubdate) {
        handleNode(previousPubdate, null);
      }
      previousPubdate = pubdate;
      const item = (shadow.host as BiliHostElement | null)?.data;
      if (pubdate && item) handleNode(pubdate, item, 'lit-style');
    };

    shadowWatchers.set(shadow, update);
    const observer = new Observer((mutations) => {
      update();
      for (const node of addedRoots(mutations)) {
        scanShadowHosts(node);
      }
    });
    observer.observe(shadow, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    update();
    scanShadowHosts(shadow);
  }

  // 评论内部由专用观察器处理，文档观察器只负责发现/替换评论容器。
  const commentObserver = new Observer((mutations) => {
    const changedTimes = new Set<Element>();
    for (const mutation of mutations) {
      const target =
        mutation.target.nodeType === ELEMENT_NODE
          ? (mutation.target as Element)
          : mutation.target.parentElement;
      const time = target?.closest(VUE_TIME_SELECTOR);
      if (time) changedTimes.add(time);
    }
    // 更新已有时间节点时只处理该节点，不扫描整个评论列表。
    checkVueNodes(changedTimes);
    const roots = addedRoots(mutations);
    checkVueNodes(roots);
    for (const node of roots) scanShadowHosts(node);
  });

  function bindCommentApp(): void {
    const next =
      doc.getElementById('comment') || doc.querySelector('bili-comments');
    if (next === commentApp) return;
    commentObserver.disconnect();
    commentApp = next;
    if (commentApp) {
      commentObserver.observe(commentApp, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      checkVueNodes([commentApp]);
      scanShadowHosts(commentApp);
    }
  }

  function onDocumentMutations(
    mutations: Iterable<{ addedNodes: Iterable<Node> }>,
  ): void {
    // 评论容器仍在页面中时，无关页面更新无需再次查询文档。
    if (commentApp?.isConnected) return;
    // 已有容器被移除，或新增子树包含评论容器时，才重新定位。
    if (
      commentApp ||
      addedRoots(mutations).some(
        (node) =>
          node.matches(COMMENT_ROOT_SELECTOR) ||
          Boolean(node.querySelector(COMMENT_ROOT_SELECTOR)),
      )
    ) {
      bindCommentApp();
    }
  }

  return {
    handleNode,
    checkVueNodes,
    scanShadowHosts,
    watchShadow,
    bindCommentApp,
    onDocumentMutations,
    commentObserver,
  };
}

export function initIpDisplay(doc: Document = document): void {
  const controller = createIpDisplayController({ doc });

  // 截获新组件，并补扫注入前已创建的 open Shadow Root。
  const origAttach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (
    this: Element,
    options: ShadowRootInit,
  ): ShadowRoot {
    const shadow = origAttach.call(this, options);
    if (BILI_TAG_PATTERN.test(this.tagName)) {
      controller.watchShadow(shadow);
    }
    return shadow;
  };

  injectStyle(BILI_STYLE, { doc });

  const globalObserver = new MutationObserver((mutations) =>
    controller.onDocumentMutations(mutations),
  );
  globalObserver.observe(doc.documentElement, {
    childList: true,
    subtree: true,
  });
  controller.bindCommentApp();
  controller.scanShadowHosts(doc.documentElement);
}
