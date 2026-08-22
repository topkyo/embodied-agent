import { useEffect, useRef } from "react";

export type UseIntervalOptions = {
  /**
   * 为 true 时：document 隐藏则暂停 interval，恢复可见后重新启动。
   * 默认 false。
   */
  visibleOnly?: boolean;
};

/**
 * 稳定轮询 hook：callback 始终取最新闭包；delayMs 为 null 时停表。
 * visibleOnly 时尊重 document.visibilityState，后台标签页不轮询。
 */
export function useInterval(
  callback: () => void,
  delayMs: number | null,
  options?: UseIntervalOptions,
): void {
  const savedCallback = useRef(callback);
  const visibleOnly = options?.visibleOnly ?? false;

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null || delayMs <= 0 || !Number.isFinite(delayMs)) {
      return;
    }

    let id: number | null = null;

    const clear = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };

    const start = () => {
      clear();
      id = window.setInterval(() => {
        savedCallback.current();
      }, delayMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        clear();
      }
    };

    if (!visibleOnly || document.visibilityState === "visible") {
      start();
    }

    if (visibleOnly) {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      clear();
      if (visibleOnly) {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [delayMs, visibleOnly]);
}
