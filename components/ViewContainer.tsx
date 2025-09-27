"use client";

import React, { useEffect, useRef, useState } from "react";

interface ViewContainerProps {
  viewMode: string;
  children: React.ReactElement;
  viewKey: string;
  onViewMount?: () => void;
  onViewUnmount?: () => void;
}

// Performance-optimized view container that persists components
export default function ViewContainer({ 
  viewMode, 
  children, 
  viewKey,
  onViewMount,
  onViewUnmount
}: ViewContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  
  const isVisible = viewMode === viewKey;
  
  // Initialize view on first render
  useEffect(() => {
    if (isVisible && !isInitialized) {
      setIsInitialized(true);
      onViewMount?.();
    }
  }, [isVisible, isInitialized, onViewMount]);

  // Handle view visibility changes
  useEffect(() => {
    if (!isInitialized) return;
    
    const container = containerRef.current;
    if (!container) return;

    if (isVisible) {
      // Show view with smooth transition
      container.style.display = 'block';
      container.style.opacity = '0';
      container.style.transform = 'translateY(10px)';
      
      // Smooth fade-in animation
      requestAnimationFrame(() => {
        container.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
      });
      
      // Notify view is now visible
      onViewMount?.();
      
    } else {
      // Hide view but keep in DOM
      container.style.transition = 'opacity 0.15s ease';
      container.style.opacity = '0';
      
      setTimeout(() => {
        if (!isVisible) { // Double-check visibility didn't change
          container.style.display = 'none';
          onViewUnmount?.();
        }
      }, 150);
    }
  }, [isVisible, isInitialized, onViewMount, onViewUnmount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  // Don't render until needed (lazy initialization)
  if (!isInitialized) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        display: isVisible ? 'block' : 'none',
        zIndex: isVisible ? 1 : 0
      }}
      data-view={viewKey}
    >
      {children}
    </div>
  );
}

// Higher-order component for view persistence
export function withViewPersistence<T extends object>(
  Component: React.ComponentType<T>,
  viewKey: string
) {
  return React.memo(function PersistentView(props: T & { viewMode: string }) {
    const { viewMode, ...otherProps } = props;
    
    return (
      <ViewContainer 
        viewMode={viewMode} 
        viewKey={viewKey}
        onViewMount={() => console.log(`🔄 View ${viewKey} activated`)}
        onViewUnmount={() => console.log(`💤 View ${viewKey} deactivated`)}
      >
        <Component {...(otherProps as T)} />
      </ViewContainer>
    );
  });
}

// Multi-view container for managing multiple persistent views
interface MultiViewContainerProps {
  activeView: string;
  views: Array<{
    key: string;
    component: React.ReactElement;
  }>;
  className?: string;
}

export function MultiViewContainer({ activeView, views, className = "" }: MultiViewContainerProps) {
  return (
    <div 
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ contain: 'layout style' }} // CSS containment for performance
    >
      {views.map(({ key, component }) => (
        <ViewContainer
          key={key}
          viewMode={activeView}
          viewKey={key}
          onViewMount={() => console.log(`🔄 Multi-view ${key} activated`)}
          onViewUnmount={() => console.log(`💤 Multi-view ${key} deactivated`)}
        >
          {component}
        </ViewContainer>
      ))}
    </div>
  );
}
