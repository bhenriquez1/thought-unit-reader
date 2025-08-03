// components/ErrorBoundary.tsx
import React from 'react';

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // You can log to a service here
    console.warn("ErrorBoundary caught:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return (
          <div className="p-4 bg-red-900 text-white rounded">
            {this.props.fallback}
            <div className="mt-2">
              <button
                onClick={this.reset}
                className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700"
              >
                Retry
              </button>
            </div>
            <div className="mt-2 text-xs">
              {this.state.error?.message && <div><strong>Error:</strong> {this.state.error.message}</div>}
            </div>
          </div>
        );
      }
      return (
        <div className="p-4 bg-red-900 text-white rounded">
          <div>Something went wrong.</div>
          <button
            onClick={this.reset}
            className="mt-2 px-3 py-1 bg-gray-800 rounded hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}