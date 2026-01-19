"""
Test P0/P1 Store Features:
- studySessionStore: startQuickStudy, resumeLastSession, startTopicSession, getWeakDeck, getTopicDeck
- syllabusStore: updateTopicAfterStudy
- annotationStore: auto-adds 'highlight' tag
- quizStore: creates flashcards with 'miss', 'weak', 'quiz-generated' tags
"""

import pytest
import requests
import os
import json

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:3000')

class TestFrontendLoads:
    """Test that frontend loads correctly"""
    
    def test_homepage_loads(self):
        """Test that the homepage loads successfully"""
        response = requests.get(f"{BASE_URL}")
        assert response.status_code == 200
        assert "Surgeon-View PDRM" in response.text
        print("✅ Homepage loads successfully")
    
    def test_all_6_tabs_present(self):
        """Test that all 6 navigation tabs are present in HTML"""
        response = requests.get(f"{BASE_URL}")
        assert response.status_code == 200
        
        # Check for all 6 tab data-testids
        tabs = [
            'data-testid="nav-reader"',
            'data-testid="nav-toc"',
            'data-testid="nav-surgeon"',
            'data-testid="nav-notelab"',
            'data-testid="nav-study"',
            'data-testid="nav-syllabus"'
        ]
        
        for tab in tabs:
            assert tab in response.text, f"Tab {tab} not found in HTML"
        
        print("✅ All 6 tabs present in HTML")
    
    def test_study_tab_elements_present(self):
        """Test that Study tab elements are present"""
        response = requests.get(f"{BASE_URL}")
        assert response.status_code == 200
        
        # Study tab should have data-testid
        assert 'data-testid="nav-study"' in response.text
        print("✅ Study tab element present")
    
    def test_syllabus_tab_elements_present(self):
        """Test that Syllabus tab elements are present"""
        response = requests.get(f"{BASE_URL}")
        assert response.status_code == 200
        
        # Syllabus tab should have data-testid
        assert 'data-testid="nav-syllabus"' in response.text
        print("✅ Syllabus tab element present")


