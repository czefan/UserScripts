import { describe, expect, it } from 'vitest';
import {
  addedRoots,
  createIpDisplayController,
  type ReplyItem,
} from './ip-display.ts';

interface FakeObserverInstance {
  callback: MutationCallback;
  target: Node | null;
  observe(target: Node): void;
  disconnect(): void;
}

interface FakeLabel {
  className: string;
  textContent: string;
  removed?: boolean;
  anchor?: FakeDateNode | null;
  remove(): void;
}

interface FakeDateNode {
  nodeType: number;
  nextSibling: FakeLabel | null;
  matches: () => boolean;
  closest: () => FakeDateNode;
  after(label: FakeLabel): void;
  __vueParentComponent?: { props: { reply: ReplyItem } };
}

function createFixture() {
  const observers: FakeObserverInstance[] = [];

  class FakeObserver {
    callback: MutationCallback;
    target: Node | null = null;

    constructor(callback: MutationCallback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target: Node) {
      this.target = target;
    }
    disconnect() {
      this.target = null;
    }
    takeRecords(): MutationRecord[] {
      return [];
    }
  }

  const fakeDoc = {
    createElement: () => {
      const el: FakeLabel = {
        className: '',
        textContent: '',
        anchor: null,
        remove() {
          el.removed = true;
          if (el.anchor) el.anchor.nextSibling = null;
        },
      };
      return el;
    },
    getElementById: (): unknown => null,
    querySelector: (): unknown => null,
  };

  const controller = createIpDisplayController({
    doc: fakeDoc as unknown as Document,
    Observer: FakeObserver as unknown as typeof MutationObserver,
  });

  const dateNode = (): FakeDateNode => ({
    nodeType: 1,
    nextSibling: null,
    matches: () => false,
    closest() {
      return this;
    },
    after(label: FakeLabel) {
      this.nextSibling = label;
      label.anchor = this;
    },
  });

  return { controller, fakeDoc, observers, dateNode };
}

