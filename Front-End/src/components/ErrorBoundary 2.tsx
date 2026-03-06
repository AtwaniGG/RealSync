import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const canRetry = this.state.retryCount < MAX_RETRIES;
      return (
        <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Something went wrong</h1>
            <p className="text-gray-400 mb-2 text-sm">
              An unexpected error occurred.
            </p>
            {this.state.errorMessage && (
              <p className="text-gray-500 mb-6 text-xs font-mono bg-[#1a1a2e] rounded p-2 break-words">
                {this.state.errorMessage}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState((prev) => ({ hasError: false, errorMessage: null, retryCount: prev.retryCount + 1 }))}
                disabled={!canRetry}
                className={`px-6 py-2.5 text-white rounded-lg text-sm font-medium transition-colors ${canRetry ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
              >
                {canRetry ? 'Try Again' : `Try Again (limit reached)`}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
