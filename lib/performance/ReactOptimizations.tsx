// lib/performance/ReactOptimizations.tsx
/**
 * React Performance Optimizations
 * Addresses: React.memo, useCallback, useMemo, Context splitting, Virtualization
 */

import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { markStart, markEnd, PerformanceMarks } from './PerformanceProfiler';

// ===============================
// 1. OPTIMIZED CONTEXT SYSTEM
// ===============================

// Split contexts to prevent unnecessary re-renders
interface AppContextState {
  // Page-specific state
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
}

interface ViewContextState {
  // View-specific state that changes frequently
  highlightedText: string;
  selectedThoughtUnit: number;
  fontSize: number;
  zoom: number;
}

interface DocumentContextState {
  // Document-level state that changes rarely
  documentId: string;
  documentTitle: string;
  thoughtUnits: any[];
  tableOfContents: any[];
}

// Separate contexts to minimize re-renders
const AppContext = React.createContext<{
  state: AppContextState;
  setState: React.Dispatch<React.SetStateAction<AppContextState>>;
} | null>(null);

const ViewContext = React.createContext<{
  state: ViewContextState;
  setState: React.Dispatch<React.SetStateAction<ViewContextState>>;
} | null>(null);

const DocumentContext = React.createContext<{
  state: DocumentContextState;
  setState: React.Dispatch<React.SetStateAction<DocumentContextState>>;
} | null>(null);

// Custom hooks for context access
export const useAppContext = () => {
  const context = React.useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};

export const useViewContext = () => {
  const context = React.useContext(ViewContext);
  if (!context) throw new Error('useViewContext must be used within ViewProvider');
  return context;
};

export const useDocumentContext = () => {
  const context = React.useContext(DocumentContext);
  if (!context) throw new Error('useDocumentContext must be used within DocumentProvider');
  return context;
};

// Context Providers with optimized updates
export const AppProvider: React.FC<{ children: React.ReactNode }> = memo(({ children }) => {
  const [state, setState] = useState<AppContextState>({
    currentPage: 1,
    totalPages: 0,
    isLoading: false,
  });

  const value = useMemo(() => ({ state, setState }), [state]);
  
  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
});

export const ViewProvider: React.FC<{ children: React.ReactNode }> = memo(({ children }) => {
  const [state, setState] = useState<ViewContextState>({
    highlightedText: '',
    selectedThoughtUnit: 0,
    fontSize: 16,
    zoom: 1.0,
  });

  const value = useMemo(() => ({ state, setState }), [state]);
  
  return (
    <ViewContext.Provider value={value}>
      {children}
    </ViewContext.Provider>
  );
});

export const DocumentProvider: React.FC<{ children: React.ReactNode }> = memo(({ children }) => {
  const [state, setState] = useState<DocumentContextState>({
    documentId: '',
    documentTitle: '',
    thoughtUnits: [],
    tableOfContents: [],
  });

  const value = useMemo(() => ({ state, setState }), [state]);
  
  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
});

// ===============================
// 2. VIRTUALIZED LIST COMPONENT
// ===============================

