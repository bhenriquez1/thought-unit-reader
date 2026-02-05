// lib/stores/zoomStore.ts
// Global Zoom Store - Shared zoom level across Reader and Surgeon View
// Uses Zustand with localStorage persistence

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ZoomState {
  zoom: number;
  minZoom: number;
  maxZoom: number;
  step: number;
  
  // Actions
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  
  // Getters
  getZoomPercent: () => number;
  canZoomIn: () => boolean;
  canZoomOut: () => boolean;
}

export const useZoomStore = create<ZoomState>()(
  persist(
    (set, get) => ({
      zoom: 1.25,
      minZoom: 0.5,
      maxZoom: 3.0,
      step: 0.25,
      
      setZoom: (zoom: number) => {
        const { minZoom, maxZoom } = get();
        const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
        set({ zoom: clampedZoom });
      },
      
      zoomIn: () => {
        const { zoom, maxZoom, step } = get();
        const newZoom = Math.min(zoom + step, maxZoom);
        set({ zoom: newZoom });
      },
      
      zoomOut: () => {
        const { zoom, minZoom, step } = get();
        const newZoom = Math.max(zoom - step, minZoom);
        set({ zoom: newZoom });
      },
      
      resetZoom: () => {
        set({ zoom: 1.25 });
      },
      
      getZoomPercent: () => {
        return Math.round(get().zoom * 100);
      },
      
      canZoomIn: () => {
        const { zoom, maxZoom } = get();
        return zoom < maxZoom;
      },
      
      canZoomOut: () => {
        const { zoom, minZoom } = get();
        return zoom > minZoom;
      }
    }),
    {
      name: 'zoom-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({ zoom: state.zoom }),
      skipHydration: typeof window === 'undefined',
    }
  )
);
