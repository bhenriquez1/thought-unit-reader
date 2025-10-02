// components/performance/PerformanceDashboard.tsx
/**
 * Performance Monitoring Dashboard
 * Addresses: Real-time monitoring, Memory tracking, Performance metrics visualization
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { performanceProfiler, usePerformanceSession, PerformanceReport, enablePerformanceOverlay } from '@/lib/performance/PerformanceProfiler';
import { optimizedPDFHandler } from '@/lib/performance/OptimizedPDFHandler';
import { optimizedHighlightEngine } from '@/lib/performance/OptimizedHighlightEngine';
import { LightModeToggle, useLightMode, PerformanceWarning } from './LightModeToggle';

interface PerformanceDashboardProps {
  view: 'hybrid' | 'pattern' | 'notelab';
  documentSize: number;
  className?: string;
  minimized?: boolean;
}

interface PerformanceMetrics {
  timestamp: number;
  memory: number;
  fps: number;
  renderTime: number;
  highlightTime: number;
  pdfCached: number;
  highlightCached: number;
  jsHeapSize: number;
  domNodes: number;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = React.memo(({
  view,
  documentSize,
  className = '',
  minimized = false,
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!minimized);
  const [autoOptimize, setAutoOptimize] = useState(true);
  
  const { sessionId, report, exportData } = usePerformanceSession(view, documentSize);
  const lightMode = useLightMode(documentSize);

  // Collect performance metrics
  const collectMetrics = useCallback(() => {
    const memory = (performance as any).memory;
    const pdfStats = optimizedPDFHandler.getMemoryStats();
    const highlightStats = optimizedHighlightEngine.getCacheStats();

    const metric: PerformanceMetrics = {
      timestamp: Date.now(),
      memory: memory?.usedJSHeapSize || 0,
      fps: 60, // Would be updated by actual FPS counter
      renderTime: 0, // Would be updated by render monitoring
      highlightTime: 0, // Would be updated by highlight engine
      pdfCached: pdfStats.pagesCached || 0,
      highlightCached: highlightStats.cacheSize || 0,
      jsHeapSize: memory?.totalJSHeapSize || 0,
      domNodes: document.querySelectorAll('*').length,
    };

    setMetrics(prev => {
      const newMetrics = [...prev, metric];
      // Keep last 60 data points (1 minute if collecting every second)
      return newMetrics.slice(-60);
    });

    // Auto-optimization checks
    if (autoOptimize && !lightMode.enabled) {
      const memoryMB = metric.memory / 1024 / 1024;
      const isSlowDevice = navigator.hardwareConcurrency < 4;
      
      if (memoryMB > 150 || isSlowDevice || documentSize > 20 * 1024 * 1024) {
        setShowWarning(true);
      }
    }
  }, [autoOptimize, lightMode.enabled, documentSize]);

  // Collect metrics every second
  useEffect(() => {
    collectMetrics();
    const interval = setInterval(collectMetrics, 1000);
    return () => clearInterval(interval);
  }, [collectMetrics]);

  // Initialize performance overlay in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      enablePerformanceOverlay();
    }
  }, []);

  const currentMetric = metrics[metrics.length - 1];
  const memoryTrend = useMemo(() => {
    if (metrics.length < 2) return 'stable';
    const recent = metrics.slice(-5);
    const avgRecent = recent.reduce((sum, m) => sum + m.memory, 0) / recent.length;
    const older = metrics.slice(-15, -5);
    if (older.length === 0) return 'stable';
    const avgOlder = older.reduce((sum, m) => sum + m.memory, 0) / older.length;
    
    const change = (avgRecent - avgOlder) / avgOlder;
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }, [metrics]);

  const handleExportPerformanceData = useCallback(() => {
    const data = {
      session: sessionId,
      report,
      metrics,
      lightModeState: lightMode,
      exportTime: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-data-${view}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId, report, metrics, lightMode, view]);

  const handleOptimizeNow = useCallback(() => {
    // Run optimizations manually
    optimizedPDFHandler.dispose();
    optimizedHighlightEngine.reset();
    
    // Force garbage collection if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
    
    console.log('🚀 Manual optimization completed');
  }, []);

  if (!isExpanded) {
    return (
      <div className={`fixed bottom-4 left-4 z-50 ${className}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(true)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-700"
          >
            📊 Performance
          </button>
          <LightModeToggle documentSize={documentSize} />
        </div>
        
        <PerformanceWarning
          show={showWarning && !lightMode.enabled}
          onEnableLightMode={() => lightMode.enableLightMode('Performance warning')}
          onDismiss={() => setShowWarning(false)}
          metrics={currentMetric ? {
            memoryUsage: currentMetric.memory,
            fps: currentMetric.fps,
            renderTime: currentMetric.renderTime,
            isSlowDevice: navigator.hardwareConcurrency < 4,
          } : undefined}
        />
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 left-4 max-w-lg bg-white border border-gray-200 rounded-lg shadow-lg z-50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="font-semibold text-gray-800">Performance Monitor</h3>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {view.toUpperCase()}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ➖
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      {currentMetric && (
        <div className="p-3 border-b border-gray-100">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">Memory Usage</div>
              <div className="font-semibold">
                {(currentMetric.memory / 1024 / 1024).toFixed(1)}MB
              </div>
              <div className={`text-xs ${
                memoryTrend === 'increasing' ? 'text-red-500' :
                memoryTrend === 'decreasing' ? 'text-green-500' :
                'text-gray-500'
              }`}>
                {memoryTrend === 'increasing' && '📈 Growing'}
                {memoryTrend === 'decreasing' && '📉 Shrinking'}
                {memoryTrend === 'stable' && '➡️ Stable'}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">DOM Nodes</div>
              <div className="font-semibold">{currentMetric.domNodes.toLocaleString()}</div>
              <div className="text-xs text-gray-500">
                {currentMetric.domNodes > 5000 ? '⚠️ High' : '✅ Normal'}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">PDF Cache</div>
              <div className="font-semibold">{currentMetric.pdfCached} pages</div>
              <div className="text-xs text-gray-500">Cached</div>
            </div>
            
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">Highlight Cache</div>
              <div className="font-semibold">{currentMetric.highlightCached}</div>
              <div className="text-xs text-gray-500">Items</div>
            </div>
          </div>
        </div>
      )}

      {/* Memory Chart */}
      {metrics.length > 1 && (
        <div className="p-3 border-b border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Memory Usage (MB) - Last 60s</div>
          <div className="h-20 flex items-end gap-1">
            {metrics.slice(-30).map((metric, index) => {
              const memoryMB = metric.memory / 1024 / 1024;
              const maxMemory = Math.max(...metrics.map(m => m.memory / 1024 / 1024));
              const height = maxMemory > 0 ? (memoryMB / maxMemory) * 80 : 0;
              
              return (
                <div
                  key={index}
                  className={`flex-1 rounded-t ${
                    memoryMB > 200 ? 'bg-red-400' :
                    memoryMB > 100 ? 'bg-yellow-400' :
                    'bg-green-400'
                  }`}
                  style={{ height: `${height}%` }}
                  title={`${memoryMB.toFixed(1)}MB`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="p-3">
        <div className="space-y-2">
          <LightModeToggle 
            documentSize={documentSize}
            showMetrics={true}
            className="w-full"
          />
          
          <div className="flex gap-2">
            <button
              onClick={handleOptimizeNow}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
            >
              🚀 Optimize Now
            </button>
            
            <button
              onClick={handleExportPerformanceData}
              className="flex-1 px-3 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-500"
            >
              📊 Export Data
            </button>
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoOptimize}
              onChange={(e) => setAutoOptimize(e.target.checked)}
              className="rounded"
            />
            <span>Auto-optimize performance</span>
          </label>
        </div>
      </div>

      {/* Performance Report */}
      {report && (
        <div className="p-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Session Report</div>
          <div className="space-y-1 text-xs">
            <div>Duration: {(report.duration / 1000).toFixed(1)}s</div>
            <div>Peak Memory: {(report.memory.peak / 1024 / 1024).toFixed(1)}MB</div>
            <div>Avg FPS: {report.fps.average.toFixed(1)}</div>
            {report.recommendations.length > 0 && (
              <div className="mt-2">
                <div className="text-orange-600 font-medium">Recommendations:</div>
                <ul className="list-disc list-inside space-y-1 text-orange-700">
                  {report.recommendations.slice(0, 2).map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning */}
      <PerformanceWarning
        show={showWarning && !lightMode.enabled}
        onEnableLightMode={() => {
          lightMode.enableLightMode('Performance warning');
          setShowWarning(false);
        }}
        onDismiss={() => setShowWarning(false)}
        metrics={currentMetric ? {
          memoryUsage: currentMetric.memory,
          fps: currentMetric.fps,
          renderTime: currentMetric.renderTime,
          isSlowDevice: navigator.hardwareConcurrency < 4,
        } : undefined}
      />
    </div>
  );
});

// Performance Statistics Component
interface PerformanceStatsProps {
  metrics: PerformanceMetrics[];
  className?: string;
}

export const PerformanceStats: React.FC<PerformanceStatsProps> = React.memo(({
  metrics,
  className = '',
}) => {
  const stats = useMemo(() => {
    if (metrics.length === 0) return null;

    const memoryValues = metrics.map(m => m.memory / 1024 / 1024);
    const avgMemory = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length;
    const peakMemory = Math.max(...memoryValues);
    const minMemory = Math.min(...memoryValues);

    return {
      avgMemory: avgMemory.toFixed(1),
      peakMemory: peakMemory.toFixed(1),
      minMemory: minMemory.toFixed(1),
      memoryGrowth: ((peakMemory - minMemory) / minMemory * 100).toFixed(1),
      dataPoints: metrics.length,
    };
  }, [metrics]);

  if (!stats) return null;

  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
      <h4 className="font-medium text-gray-800 mb-3">Performance Statistics</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Average Memory</div>
          <div className="font-semibold text-blue-600">{stats.avgMemory}MB</div>
        </div>
        <div>
          <div className="text-gray-500">Peak Memory</div>
          <div className="font-semibold text-red-600">{stats.peakMemory}MB</div>
        </div>
        <div>
          <div className="text-gray-500">Memory Growth</div>
          <div className={`font-semibold ${
            parseFloat(stats.memoryGrowth) > 50 ? 'text-red-600' : 'text-green-600'
          }`}>
            {stats.memoryGrowth}%
          </div>
        </div>
        <div>
          <div className="text-gray-500">Data Points</div>
          <div className="font-semibold text-gray-800">{stats.dataPoints}</div>
        </div>
      </div>
    </div>
  );
});

export default PerformanceDashboard;