interface VirtualizedListProps {
  items: any[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: any, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
}

export const VirtualizedList: React.FC<VirtualizedListProps> = memo(({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(() => {
    const visible = [];
    for (let i = startIndex; i <= endIndex; i++) {
      if (items[i]) {
        visible.push({
          index: i,
          item: items[i],
          style: {
            position: 'absolute' as const,
            top: i * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight,
          },
        });
      }
    }
    return visible;
  }, [items, startIndex, endIndex, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={scrollElementRef}
      className={`relative overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ index, item, style }) => (
          <div key={index} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
});

// ===============================
// 3. OPTIMIZED COMPONENT WRAPPERS
// ===============================

// High-performance wrapper for PDF pages
interface OptimizedPDFPageProps {
  pageNumber: number;
  isVisible: boolean;
  scale: number;
  onRender?: (pageNumber: number, renderTime: number) => void;
  children: React.ReactNode;
}

export const OptimizedPDFPage: React.FC<OptimizedPDFPageProps> = memo(({
  pageNumber,
  isVisible,
  scale,
  onRender,
  children,
}) => {
  const renderStart = useRef<number>(0);
  
  useEffect(() => {
    if (isVisible) {
      renderStart.current = performance.now();
    }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible && renderStart.current > 0) {
      const renderTime = performance.now() - renderStart.current;
      onRender?.(pageNumber, renderTime);
    }
  });

  // Don't render if not visible (virtualization)
  if (!isVisible) {
    return (
      <div className="w-full h-64 bg-gray-100 flex items-center justify-center">
        <span className="text-gray-400">Page {pageNumber}</span>
      </div>
    );
  }

  return <>{children}</>;
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.pageNumber === nextProps.pageNumber &&
    prevProps.isVisible === nextProps.isVisible &&
    Math.abs(prevProps.scale - nextProps.scale) < 0.01 // Scale tolerance
  );
});

// Optimized thought unit component
interface OptimizedThoughtUnitProps {
  unit: any;
  index: number;
  isSelected: boolean;
  isHighlighted: boolean;
  fontSize: number;
  onSelect?: (index: number) => void;
  onHighlight?: (text: string) => void;
}

export const OptimizedThoughtUnit: React.FC<OptimizedThoughtUnitProps> = memo(({
  unit,
  index,
  isSelected,
  isHighlighted,
  fontSize,
  onSelect,
  onHighlight,
}) => {
  const handleClick = useCallback(() => {
    onSelect?.(index);
  }, [index, onSelect]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      onHighlight?.(selection);
    }
  }, [onHighlight]);

  const unitText = useMemo(() => {
    if (typeof unit === 'string') return unit;
    if (Array.isArray(unit)) return unit.join(' ');
    if (unit?.text) return unit.text;
    return JSON.stringify(unit);
  }, [unit]);

  const className = useMemo(() => {
    const base = 'p-3 cursor-pointer transition-colors duration-150';
    const selected = isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : 'hover:bg-gray-50';
    const highlighted = isHighlighted ? 'bg-yellow-100' : '';
    return `${base} ${selected} ${highlighted}`;
  }, [isSelected, isHighlighted]);

  return (
    <div
      className={className}
      onClick={handleClick}
      onMouseUp={handleMouseUp}
      style={{ fontSize }}
    >
      <div className="text-sm text-gray-500 mb-1">Unit {index + 1}</div>
      <div className="leading-relaxed">{unitText}</div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.index === nextProps.index &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.fontSize === nextProps.fontSize &&
    JSON.stringify(prevProps.unit) === JSON.stringify(nextProps.unit)
  );
});

// ===============================
// 4. PERFORMANCE MONITORING HOOKS
// ===============================

// Hook to detect unnecessary re-renders in development
export const useWhyDidYouUpdate = (name: string, props: Record<string, any>) => {
  const previous = useRef<Record<string, any>>();
  
  useEffect(() => {
    if (previous.current) {
      const allKeys = Object.keys({ ...previous.current, ...props });
      const changedProps: Record<string, { from: any; to: any }> = {};
      
      allKeys.forEach((key) => {
        if (previous.current![key] !== props[key]) {
          changedProps[key] = {
            from: previous.current![key],
            to: props[key],
          };
        }
      });
      
      if (Object.keys(changedProps).length) {
        console.log('[why-did-you-update]', name, changedProps);
      }
    }
    
    previous.current = props;
  });
};

// Hook to measure component render time
export const useRenderTime = (componentName: string) => {
  const renderStart = useRef<number>(0);
  const renderCount = useRef<number>(0);
  
  // Mark start before render
  renderStart.current = performance.now();
  renderCount.current += 1;
  
  useEffect(() => {
    const renderTime = performance.now() - renderStart.current;
    
    if (process.env.NODE_ENV === 'development' && renderTime > 16) {
      console.warn(`🐌 Slow render: ${componentName} took ${renderTime.toFixed(2)}ms (render #${renderCount.current})`);
    }
  });
};

// Hook to track component mount/unmount cycles
export const useComponentLifecycle = (componentName: string) => {
  const mountTime = useRef<number>(performance.now());
  
  useEffect(() => {
    const currentMountTime = performance.now();
    console.log(`🎭 ${componentName} mounted in ${(currentMountTime - mountTime.current).toFixed(2)}ms`);
    
    return () => {
      const unmountTime = performance.now();
      console.log(`🎭 ${componentName} unmounted after ${(unmountTime - currentMountTime).toFixed(2)}ms`);
    };
  }, [componentName]);
};

// ===============================
// 5. DEBOUNCED INPUT COMPONENT
// ===============================

interface DebouncedInputProps {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
  className?: string;
}

export const DebouncedInput: React.FC<DebouncedInputProps> = memo(({
  value,
  onChange,
  debounceMs = 300,
  placeholder,
  className = '',
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Update local value when prop value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceMs);
  }, [onChange, debounceMs]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
});

// ===============================
// 6. LAZY LOADING WRAPPER
// ===============================

interface LazyWrapperProps {
  children: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
  fallback?: React.ReactNode;
}

export const LazyWrapper: React.FC<LazyWrapperProps> = memo(({
  children,
  threshold = 0.1,
  rootMargin = '50px',
  fallback = <div className="h-32 bg-gray-100 animate-pulse" />,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return (
    <div ref={ref}>
      {isVisible ? children : fallback}
    </div>
  );
});

// ===============================
// 7. PERFORMANCE UTILITIES
// ===============================

// Higher-order component for performance monitoring
export function withPerformanceMonitoring<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) {
  const WrappedComponent: React.FC<P> = (props) => {
    useRenderTime(componentName);
    useComponentLifecycle(componentName);
    
    return <Component {...props} />;
  };
  
  WrappedComponent.displayName = `withPerformanceMonitoring(${componentName})`;
  return memo(WrappedComponent);
}

// Utility to create stable callbacks
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef<T>(callback);
  
  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Return stable callback
  return useCallback((...args: any[]) => {
    return callbackRef.current(...args);
  }, []) as T;
}

// Utility to prevent unnecessary object creation
export function useStableValue<T>(value: T, compare?: (a: T, b: T) => boolean): T {
  const ref = useRef<T>(value);
  
  const isEqual = compare ? compare(ref.current, value) : Object.is(ref.current, value);
  
  if (!isEqual) {
    ref.current = value;
  }
  
  return ref.current;
}

// Bundle size analyzer (development only)
export const analyzeBundleSize = () => {
  if (process.env.NODE_ENV !== 'development') return;
  
  const moduleCount = Object.keys((require as any).cache || {}).length;
  const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;
  
  console.group('📦 Bundle Analysis');
  console.log(`Modules loaded: ${moduleCount}`);
  console.log(`Memory usage: ${(memoryUsage / 1024 / 1024).toFixed(2)}MB`);
  console.groupEnd();
};

// Export performance constants
export const PERFORMANCE_THRESHOLDS = {
  SLOW_RENDER_MS: 16, // 60fps
  VERY_SLOW_RENDER_MS: 33, // 30fps
  MEMORY_WARNING_MB: 100,
  MEMORY_CRITICAL_MB: 200,
} as const;
