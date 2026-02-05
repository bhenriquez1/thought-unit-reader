"use client";

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number | boolean>;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Log to performance profiler if available
    if (window.performance && window.performance.mark) {
      window.performance.mark('error-boundary-catch');
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys && resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i])) {
        this.resetErrorBoundary();
      }
    }

    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1
    });
  };

  handleRetry = () => {
    const maxRetries = this.props.maxRetries || 3;
    
    if (this.state.retryCount < maxRetries) {
      this.resetErrorBoundary();
    } else {
      // Max retries reached, reload the page
      window.location.reload();
    }
  };

  handleAutoRetry = () => {
    // Auto-retry after 2 seconds for transient errors
    this.resetTimeoutId = window.setTimeout(() => {
      if (this.state.hasError && this.state.retryCount < (this.props.maxRetries || 3)) {
        this.resetErrorBoundary();
      }
    }, 2000);
  };

  render() {
    const { hasError, error, errorInfo, retryCount } = this.state;
    const { fallback, maxRetries = 3 } = this.props;

    if (hasError) {
      // Auto-retry for the first error
      if (retryCount === 0) {
        this.handleAutoRetry();
      }

      // Custom fallback component
      if (fallback) {
        return fallback;
      }

      // Default error UI (dark theme)
      return (
        <div className="h-full min-h-[200px] flex flex-col items-center justify-center p-8 bg-gray-900 text-white">
          <div className="text-center space-y-4 max-w-md">
            <div className="text-6xl">⚠️</div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-sm text-gray-400">
              {error?.message || 'An unexpected error occurred while loading this view.'}
            </p>

            {retryCount > 0 && (
              <p className="text-xs text-gray-500">
                Retry attempt: {retryCount}/{maxRetries}
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                disabled={retryCount >= maxRetries}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {retryCount >= maxRetries ? 'Max Retries' : 'Try Again'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Reload Page
              </button>
            </div>

            {/* Error details (always shown, collapsed) */}
            <details className="mt-4 text-left bg-gray-800 rounded-lg p-3">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300">
                Show Error Details
              </summary>
              <div className="mt-2 text-xs font-mono text-red-400 whitespace-pre-wrap overflow-auto max-h-48">
                <strong>Error:</strong> {error?.name}: {error?.message}
                {'\n\n'}
                <strong className="text-gray-500">Stack:</strong>
                <pre className="text-gray-500 mt-1">{error?.stack}</pre>
                {errorInfo?.componentStack && (
                  <>
                    {'\n'}
                    <strong className="text-gray-500">Component Stack:</strong>
                    <pre className="text-gray-500 mt-1">{errorInfo.componentStack}</pre>
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;
