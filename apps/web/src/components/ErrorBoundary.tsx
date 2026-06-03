/**
 * Page-level error boundary. Catches render errors so one broken page does not
 * blank the whole app.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console -- surface render errors in dev console
    console.error('Render error', error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="m-6 bg-surface border border-danger/40 rounded-lg p-4">
          <div className="text-danger font-semibold">Something went wrong</div>
          <div className="text-muted text-sm mt-1">{this.state.error.message}</div>
          <button
            className="mt-3 text-sm px-3 py-1.5 rounded bg-accent text-white"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
