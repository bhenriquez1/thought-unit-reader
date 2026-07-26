"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { safeSetItem } from "@/lib/storage/safeStorage";
import type { ThoughtUnit as BaseThoughtUnit } from "@/types/reading";
import { auth } from '@/lib/firebase';
import type { User } from 'firebase/auth';
import { pdrmEngine, type PDRMEntry } from '@/lib/pdrmEngine';
import { pdrmFirestore } from '@/lib/pdrmFirestore';
import SmartHourWidget, { type SmartHourSession } from './SmartHourWidget';

const DEV = process.env.NODE_ENV === "development";

type PVUnit = BaseThoughtUnit | string | string[] | { text?: string };

interface NoteLabPDRMViewProps {
  bookId: string;
  userId: string;
  thoughtUnits: PVUnit[];
  currentThoughtUnit: number;
  currentPage: number;
  fontSize: number;
  fontFamily: string;
  lineSpacing: number;
  onWordClick?: (word: string) => void;
  onTextSelect?: (text: string) => void;
}

// Helper functions
function unitToText(u: PVUnit): string {
  if (u == null) return "";
  if (typeof u === "string") return u;
  if (Array.isArray(u)) return u.join(" ");
  const maybeText = (u as any).text;
  return typeof maybeText === "string" ? maybeText : JSON.stringify(u);
}

