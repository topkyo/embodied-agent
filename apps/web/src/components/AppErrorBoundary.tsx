import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

/**
 * 工作台根级 ErrorBoundary：捕 React 组件渲染抛错（典型：忘记包 AuthProvider 即调
 * useAuth()），避免生产空白页。reset path 回到 /start 让用户重新进入工作台。
 */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    if (import.meta.env?.DEV !== true) {
      // 生产期静默：避免把内部栈输出到控制台噪声，运维看板有现成日志真源。
    } else {
      // 开发期显式输出，便于定位
      console.error("[AppErrorBoundary]", error, info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="page-wrap marketing-shell scene-page">
        <main className="scene-section">
          <p className="eyebrow">500</p>
          <h1>工作台初始化失败</h1>
          <p className="sub muted">{error.message || "未知错误，请重试或联系运维。"}</p>
          <div className="actions u-mt-md">
            <Link className="btn btn-primary" to="/start" onClick={this.reset}>
              回到领域选择
            </Link>
            <Link className="btn btn-ghost" to="/login" onClick={this.reset}>
              重新登录
            </Link>
          </div>
        </main>
      </div>
    );
  }
}
