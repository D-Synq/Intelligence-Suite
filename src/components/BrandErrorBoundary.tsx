import { Component, ReactNode, ErrorInfo } from 'react';
import { DSynqLogo } from './DSynqLogo';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class BrandErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DSynq Error Boundary]', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8 text-forest">
          <div className="app-ambient" />
          <div className="dsynq-card dsynq-card-rim relative z-10 w-full max-w-lg p-6 sm:p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-visible bg-transparent">
              <DSynqLogo size="xl" interactive={false} className="h-16 w-16" />
            </div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-status-error/30 bg-status-errorBg px-3 py-1 text-xs font-semibold text-status-error">
              <AlertTriangle size={13} />
              <span>Application Exception</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-forest">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-sage">
              DSynq encountered an unexpected error while processing your request.
            </p>

            {this.state.error?.message && (
              <div className="mt-4 rounded-xl border border-color-border bg-color-input p-3 text-left font-mono text-[11px] text-status-error overflow-x-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="dsynq-btn-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold"
              >
                <RefreshCw size={14} />
                <span>Reload Application</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="dsynq-btn-secondary rounded-lg px-4 py-2.5 text-xs font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default BrandErrorBoundary;