export default function NoteLabPDRMView({
  bookId,
  userId,
  thoughtUnits,
  currentThoughtUnit,
  currentPage,
  fontSize,
  fontFamily,
  lineSpacing,
  onWordClick,
  onTextSelect,
}: NoteLabPDRMViewProps) {
  const [user, setUser] = useState<User | null>(null);
  const [pdrmEntries, setPdrmEntries] = useState<PDRMEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<PDRMEntry | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [viewMode, setViewMode] = useState<'pdrm' | 'normal'>('pdrm');
  const [smartHourSessions, setSmartHourSessions] = useState<SmartHourSession[]>([]);

  // Auth
  useEffect(() => {
    const unsubscribe = auth?.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe?.();
  }, []);

  // Load PDRM entries and sessions with Firestore integration
  useEffect(() => {
    if (!user) return;
    
    // Set up real-time subscriptions
    const unsubscribePDRM = pdrmFirestore.subscribeToUserPDRMEntries(
      user.uid,
      bookId,
      (entries) => {
        setPdrmEntries(entries);
        // Keep local backup
        safeSetItem(`pdrm-entries-${user.uid}-${bookId}`, JSON.stringify(entries));
      }
    );

    const unsubscribeSessions = pdrmFirestore.subscribeToUserSmartHourSessions(
      user.uid,
      (sessions) => {
        setSmartHourSessions(sessions);
        // Keep local backup
        safeSetItem('smartHour-sessions', JSON.stringify(sessions));
      }
    );

    // Initial load with fallback to local data
    loadInitialData();

    return () => {
      unsubscribePDRM();
      unsubscribeSessions();
    };
  }, [user, bookId]);

  const loadInitialData = async () => {
    if (!user) return;
    
    try {
      // Try to load from Firestore first
      const [firestoreEntries, firestoreSessions] = await Promise.all([
        pdrmFirestore.getPDRMEntries(user.uid, bookId),
        pdrmFirestore.getSmartHourSessions(user.uid)
      ]);
      
      if (firestoreEntries.length > 0) {
        setPdrmEntries(firestoreEntries);
      } else {
        // Fallback to localStorage
        const localEntries = localStorage.getItem(`pdrm-entries-${user.uid}-${bookId}`);
        if (localEntries) {
          setPdrmEntries(JSON.parse(localEntries));
        }
      }
      
      if (firestoreSessions.length > 0) {
        setSmartHourSessions(firestoreSessions);
      } else {
        // Fallback to localStorage
        const localSessions = localStorage.getItem('smartHour-sessions');
        if (localSessions) {
          const sessions = JSON.parse(localSessions);
          setSmartHourSessions(sessions.filter((s: SmartHourSession) => s.userId === user.uid));
        }
      }

      // Sync any local data to Firestore
      await pdrmFirestore.syncLocalDataToFirestore(user.uid);
    } catch (error) {
      console.error("Failed to load initial data:", error);
      
      // Fallback to localStorage only
      const localEntries = localStorage.getItem(`pdrm-entries-${user.uid}-${bookId}`);
      const localSessions = localStorage.getItem('smartHour-sessions');
      
      if (localEntries) {
        setPdrmEntries(JSON.parse(localEntries));
      }
      if (localSessions) {
        const sessions = JSON.parse(localSessions);
        setSmartHourSessions(sessions.filter((s: SmartHourSession) => s.userId === user.uid));
      }
    }
  };

  const savePDRMEntry = async (entry: PDRMEntry) => {
    if (!user) return;
    try {
      // Save to Firestore first
      await pdrmFirestore.savePDRMEntry(entry);
      
      // Update local state (will be updated by subscription, but do it immediately for responsiveness)
      const updatedEntries = currentEntry 
        ? pdrmEntries.map(e => e.id === currentEntry.id ? entry : e)
        : [...pdrmEntries, entry];
      
      setPdrmEntries(updatedEntries);

      // Keep local backup
      safeSetItem(`pdrm-entries-${user.uid}-${bookId}`, JSON.stringify(updatedEntries));

      DEV && console.log('💾 PDRM: Entry saved to Firestore and locally', entry);
    } catch (error) {
      console.error("Failed to save PDRM entry:", error);

      // Fallback to localStorage only
      const updatedEntries = currentEntry
        ? pdrmEntries.map(e => e.id === currentEntry.id ? entry : e)
        : [...pdrmEntries, entry];

      setPdrmEntries(updatedEntries);
      safeSetItem(`pdrm-entries-${user.uid}-${bookId}`, JSON.stringify(updatedEntries));
    }
  };

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 10) {
      const text = selection.toString().trim();
      setSelectedText(text);
      onTextSelect?.(text);
      
      // Auto-generate PDRM entry for selected text
      if (viewMode === 'pdrm' && user) {
        generatePDRMForText(text);
      }
    }
  }, [viewMode, user, onTextSelect]);

  const generatePDRMForText = async (text: string) => {
    if (!user || isGenerating) return;

    setIsGenerating(true);
    try {
      const pdrmEntry = await pdrmEngine.generatePDRMEntry(
        text,
        {
          userId: user.uid,
          bookId,
          thoughtUnitId: currentThoughtUnit.toString(),
          page: currentPage
        }
      );

      setCurrentEntry(pdrmEntry);
      DEV && console.log('🧠 PDRM: Generated entry', pdrmEntry);
    } catch (error) {
      console.error('Failed to generate PDRM entry:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePDRM = async () => {
    if (!currentEntry || !user) return;
    
    const entryToSave = {
      ...currentEntry,
      updatedAt: new Date().toISOString()
    };

    await savePDRMEntry(entryToSave);
    setCurrentEntry(null);
    setSelectedText("");
  };

  const handleUpdatePDRMField = (field: keyof PDRMEntry, value: any) => {
    if (!currentEntry) return;
    
    setCurrentEntry(prev => ({
      ...prev!,
      [field]: value,
      manuallyEdited: true,
      updatedAt: new Date().toISOString()
    }));
  };

  const handleSmartHourComplete = useCallback(async (session: SmartHourSession) => {
    try {
      // Save to Firestore
      await pdrmFirestore.saveSmartHourSession(session);
      
      // Update local state (will be updated by subscription, but do it immediately)
      setSmartHourSessions(prev => [...prev, session]);
      
      DEV && console.log('⏱️ Smart-Hour: Session saved to Firestore', session);
    } catch (error) {
      console.error('Failed to save Smart-Hour session to Firestore:', error);
      
      // Fallback to local storage
      setSmartHourSessions(prev => [...prev, session]);
      const allSessions = [...smartHourSessions, session];
      localStorage.setItem('smartHour-sessions', JSON.stringify(allSessions));
    }
  }, [smartHourSessions]);

  const handleEnhanceUnderstanding = async () => {
    if (!currentEntry) return;

    setIsGenerating(true);
    try {
      const enhancedDetails = await pdrmEngine.enhanceUnderstandingDetail(
        currentEntry.understandingDetail,
        currentEntry.sourceText
      );
      
      handleUpdatePDRMField('understandingDetail', enhancedDetails);
    } catch (error) {
      console.error('Failed to enhance understanding details:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Get current thought unit text
  const rawUnit = thoughtUnits[currentThoughtUnit - 1] || thoughtUnits[0];
  const unitText = rawUnit ? unitToText(rawUnit) : "";

  // Get entries for current thought unit
  const currentUnitEntries = pdrmEntries.filter(entry => 
    entry.thoughtUnitId === currentThoughtUnit.toString()
  );

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">📝 NoteLab PDRM Mode</h2>
          <p className="text-gray-400">Please sign in to access PDRM features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-green-400">
            📝 NoteLab PDRM Mode
          </h2>
          <span className="text-sm text-gray-400">
            Unit {currentThoughtUnit} of {thoughtUnits.length} • {pdrmEntries.length} entries
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('pdrm')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'pdrm' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            🧠 PDRM Mode
          </button>
          <button
            onClick={() => setViewMode('normal')}
            className={`px-3 py-1 rounded text-sm ${
              viewMode === 'normal' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            📝 Normal Notes
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Source Text */}
        <div className="w-1/2 p-6 overflow-y-auto border-r border-gray-700">
          <h3 className="text-lg font-semibold text-green-400 mb-4">
            📖 Source Text (Unit {currentThoughtUnit})
          </h3>
          
          {unitText && (
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <div
                className="leading-relaxed text-gray-200 cursor-text select-text"
                style={{ fontSize: `${fontSize}px`, fontFamily, lineHeight: lineSpacing }}
                onMouseUp={handleTextSelection}
              >
                {unitText.split(' ').map((word, idx) => (
                  <span
                    key={idx}
                    className="hover:bg-green-700 hover:bg-opacity-30 cursor-pointer px-0.5 rounded"
                    onClick={() => onWordClick?.(word)}
                  >
                    {word}{' '}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedText && (
            <div className="mb-4 p-3 bg-blue-900 bg-opacity-30 rounded-lg border-l-4 border-blue-400">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Selected Text:</h4>
              <p className="text-sm text-gray-300">"{selectedText.substring(0, 200)}..."</p>
              {viewMode === 'pdrm' && !currentEntry && !isGenerating && (
                <button
                  onClick={() => generatePDRMForText(selectedText)}
                  className="mt-2 px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                >
                  Generate PDRM Entry
                </button>
              )}
            </div>
          )}

          {/* Current Unit Entries */}
          <div>
            <h4 className="text-md font-semibold text-gray-300 mb-3">
              📋 Entries for This Unit ({currentUnitEntries.length})
            </h4>
            {currentUnitEntries.length === 0 ? (
              <p className="text-sm text-gray-400">
                {viewMode === 'pdrm' 
                  ? "Select text above to create PDRM entries"
                  : "No entries yet for this unit"
                }
              </p>
            ) : (
              <div className="space-y-2">
                {currentUnitEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="p-3 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                    onClick={() => setCurrentEntry(entry)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-1 bg-green-700 rounded">
                        {entry.pattern.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {Math.round(entry.confidenceScore * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 truncate">
                      {entry.sourceText.substring(0, 100)}...
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - PDRM Editor / Smart-Hour Widget */}
        <div className="w-1/2 flex flex-col">
          {/* Smart-Hour Widget */}
          <div className="p-4 border-b border-gray-700">
            <SmartHourWidget 
              onSessionComplete={handleSmartHourComplete}
              className="w-full"
            />
          </div>

          {/* PDRM Editor */}
          <div className="flex-1 p-6 overflow-y-auto">
            {viewMode === 'pdrm' ? (
              <>
                {isGenerating && (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
                    <p className="mt-2 text-green-400">Generating PDRM entry...</p>
                  </div>
                )}

                {currentEntry && !isGenerating && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-green-400">
                        🧠 PDRM 2.0 Entry
                      </h3>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEnhanceUnderstanding}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                          disabled={isGenerating}
                        >
                          ✨ Enhance
                        </button>
                        <button
                          onClick={handleSavePDRM}
                          className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={() => setCurrentEntry(null)}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Pattern */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        🎯 Pattern
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-green-700 rounded text-sm">
                          {currentEntry.pattern.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {Math.round(currentEntry.pattern.confidence * 100)}% confidence
                        </span>
                        <span className="text-xs px-2 py-1 bg-gray-700 rounded">
                          {currentEntry.pattern.category}
                        </span>
                      </div>
                    </div>

                    {/* Decision Rule */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        ⚖️ Decision Rule
                      </label>
                      <textarea
                        value={currentEntry.decisionRule}
                        onChange={(e) => handleUpdatePDRMField('decisionRule', e.target.value)}
                        rows={4}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-sm resize-none"
                        placeholder="Framework for applying this pattern..."
                      />
                    </div>

                    {/* Why It Works */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        💡 Why It Works
                      </label>
                      <textarea
                        value={currentEntry.whyItWorks}
                        onChange={(e) => handleUpdatePDRMField('whyItWorks', e.target.value)}
                        rows={3}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-sm resize-none"
                        placeholder="Explanation of pattern effectiveness..."
                      />
                    </div>

                    {/* Understanding Detail */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-300">
                          🔍 Understanding Detail
                        </label>
                        <span className="text-xs text-gray-400">
                          {currentEntry.understandingDetail.length} details
                        </span>
                      </div>
                      <div className="space-y-2">
                        {currentEntry.understandingDetail.map((detail, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <span className="text-xs text-green-400 mt-1">•</span>
                            <input
                              type="text"
                              value={detail}
                              onChange={(e) => {
                                const newDetails = [...currentEntry.understandingDetail];
                                newDetails[index] = e.target.value;
                                handleUpdatePDRMField('understandingDetail', newDetails);
                              }}
                              className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-sm"
                              placeholder="Add understanding detail..."
                            />
                            <button
                              onClick={() => {
                                const newDetails = currentEntry.understandingDetail.filter((_, i) => i !== index);
                                handleUpdatePDRMField('understandingDetail', newDetails);
                              }}
                              className="text-red-400 hover:text-red-300 text-xs px-2"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const newDetails = [...currentEntry.understandingDetail, ""];
                            handleUpdatePDRMField('understandingDetail', newDetails);
                          }}
                          className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-400"
                        >
                          + Add Detail
                        </button>
                      </div>
                    </div>

                    {/* Application Example */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        🎯 Application / Example
                      </label>
                      <textarea
                        value={currentEntry.applicationExample}
                        onChange={(e) => handleUpdatePDRMField('applicationExample', e.target.value)}
                        rows={3}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-sm resize-none"
                        placeholder="How to apply this pattern..."
                      />
                    </div>

                    {/* Cross-Link */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        🔗 Cross-Link
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {currentEntry.crossLink.map((link, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-blue-700 rounded-full text-xs cursor-pointer hover:bg-blue-600"
                            onClick={() => {
                              const newLinks = currentEntry.crossLink.filter((_, i) => i !== index);
                              handleUpdatePDRMField('crossLink', newLinks);
                            }}
                          >
                            {link} ✕
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Add related concept or pattern..."
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            const newLinks = [...currentEntry.crossLink, e.currentTarget.value.trim()];
                            handleUpdatePDRMField('crossLink', newLinks);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>

                    {/* Reflection Prompt */}
                    <div className="bg-gray-800 rounded-lg p-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        🤔 Reflection Prompt
                      </label>
                      <textarea
                        value={currentEntry.reflectionPrompt}
                        onChange={(e) => handleUpdatePDRMField('reflectionPrompt', e.target.value)}
                        rows={2}
                        className="w-full p-3 bg-gray-700 border border-gray-600 rounded text-sm resize-none"
                        placeholder="Question for self-reflection..."
                      />
                    </div>
                  </div>
                )}

                {!currentEntry && !isGenerating && (
                  <div className="text-center py-8 text-gray-400">
                    <div className="mb-4">
                      <div className="text-4xl mb-2">🧠</div>
                      <h3 className="text-lg font-semibold mb-2">Ready for PDRM Analysis</h3>
                      <p className="text-sm">
                        Select text from the left panel to generate a structured PDRM entry.
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      <p>Pattern • Decision Rule • Why • Understanding Detail • Application • Cross-Link • Reflection</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">📝</div>
                <h3 className="text-lg font-semibold mb-2">Normal Notes Mode</h3>
                <p className="text-sm">Standard note-taking interface would go here.</p>
                <p className="text-xs text-gray-500 mt-2">
                  Switch to PDRM Mode for structured pattern analysis.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Footer */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="flex justify-between items-center text-sm text-gray-400">
          <div>
            PDRM Entries: {pdrmEntries.length} | 
            Smart-Hour Sessions: {smartHourSessions.length} | 
            Focus Time: {smartHourSessions.filter(s => s.sessionType === 'focus').reduce((acc, s) => acc + s.totalMinutes, 0)} min
          </div>
          <div>
            {viewMode === 'pdrm' && currentEntry && (
              <span className="text-green-400">
                Confidence: {Math.round(currentEntry.confidenceScore * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
