/**
 * Custom Protocol Handler for thought-unit-reader://
 * Enables deep linking from DAT Bootcamp and other external resources
 */

export interface ProtocolParams {
  action?: 'return' | 'navigate' | 'sync';
  section?: 'qr' | 'pat' | 'biology' | 'chemistry' | 'reading';
  page?: string;
  pattern?: string;
  resource?: string;
  timestamp?: string;
  progress?: string;
}

export interface BootcampReturnData {
  source: 'datbootcamp';
  userId?: string;
  section: string;
  resourceId: string;
  timeSpent: number;
  completed: boolean;
  score?: number;
  patterns?: string[];
  timestamp: string;
}

class ProtocolHandler {
  private isRegistered = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private async initialize() {
    try {
      // Register protocol handler if supported
      if ('registerProtocolHandler' in navigator) {
        const baseUrl = window.location.origin;
        navigator.registerProtocolHandler(
          'thought-unit-reader',
          `${baseUrl}/protocol-handler?url=%s`
        );
        this.isRegistered = true;
        console.log('✅ Custom protocol registered: thought-unit-reader://');
      }

      // Listen for protocol URLs
      this.setupProtocolListener();
    } catch (error) {
      console.warn('⚠️ Protocol handler registration failed:', error);
    }
  }

  private setupProtocolListener() {
    // Handle direct protocol URLs in current page
    if (window.location.protocol === 'thought-unit-reader:') {
      this.handleProtocolUrl(window.location.href);
    }

    // Listen for postMessage from protocol handler page
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'PROTOCOL_URL') {
        this.handleProtocolUrl(event.data.url);
      }
    });

    // Listen for URL changes (for SPA navigation)
    window.addEventListener('popstate', () => {
      const url = new URL(window.location.href);
      if (url.searchParams.has('protocol_return')) {
        this.handleProtocolUrl(url.href);
      }
    });
  }

  private handleProtocolUrl(url: string) {
    try {
      const protocolUrl = new URL(url);
      const params = this.parseProtocolParams(protocolUrl);
      
      console.log('🔗 Protocol URL received:', url, params);

      switch (params.action) {
        case 'return':
          this.handleBootcampReturn(params);
          break;
        case 'navigate':
          this.handleNavigation(params);
          break;
        case 'sync':
          this.handleDataSync(params);
          break;
        default:
          this.handleDefault(params);
      }
    } catch (error) {
      console.error('❌ Failed to parse protocol URL:', error);
    }
  }

  private parseProtocolParams(url: URL): ProtocolParams {
    const params: ProtocolParams = {};
    
    // Parse path segments
    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      params.action = pathSegments[0] as ProtocolParams['action'];
    }

    // Parse query parameters
    url.searchParams.forEach((value, key) => {
      (params as any)[key] = value;
    });

    return params;
  }

  private async handleBootcampReturn(params: ProtocolParams) {
    try {
      // Extract return data from URL parameters
      const returnData: BootcampReturnData = {
        source: 'datbootcamp',
        section: params.section || 'unknown',
        resourceId: params.resource || 'unknown',
        timeSpent: parseInt(params.timestamp || '0'),
        completed: params.progress === 'completed',
        timestamp: new Date().toISOString(),
        patterns: params.pattern ? [params.pattern] : []
      };

      if (params.page) {
        returnData.score = parseFloat(params.page);
      }

      // Store learning data
      await this.storeLearningProgress(returnData);

      // Navigate to appropriate section
      const targetPath = this.buildTargetPath(params);
      window.location.href = targetPath;

      // Show success notification
      this.showNotification(
        `Welcome back from DAT Bootcamp! Progress saved for ${params.section?.toUpperCase() || 'section'}.`,
        'success'
      );
    } catch (error) {
      console.error('❌ Failed to handle Bootcamp return:', error);
      this.showNotification('Failed to sync progress from DAT Bootcamp.', 'error');
    }
  }

  private async handleNavigation(params: ProtocolParams) {
    const targetPath = this.buildTargetPath(params);
    window.location.href = targetPath;
  }

  private async handleDataSync(params: ProtocolParams) {
    // Handle learning data synchronization
    try {
      await import('@/lib/aiLearningEngine').then(({ aiLearningEngine }) => {
        // Trigger AI learning update based on external data
        console.log('🧠 Syncing external learning data:', params);
      });
    } catch (error) {
      console.error('❌ Failed to sync learning data:', error);
    }
  }

  private handleDefault(params: ProtocolParams) {
    // Default action - navigate to APEX hub
    window.location.href = '/apex' + (params.section ? `?section=${params.section}` : '');
  }

  private buildTargetPath(params: ProtocolParams): string {
    let path = '/apex';

    if (params.section) {
      if (params.section === 'qr') {
        path += '/patterns?category=pat&highlight=qr';
      } else if (params.pattern) {
        path += `/patterns/${params.pattern}`;
      } else {
        path += `?section=${params.section}`;
      }
    }

    return path;
  }

  private async storeLearningProgress(data: BootcampReturnData) {
    try {
      // Store in localStorage for immediate access
      const storageKey = 'bootcamp_progress';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existing.push(data);
      
      // Keep only last 50 entries
      if (existing.length > 50) {
        existing.splice(0, existing.length - 50);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(existing));

      // Try to sync with Firebase if available
      try {
        const firebase = await import('@/lib/firebase');
        if (firebase.saveBootcampProgress) {
          await firebase.saveBootcampProgress('current-user', data);
        }
      } catch (error) {
        console.warn('Firebase sync not available:', error);
      }
    } catch (error) {
      console.warn('⚠️ Failed to store learning progress:', error);
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm ${
      type === 'success' ? 'bg-green-600 text-white' :
      type === 'error' ? 'bg-red-600 text-white' :
      'bg-blue-600 text-white'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  // Public API methods
  public generateReturnUrl(section: string, options: Partial<ProtocolParams> = {}): string {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams({
      action: 'return',
      section,
      timestamp: Date.now().toString(),
      ...options
    });
    
    return `thought-unit-reader://return?${params.toString()}`;
  }

  public isProtocolSupported(): boolean {
    return 'registerProtocolHandler' in navigator;
  }

  public getRegistrationStatus(): boolean {
    return this.isRegistered;
  }
}

// Export singleton instance
export const protocolHandler = new ProtocolHandler();

// Export utility functions
export const generateBootcampReturnUrl = (section: string, resourceId: string): string => {
  return protocolHandler.generateReturnUrl(section, { resource: resourceId });
};

export const isProtocolSupported = (): boolean => {
  return protocolHandler.isProtocolSupported();
};