describe('bilibili-ip-display', () => {
  it('延迟数据到达时可渲染、更新并移除过期属地标签', () => {
    const { controller, observers, dateNode } = createFixture();
    const date = dateNode();
    const shadow = {
      host: {} as { data?: ReplyItem },
      getElementById: () => date,
      firstElementChild: null,
      querySelectorAll: () => [],
    } as unknown as ShadowRoot & { host: { data?: ReplyItem } };

    controller.watchShadow(shadow);
    expect(date.nextSibling).toBeNull();

    // observers[0] 为 commentObserver，observers[1] 为当前 shadow observer
    shadow.host.data = { reply_control: { location: 'IP属地：北京' } };
    observers[1].callback([], observers[1] as unknown as MutationObserver);
    const label = date.nextSibling!;
    expect(label.textContent).toBe('IP属地：北京');

    shadow.host.data.reply_control!.location = 'IP属地：江苏';
    observers[1].callback([], observers[1] as unknown as MutationObserver);
    expect(date.nextSibling).toBe(label);
    expect(label.textContent).toBe('IP属地：江苏');

    shadow.host.data.reply_control!.location = '';
    observers[1].callback([], observers[1] as unknown as MutationObserver);
    expect(date.nextSibling).toBeNull();
  });

  it('评论容器替换后重新连接 Vue 观察器', () => {
    let container = {
      name: 'first',
      nodeType: 1,
      tagName: 'DIV',
      firstElementChild: null,
      matches: () => false,
      querySelectorAll: () => [],
    };
    const { controller, fakeDoc, observers } = createFixture();
    fakeDoc.getElementById = () => container;

    controller.bindCommentApp();
    expect((observers[0].target as unknown as { name: string }).name).toBe('first');

    container = { ...container, name: 'second' };
    controller.bindCommentApp();
    controller.bindCommentApp();

    expect((observers[0].target as unknown as { name: string }).name).toBe('second');
  });

  it('组件替换时间节点时清理旧标签并清理悬空标签', () => {
    const { controller, observers, dateNode } = createFixture();
    let date: FakeDateNode | null = dateNode();
    const shadow = {
      host: { data: { reply_control: { location: 'IP属地：北京' } } },
      getElementById: () => date,
      firstElementChild: null,
      querySelectorAll: () => [],
    } as unknown as ShadowRoot & { host: { data: ReplyItem } };

    controller.watchShadow(shadow);
    const oldLabel = date.nextSibling!;

    date = dateNode();
    shadow.host.data.reply_control!.location = 'IP属地：江苏';
    observers[1].callback([], observers[1] as unknown as MutationObserver);
    expect(oldLabel.removed).toBe(true);
    expect(date.nextSibling!.textContent).toBe('IP属地：江苏');

    const latestLabel = date.nextSibling!;
    date = null;
    observers[1].callback([], observers[1] as unknown as MutationObserver);
    expect(latestLabel.removed).toBe(true);
  });

  it('将重复和嵌套的新增节点折叠为单一最外层扫描根', () => {
    const parent = { nodeType: 1, parentNode: null } as unknown as Element;
    const child = { nodeType: 1, parentNode: parent } as unknown as Element;
    const roots = addedRoots([
      { addedNodes: [parent, child] },
      { addedNodes: [child, parent] },
    ]);
    expect(roots).toEqual([parent]);
  });

  it('评论容器存活时对无关文档变更跳过查询，失效后重新绑定', () => {
    const { controller, fakeDoc, observers } = createFixture();
    let container = {
      isConnected: true,
      nodeType: 1,
      tagName: 'DIV',
      firstElementChild: null,
      matches: () => false,
      querySelectorAll: () => [],
    };

    let queries = 0;
    fakeDoc.getElementById = () => {
      queries++;
      return container;
    };
    fakeDoc.querySelector = () => {
      queries++;
      return null;
    };

    controller.bindCommentApp();
    queries = 0;
    for (let i = 0; i < 100; i++) {
      controller.onDocumentMutations([]);
    }
    expect(queries).toBe(0);

    container.isConnected = false;
    container = { ...container, isConnected: true };
    controller.onDocumentMutations([]);
    expect(queries).toBe(1);
    expect(observers[0].target).toBe(container);
  });

  it('同一批变更内对同一 Vue 子树只扫描一次且不重扫父节点', () => {
    const { controller, observers } = createFixture();
    let scans = 0;
    const root = {
      nodeType: 1,
      parentNode: null,
      tagName: 'DIV',
      firstElementChild: null,
      matches: () => false,
      querySelectorAll: () => {
        scans++;
        return [];
      },
    } as unknown as Element;
    const target = {
      nodeType: 1,
      closest: () => null,
      querySelectorAll: () => {
        throw new Error('Parent rescanned');
      },
    } as unknown as Element;

    const mutations = Array.from({ length: 100 }, () => ({
      target,
      addedNodes: [root],
    })) as unknown as MutationRecord[];

    observers[0].callback(mutations, observers[0] as unknown as MutationObserver);
    expect(scans).toBe(1);
  });

  it('变更已有 Vue 时间节点时就地更新而不扫描兄弟节点', () => {
    const { observers, dateNode } = createFixture();
    const date = dateNode();
    date.matches = () => true;
    date.closest = () => date;
    date.__vueParentComponent = {
      props: { reply: { reply_control: { location: 'IP属地：北京' } } },
    };

    observers[0].callback(
      [{ target: date, addedNodes: [] }] as unknown as MutationRecord[],
      observers[0] as unknown as MutationObserver,
    );
    expect(date.nextSibling!.textContent).toBe('IP属地：北京');

    date.__vueParentComponent.props.reply.reply_control!.location = 'IP属地：江苏';
    observers[0].callback(
      [{ target: { nodeType: 3, parentElement: date }, addedNodes: [] }] as unknown as MutationRecord[],
      observers[0] as unknown as MutationObserver,
    );
    expect(date.nextSibling!.textContent).toBe('IP属地：江苏');
  });

  it('能够发现并监听已存在的嵌套评论 Shadow Root', () => {
    const { controller, observers, dateNode } = createFixture();
    const date = dateNode();
    const inner = {
      host: { data: { reply_control: { location: 'IP属地：北京' } } },
      getElementById: () => date,
      firstElementChild: null,
      querySelectorAll: () => {
        throw new Error('Leaf scanned');
      },
    } as unknown as ShadowRoot;
    const host = {
      tagName: 'BILI-COMMENT-ACTION-BUTTONS-RENDERER',
      shadowRoot: inner,
    } as unknown as Element;
    const outer = {
      host: {},
      getElementById: () => null,
      firstElementChild: host,
      querySelectorAll: () => [host],
    } as unknown as ShadowRoot;

    controller.watchShadow(outer);
    // observers[0] = commentObserver, observers[1] = outer shadow, observers[2] = inner shadow
    expect(observers).toHaveLength(3);
    expect(date.nextSibling!.textContent).toBe('IP属地：北京');
  });

  it('忽略无关新增子树并在评论容器插入时触发发现', () => {
    const { controller, fakeDoc, observers } = createFixture();
    let queries = 0;
    const container = {
      nodeType: 1,
      isConnected: true,
      tagName: 'DIV',
      firstElementChild: null,
      matches: () => false,
      querySelectorAll: () => [],
    };
    fakeDoc.getElementById = () => {
      queries++;
      return container;
    };

    const unrelated = {
      nodeType: 1,
      parentNode: null,
      matches: () => false,
      querySelector: () => null,
    } as unknown as Node;
    controller.onDocumentMutations([{ addedNodes: [unrelated] }]);
    expect(queries).toBe(0);

    const wrapper = {
      nodeType: 1,
      parentNode: null,
      matches: () => false,
      querySelector: () => container,
    } as unknown as Node;
    controller.onDocumentMutations([{ addedNodes: [wrapper] }]);
    expect(queries).toBe(1);
    expect(observers[0].target).toBe(container);
  });
});
