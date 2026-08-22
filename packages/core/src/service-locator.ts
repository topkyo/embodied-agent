/**
 * 进程内单例绑定容器。`@embodied-agent/node` 的 `bindNodeRuntime` 使用此 helper；
 * `@embodied-agent/agent` 改为显式 `AgentRuntimeContext` 传递（无模块级 locator）。
 */
export type ServiceLocator<T> = {
  bind: (next: T) => void;
  get: () => T;
  resetForTest: () => void;
};

export function createServiceLocator<T>(name: string): ServiceLocator<T> {
  let bindings: T | null = null;
  return {
    bind(next: T) {
      bindings = next;
    },
    get(): T {
      if (!bindings) {
        throw new Error(`${name} must be bound before use`);
      }
      return bindings;
    },
    resetForTest() {
      bindings = null;
    },
  };
}
