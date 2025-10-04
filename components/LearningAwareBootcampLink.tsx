/**
 * Learning-Aware DAT Bootcamp Link Component
 * Automatically starts learning session tracking when clicked
 * Enables AI knowledge absorption on return from DAT Bootcamp
 */

import React from 'react';
import { startLearningTracking } from '@/lib/learningIntegrationService';
import { generateBootcampReturnUrl } from '@/lib/protocolHandler';

interface LearningAwareBootcampLinkProps {
  section: string; // DAT section like 'organic-chemistry', 'pat', 'biology', etc.
  topic?: string; // Specific topic like 'CARDIO Method', 'Spatial Reasoning'
  resourceId?: string; // Specific resource identifier
  href?: string; // Optional custom path, defaults to main DAT Bootcamp
  children: React.ReactNode;
  className?: string;
  style?: 'button' | 'link'; // Visual style
}

export const LearningAwareBootcampLink: React.FC<LearningAwareBootcampLinkProps> = ({
  section,
  topic,
  resourceId,
  href,
  children,
  className = '',
  style = 'button'
}) => {
  // User's DAT Bootcamp account URL
  const BOOTCAMP_BASE_URL = 'https://app.bootcamp.com/dat';
  
  const handleBootcampClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    try {
      // Start learning session tracking
      const sessionId = startLearningTracking('datbootcamp', section, {
        topic,
        resourceId,
        userId: 'current-user'
      });
      
      console.log(`🎓 Started learning session: ${sessionId} for ${section}${topic ? ` - ${topic}` : ''}`);
      
      // Generate return URL for protocol handler
      const returnUrl = generateBootcampReturnUrl(section, resourceId || section);
      
      // Determine target URL
      const targetUrl = href || BOOTCAMP_BASE_URL;
      
      // Store session context for potential return
      localStorage.setItem('active_bootcamp_session', JSON.stringify({
        sessionId,
        section,
        topic,
        resourceId,
        startTime: Date.now(),
        returnUrl
      }));
      
      // Create enhanced URL with return parameters
      const enhancedUrl = new URL(targetUrl);
      enhancedUrl.searchParams.set('return_url', encodeURIComponent(returnUrl));
      enhancedUrl.searchParams.set('section', section);
      if (topic) enhancedUrl.searchParams.set('topic', topic);
      
      // Show learning notification
      showLearningNotification(`Starting ${section.toUpperCase()} learning session...`, 'info');
      
      // Navigate to DAT Bootcamp
      window.open(enhancedUrl.toString(), '_blank', 'noopener,noreferrer');
      
    } catch (error) {
      console.error('Failed to start learning session:', error);
      showLearningNotification('Failed to start learning session. Opening DAT Bootcamp normally.', 'warning');
      
      // Fallback to normal navigation
      const fallbackUrl = href || BOOTCAMP_BASE_URL;
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  // Default button styles
  const defaultButtonClass = "inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-medium transition-all transform hover:scale-105 cursor-pointer";
  
  // Default link styles  
  const defaultLinkClass = "text-orange-200 hover:text-orange-100 transition-colors cursor-pointer";
  
  const finalClassName = className || (style === 'button' ? defaultButtonClass : defaultLinkClass);
  
  return (
    <div 
      onClick={handleBootcampClick}
      className={finalClassName}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleBootcampClick(e as any);
        }
      }}
    >
      {children}
    </div>
  );
};

// Notification helper function
function showLearningNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm transition-all ${
    type === 'success' ? 'bg-green-600 text-white' :
    type === 'warning' ? 'bg-yellow-600 text-white' :
    type === 'error' ? 'bg-red-600 text-white' :
    'bg-blue-600 text-white'
  }`;
  
  // Add icon based on type
  const icons = {
    info: '🎓',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };
  
  notification.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-lg">${icons[type]}</span>
      <div>
        <p class="font-medium">Learning Session</p>
        <p class="text-sm opacity-90">${message}</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 4 seconds with fade out
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Enhanced Bootcamp Link with Learning Context
export const EnhancedBootcampLink: React.FC<{
  section: string;
  category: string;
  className?: string;
  children: React.ReactNode;
}> = ({ section, category, className, children }) => {
  
  // Map sections to specific DAT Bootcamp paths
  const sectionPaths = {
    'organic-chemistry': '/organic-chemistry',
    'general-chemistry': '/general-chemistry', 
    'biology': '/biology',
    'pat': '/perceptual-ability-test',
    'reading-comprehension': '/reading-comprehension',
    'quantitative-reasoning': '/quantitative-reasoning'
  };
  
  const specificPath = sectionPaths[section as keyof typeof sectionPaths];
  const href = specificPath ? `https://app.bootcamp.com/dat${specificPath}` : undefined;
  
  return (
    <LearningAwareBootcampLink
      section={section}
      topic={category}
      href={href}
      className={className}
    >
      {children}
    </LearningAwareBootcampLink>
  );
};

// Quick Bootcamp Link for Practice Exams
export const BootcampPracticeLink: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => {
  return (
    <LearningAwareBootcampLink
      section="practice-exams"
      topic="Full Practice Tests"
      href="https://app.bootcamp.com/dat/practice-tests"
      className={className}
    >
      {children}
    </LearningAwareBootcampLink>
  );
};

export default LearningAwareBootcampLink;
