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

      // Default error UI
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 bg-red-50 border-2 border-red-200 rounded-lg">
          <div className="text-center space-y-4">
            <div className="text-6xl">🚨</div>
            <h2 className="text-xl font-bold text-red-800">Something went wrong</h2>
            <p className="text-sm text-red-600 max-w-md">
              {error?.message || 'An unexpected error occurred while rendering this component.'}
            </p>
            
            {retryCount > 0 && (
              <p className="text-xs text-red-500">
                Retry attempt: {retryCount}/{maxRetries}
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                disabled={retryCount >= maxRetries}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-300 text-white rounded transition-colors"
              >
                {retryCount >= maxRetries ? 'Max Retries Reached' : 'Try Again'}
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
              >
                Reload Page
              </button>
            </div>

            {/* Development error details */}
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-red-700 hover:text-red-800">
                  Show Error Details (Development)
                </summary>
                <div className="mt-2 p-3 bg-red-100 rounded text-xs font-mono text-red-800 whitespace-pre-wrap">
                  <strong>Error:</strong> {error?.name}: {error?.message}
                  {'\n\n'}
                  <strong>Stack:</strong> {error?.stack}
                  {'\n\n'}
                  <strong>Component Stack:</strong> {errorInfo?.componentStack}
                </div>
              </details>
            )}
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
