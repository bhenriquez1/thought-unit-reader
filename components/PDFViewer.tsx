// ===== COPY THESE FIXES TO YOUR ProgressiveView.tsx COMPONENT =====

// 1. Make sure your state variables include local state for font settings if needed:
const [localFontSize, setLocalFontSize] = useState(fontSize || 18);
const [localFontFamily, setLocalFontFamily] = useState(fontFamily || "Arial, sans-serif");

// 2. Fix the auto-scroll toggle button:
<Button 
  onClick={() => {
    console.log("Auto-scroll toggled from", autoScroll, "to", !autoScroll);
    setAutoScroll(!autoScroll);
  }}
  className={autoScroll ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
>
  {autoScroll ? '⏸ Stop Auto-Scroll' : '▶ Start Auto-Scroll'}
</Button>

// 3. Fix the reset button:
<Button 
  onClick={() => {
    console.log("Reset to start");
    setCurrentSentence(0);
    setAutoScroll(false);
  }}
  variant="outline"
>
  ↩ Back to Start
</Button>

// 4. Fix the scroll speed buttons:
<div className="flex items-center ml-auto gap-2">
  <span className="text-sm">Scroll Speed:</span>
  <Button 
    onClick={() => {
      console.log("Decreasing scroll speed");
      changeScrollSpeed(500);
    }}
    variant="outline"
    size="sm"
    className="px-2 py-1 h-8"
  >
    Slower
  </Button>
  <span className="text-sm font-medium w-10 text-center">{renderSpeed()}</span>
  <Button 
    onClick={() => {
      console.log("Increasing scroll speed");
      changeScrollSpeed(-500);
    }}
    variant="outline"
    size="sm"
    className="px-2 py-1 h-8"
  >
    Faster
  </Button>
</div>

// 5. Fix the font selector:
<select 
  value={localFontFamily}
  onChange={(e) => {
    console.log("Font changed to:", e.target.value);
    setLocalFontFamily(e.target.value);
    // If you want to update parent state as well:
    // if (onFontChange) onFontChange(e.target.value);
  }}
  className={cn(
    "px-2 py-1 rounded border text-sm",
    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-300"
  )}
>
  <option value="Arial, sans-serif">Arial</option>
  <option value="Verdana, sans-serif">Verdana</option>
  <option value='"Comic Sans MS", cursive'>Comic Sans</option>
  <option value="OpenDyslexic, sans-serif">OpenDyslexic</option>
  <option value="Helvetica, Arial, sans-serif">Helvetica</option>
</select>

// 6. Fix the font size buttons:
<button 
  onClick={() => {
    console.log("Decreasing font size");
    setLocalFontSize(Math.max(localFontSize - 1, 14));
  }}
  className={cn(
    "px-2 py-0.5 rounded", 
    darkMode ? "bg-gray-700" : "bg-gray-200"
  )}
>
  -
</button>
<span className="text-sm">{localFontSize}px</span>
<button 
  onClick={() => {
    console.log("Increasing font size");
    setLocalFontSize(Math.min(localFontSize + 1, 24));
  }}
  className={cn(
    "px-2 py-0.5 rounded", 
    darkMode ? "bg-gray-700" : "bg-gray-200"
  )}
>
  +
</button>

// 7. Fix the alternate colors toggle:
<button 
  onClick={() => {
    console.log("Alternate colors toggled from", alternateColors, "to", !alternateColors);
    setAlternateColors(!alternateColors);
  }}
  className={`w-10 h-5 rounded-full relative ${
    alternateColors ? 'bg-green-500' : 'bg-gray-300'
  }`}
>
  <span 
    className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all ${
      alternateColors ? 'left-5' : 'left-1'
    }`}
  />
</button>

// 8. Fix the navigation buttons:
<Button
  onClick={() => {
    console.log("Previous sentence");
    if (currentSentence > 0) {
      setCurrentSentence(prev => prev - 1);
      setAutoScroll(false);
    }
  }}
  variant="outline"
  disabled={currentSentence === 0}
>
  ◀ Previous
</Button>

<Button
  onClick={() => {
    console.log("Next sentence");
    if (currentSentence < sentences.length - 1) {
      setCurrentSentence(prev => prev + 1);
      setAutoScroll(false);
    }
  }}
  variant="outline"
  disabled={currentSentence >= sentences.length - 1}
>
  Next ▶
</Button>

// 9. Add a debug function for ProgressiveView component
const debugProgressiveView = () => {
  console.log("ProgressiveView Debug Info:");
  console.log({
    sentences: sentences.length,
    currentSentence,
    autoScroll,
    scrollInterval,
    alternateColors,
    progress,
    fontFamily: localFontFamily,
    fontSize: localFontSize,
    darkMode
  });
  
  if (sentences.length > 0) {
    console.log("Current sentence:", sentences[currentSentence]);
  }
  
  alert("ProgressiveView debug info logged to console");
};

// 10. Add a debug button to the component
<Button
  onClick={debugProgressiveView}
  variant="outline"
  size="sm"
  className="mt-4 self-end"
>
  🔍 Debug View
</Button>