class TestStoreMethodsExist:
    """Test that store methods exist by checking source files"""
    
    def test_studySessionStore_has_startQuickStudy(self):
        """Verify startQuickStudy method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'startQuickStudy:' in content or 'startQuickStudy =' in content
        assert 'getWeakDeck' in content
        print("✅ startQuickStudy method exists in studySessionStore")
    
    def test_studySessionStore_has_resumeLastSession(self):
        """Verify resumeLastSession method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'resumeLastSession:' in content or 'resumeLastSession =' in content
        assert 'lastSessionDocId' in content
        assert 'lastSessionCardIndex' in content
        print("✅ resumeLastSession method exists in studySessionStore")
    
    def test_studySessionStore_has_startTopicSession(self):
        """Verify startTopicSession method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'startTopicSession:' in content or 'startTopicSession =' in content
        print("✅ startTopicSession method exists in studySessionStore")
    
    def test_studySessionStore_has_getWeakDeck(self):
        """Verify getWeakDeck method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'getWeakDeck:' in content or 'getWeakDeck =' in content
        print("✅ getWeakDeck method exists in studySessionStore")
    
    def test_studySessionStore_has_getTopicDeck(self):
        """Verify getTopicDeck method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'getTopicDeck:' in content or 'getTopicDeck =' in content
        print("✅ getTopicDeck method exists in studySessionStore")
    
    def test_studySessionStore_has_hasLastSession(self):
        """Verify hasLastSession method exists in studySessionStore"""
        with open('/app/lib/stores/studySessionStore.ts', 'r') as f:
            content = f.read()
        
        assert 'hasLastSession:' in content or 'hasLastSession =' in content
        print("✅ hasLastSession method exists in studySessionStore")
    
    def test_syllabusStore_has_updateTopicAfterStudy(self):
        """Verify updateTopicAfterStudy method exists in syllabusStore"""
        with open('/app/lib/stores/syllabusStore.ts', 'r') as f:
            content = f.read()
        
        assert 'updateTopicAfterStudy:' in content or 'updateTopicAfterStudy =' in content
        print("✅ updateTopicAfterStudy method exists in syllabusStore")
    
    def test_annotationStore_auto_adds_highlight_tag(self):
        """Verify annotationStore auto-adds 'highlight' tag when creating annotations"""
        with open('/app/lib/stores/annotationStore.ts', 'r') as f:
            content = f.read()
        
        # Check for auto-tagging logic
        assert "if (!tags.includes('highlight'))" in content
        assert "tags.push('highlight')" in content
        print("✅ annotationStore auto-adds 'highlight' tag")
    
    def test_quizStore_creates_flashcards_with_tags(self):
        """Verify quizStore creates flashcards with miss/weak/quiz-generated tags"""
        with open('/app/lib/stores/quizStore.ts', 'r') as f:
            content = f.read()
        
        # Check for flashcard creation with proper tags
        assert "'flashcard'" in content
        assert "'miss'" in content
        assert "'weak'" in content
        assert "'quiz-generated'" in content
        print("✅ quizStore creates flashcards with proper tags")


class TestSmartPDFViewerDefensiveGuards:
    """Test that SmartPDFViewer has defensive guards"""
    
    def test_defensive_guards_exist(self):
        """Verify SmartPDFViewer has defensive guards for Page rendering"""
        with open('/app/components/SmartPDFViewer.tsx', 'r') as f:
            content = f.read()
        
        # Check for defensive guards
        assert 'if (!isLoaded)' in content
        assert 'if (!pdfDocument)' in content
        assert 'pageCount' in content
        assert 'currentPage' in content
        print("✅ SmartPDFViewer has defensive guards")
    
    def test_renderAnnotationLayer_disabled(self):
        """Verify renderAnnotationLayer is set to false"""
        with open('/app/components/SmartPDFViewer.tsx', 'r') as f:
            content = f.read()
        
        assert 'renderAnnotationLayer={false}' in content
        print("✅ renderAnnotationLayer is disabled")


class TestStudySessionPanelUI:
    """Test StudySessionPanel UI elements"""
    
    def test_quick_study_button_exists(self):
        """Verify Quick Study button exists in StudySessionPanel"""
        with open('/app/components/StudySessionPanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="quick-study-btn"' in content
        assert 'startQuickStudy' in content
        print("✅ Quick Study button exists in StudySessionPanel")
    
    def test_resume_session_button_exists(self):
        """Verify Resume Session button exists in StudySessionPanel"""
        with open('/app/components/StudySessionPanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="resume-session-btn"' in content
        assert 'resumeLastSession' in content
        print("✅ Resume Session button exists in StudySessionPanel")
    
    def test_start_full_session_button_exists(self):
        """Verify Start Full Session button exists in StudySessionPanel"""
        with open('/app/components/StudySessionPanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="study-start-btn"' in content
        print("✅ Start Full Session button exists in StudySessionPanel")


class TestSyllabusModePanelUI:
    """Test SyllabusModePanel UI elements"""
    
    def test_create_syllabus_button_exists(self):
        """Verify Create Syllabus button exists in SyllabusModePanel"""
        with open('/app/components/SyllabusModePanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="create-syllabus-btn"' in content
        print("✅ Create Syllabus button exists in SyllabusModePanel")
    
    def test_syllabus_empty_state_exists(self):
        """Verify Syllabus empty state exists in SyllabusModePanel"""
        with open('/app/components/SyllabusModePanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="syllabus-empty"' in content
        print("✅ Syllabus empty state exists in SyllabusModePanel")
    
    def test_quick_study_button_in_syllabus(self):
        """Verify Quick Study button exists in SyllabusModePanel"""
        with open('/app/components/SyllabusModePanel.tsx', 'r') as f:
            content = f.read()
        
        assert 'data-testid="syllabus-quick-study-btn"' in content
        print("✅ Quick Study button exists in SyllabusModePanel")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
