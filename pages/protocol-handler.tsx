/**
 * Enhanced Protocol Handler Page for thought-unit-reader:// URLs
 * This page receives protocol URLs, processes AI learning absorption, 
 * and forwards enriched data to the main application
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { learningIntegrationService, endLearningTracking, type ExternalLearningSession } from '@/lib/learningIntegrationService';
import { aiLearningEngine } from '@/lib/aiLearningEngine';

interface ProcessingState {
  stage: 'initializing' | 'analyzing' | 'absorbing' | 'completing' | 'done';
  message: string;
  insights: string[];
  error?: string;
}

interface ActiveSessionData {
  sessionId: string;
  section: string;
  topic?: string;
  resourceId?: string;
  startTime: number;
  returnUrl: string;
}

interface LearningDataExtract {
  section: string;
  topic?: string;
  resourceId?: string;
  completed: boolean;
  score?: number;
  progress?: number;
  duration: number;
  sessionId?: string;
  interactions: Array<{
    type: 'practice' | 'mastery' | 'mistake' | 'review';
    timestamp: string;
    data: any;
  }>;
}

export default function ProtocolHandlerPage() {
  const router = useRouter();
  const [processing, setProcessing] = useState<ProcessingState>({
    stage: 'initializing',
    message: 'Processing DAT Bootcamp return...',
    insights: []
  });

  useEffect(() => {
    const urlParam = router.query.url as string;
    
    if (urlParam) {
      processProtocolReturn(urlParam);
    } else {
      // No URL parameter, redirect to APEX hub
      router.replace('/apex');
    }
  }, [router]);

  const processProtocolReturn = async (urlParam: string) => {
    try {
      // Decode the protocol URL
      const protocolUrl = decodeURIComponent(urlParam);
      const url = new URL(protocolUrl);
      const params = Object.fromEntries(url.searchParams);
      
      console.log('🔗 Processing protocol return:', protocolUrl, params);
      
      // Stage 1: Initialize processing
      setProcessing({
        stage: 'initializing',
        message: 'Connecting to AI learning engine...',
        insights: []
      });

      // Stage 2: Analyze the return data
      setProcessing(prev => ({
        ...prev,
        stage: 'analyzing',
        message: `Analyzing ${params.section || 'DAT'} learning session...`
      }));

      // Retrieve active bootcamp session
      const activeSession = localStorage.getItem('active_bootcamp_session');
      let sessionData: ActiveSessionData | null = null;
      
      if (activeSession) {
        try {
          sessionData = JSON.parse(activeSession) as ActiveSessionData;
          console.log('📊 Found active session:', sessionData);
        } catch (error) {
          console.warn('Failed to parse active session:', error);
        }
      }

      // Calculate session duration and extract learning data
      const sessionDuration = sessionData ? 
        Math.round((Date.now() - sessionData.startTime) / 1000 / 60) : // minutes
        parseInt(params.timestamp) || 0;

      const learningData: LearningDataExtract = {
        section: params.section || sessionData?.section || 'unknown',
        topic: params.topic || sessionData?.topic,
        resourceId: params.resource || sessionData?.resourceId,
        completed: params.progress === 'completed',
        score: params.score ? parseInt(params.score) : undefined,
        progress: params.progress === 'completed' ? 100 : 
                 params.progress === 'partial' ? 50 : undefined,
        duration: sessionDuration,
        sessionId: sessionData?.sessionId,
        interactions: generateInteractionsFromReturn(params, sessionDuration)
      };

      console.log('🎓 Extracted learning data:', learningData);

      // Stage 3: AI Knowledge Absorption
      setProcessing(prev => ({
        ...prev,
        stage: 'absorbing',
        message: 'AI is absorbing your learning insights...'
      }));

      // Process with learning integration service
      let completedSession: ExternalLearningSession | null = null;
      if (sessionData?.sessionId && learningIntegrationService.getCurrentSession()) {
        completedSession = await endLearningTracking(
          learningData.completed,
          learningData.score,
          learningData.progress
        );
      } else {
        // Handle external session data
        completedSession = await learningIntegrationService.handleExternalLearningData(learningData);
      }

      // Generate AI insights using the AI learning engine
      const aiInsights = await generateAIInsights(learningData, completedSession);
      
      // Clean up active session
      localStorage.removeItem('active_bootcamp_session');

      // Stage 4: Completing
      setProcessing({
        stage: 'completing',
        message: 'Finalizing learning integration...',
        insights: aiInsights
      });

      // Add brief delay to show insights
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Stage 5: Forward to application
      setProcessing(prev => ({
        ...prev,
        stage: 'done',
        message: 'Learning successfully absorbed! Redirecting...'
      }));

      // Prepare enriched data for the main application
      const enrichedData = {
        type: 'PROTOCOL_URL_ENHANCED',
        url: protocolUrl,
        params,
        learningData,
        aiInsights,
        completedSession,
        timestamp: Date.now()
      };

      // Forward to main application
      if (window.opener) {
        window.opener.postMessage(enrichedData, window.location.origin);
        
        // Brief delay to show completion, then close
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        // Store enriched data for the APEX page to pick up
        localStorage.setItem('protocol_return_data', JSON.stringify(enrichedData));
        
        // Redirect to APEX Patterns page with success parameters for immediate pattern application
        const redirectParams = new URLSearchParams();
        redirectParams.set('protocol_return', 'true');
        redirectParams.set('section', learningData.section);
        redirectParams.set('ai_insights', 'true');
        redirectParams.set('bootcamp_session', 'true');
        if (learningData.score) redirectParams.set('score', learningData.score.toString());
        if (learningData.duration) redirectParams.set('duration', learningData.duration.toString());
        if (learningData.progress) redirectParams.set('progress', learningData.progress.toString());
        
        // Map DAT sections to pattern categories for focused learning
        const sectionToCategory = {
          'organic-chemistry': 'organic-chemistry',
          'general-chemistry': 'general-chemistry', 
          'biology': 'biology',
          'pat': 'pat',
          'reading-comprehension': 'reading-comprehension',
          'quantitative-reasoning': 'pat' // QR patterns often overlap with PAT logical reasoning
        };
        
        const patternCategory = sectionToCategory[learningData.section as keyof typeof sectionToCategory] || 'organic-chemistry';
        redirectParams.set('category', patternCategory);
        redirectParams.set('focus_mode', 'true');
        
        setTimeout(() => {
          router.replace(`/apex/patterns?${redirectParams.toString()}`);
        }, 1500);
      }

    } catch (error) {
      console.error('❌ Failed to process protocol return:', error);
      
      setProcessing({
        stage: 'done',
        message: 'Error processing return. Redirecting to APEX...',
        insights: [],
        error: error.message
      });
      
      // Fallback redirect after error
      setTimeout(() => {
        router.replace('/apex');
      }, 2000);
    }
  };

  // Generate interaction data from return parameters
  const generateInteractionsFromReturn = (params: any, duration: number): Array<{
    type: 'practice' | 'mastery' | 'mistake' | 'review';
    timestamp: string;
    data: any;
  }> => {
    const interactions: Array<{
      type: 'practice' | 'mastery' | 'mistake' | 'review';
      timestamp: string;
      data: any;
    }> = [];
    const now = new Date().toISOString();
    
    // Add practice interaction based on duration
    interactions.push({
      type: 'practice' as const,
      timestamp: now,
      data: { duration, section: params.section }
    });

    // Add outcome-based interactions
    if (params.score) {
      const score = parseInt(params.score);
      if (score >= 90) {
        interactions.push({
          type: 'mastery' as const,
          timestamp: now,
          data: { score }
        });
      } else if (score < 70) {
        interactions.push({
          type: 'mistake' as const,
          timestamp: now,
          data: { score, needsReview: true }
        });
      }
    }

    // Add review interaction if partial completion
    if (params.progress === 'partial') {
      interactions.push({
        type: 'review' as const,
        timestamp: now,
        data: { incomplete: true }
      });
    }

    return interactions;
  };

  // Generate AI insights based on learning data
  const generateAIInsights = async (learningData: LearningDataExtract, session: ExternalLearningSession | null): Promise<string[]> => {
    const insights: string[] = [];
    
    try {
      // Duration-based insights
      if (learningData.duration > 60) {
        insights.push(`🎯 Excellent focus! ${learningData.duration} minutes of dedicated study in ${learningData.section.toUpperCase()}`);
      } else if (learningData.duration < 15) {
        insights.push(`⚡ Quick session completed. Consider longer study sessions for deeper retention in ${learningData.section.toUpperCase()}`);
      }

      // Score-based insights
      if (learningData.score) {
        if (learningData.score >= 90) {
          insights.push(`🏆 Outstanding performance! ${learningData.score}% mastery suggests you're ready for advanced ${learningData.section.toUpperCase()} concepts`);
        } else if (learningData.score < 70) {
          insights.push(`📚 Focus area identified: ${learningData.section.toUpperCase()} needs more attention. Recommend TU analysis of weak concepts`);
        } else {
          insights.push(`📈 Solid progress in ${learningData.section.toUpperCase()}! Continue building on this ${learningData.score}% foundation`);
        }
      }

      // Section-specific insights
      if (learningData.section === 'organic-chemistry') {
        insights.push(`⚗️ Consider using CARDIO method patterns for better OC retention and mechanism understanding`);
      } else if (learningData.section === 'pat') {
        insights.push(`👁️ PAT spatial skills developing! Practice with TU visual pattern recognition for enhanced performance`);
      } else if (learningData.section === 'biology') {
        insights.push(`🧬 Biology concepts absorbed! Connect with Thought Unit hierarchical analysis for deeper comprehension`);
      } else if (learningData.section === 'quantitative-reasoning') {
        insights.push(`🔢 QR problem-solving improved! Apply TU logical frameworks to complex calculations`);
      }

      // Cross-platform learning insight
      insights.push(`🔄 Learning integrated: DAT Bootcamp + Thought Unit Reader = Enhanced comprehension and retention`);

      // Use AI learning engine for additional insights if available
      if (session && typeof aiLearningEngine.predictOptimalSettings === 'function') {
        try {
          const optimalSettings = aiLearningEngine.predictOptimalSettings(
            'current-user',
            `${learningData.section} study session`,
            'dat-bootcamp'
          );
          
          if (optimalSettings.focusMode.length > 0) {
            insights.push(`🎯 AI recommends focusing on: ${optimalSettings.focusMode.slice(0, 3).join(', ')} based on your learning patterns`);
          }
        } catch (error) {
          console.warn('AI engine prediction failed:', error);
        }
      }

    } catch (error) {
      console.warn('Failed to generate some AI insights:', error);
      insights.push('🧠 AI learning analysis completed. Continue your excellent progress!');
    }

    return insights;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="bg-black/30 backdrop-blur-sm rounded-xl p-8 border border-blue-500/20">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">
              {processing.stage === 'initializing' ? '🔄' :
               processing.stage === 'analyzing' ? '🔍' :
               processing.stage === 'absorbing' ? '🧠' :
               processing.stage === 'completing' ? '⚡' : '✅'}
            </div>
            <h1 className="text-xl font-bold text-white mb-2">DAT Learning Integration</h1>
            <p className="text-blue-200 text-sm">{processing.message}</p>
          </div>

          {/* Loading Animation */}
          <div className="flex justify-center mb-6">
            <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${
              processing.stage === 'done' ? 'border-green-400' : 'border-blue-400'
            }`}></div>
          </div>

          {/* Processing Steps */}
          <div className="space-y-2 mb-6">
            {[
              { key: 'initializing', label: 'Connecting to AI engine' },
              { key: 'analyzing', label: 'Analyzing learning session' },
              { key: 'absorbing', label: 'Absorbing knowledge insights' },
              { key: 'completing', label: 'Finalizing integration' },
              { key: 'done', label: 'Complete!' }
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  processing.stage === key ? 'bg-blue-400 animate-pulse' :
                  ['initializing', 'analyzing', 'absorbing', 'completing', 'done'].indexOf(processing.stage) >
                  ['initializing', 'analyzing', 'absorbing', 'completing', 'done'].indexOf(key) ? 'bg-green-400' :
                  'bg-gray-500'
                }`}></div>
                <span className={
                  processing.stage === key ? 'text-blue-300 font-medium' :
                  ['initializing', 'analyzing', 'absorbing', 'completing', 'done'].indexOf(processing.stage) >
                  ['initializing', 'analyzing', 'absorbing', 'completing', 'done'].indexOf(key) ? 'text-green-300' :
                  'text-gray-400'
                }>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* AI Insights */}
          {processing.insights.length > 0 && (
            <div className="bg-blue-600/10 rounded-lg p-4 border border-blue-500/20">
              <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
                <span>🤖</span> AI Learning Insights
              </h3>
              <div className="space-y-2">
                {processing.insights.map((insight, idx) => (
                  <div key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {processing.error && (
            <div className="bg-red-600/10 rounded-lg p-4 border border-red-500/20 mt-4">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Error</h3>
              <p className="text-xs text-red-200">{processing.error}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center mt-6">
            <p className="text-xs text-gray-500">
              Thought Unit Reader × DAT Bootcamp Integration
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
