// ===== COPY THESE FIXES TO YOUR HybridReader.tsx COMPONENT =====

// 1. Make sure handleFileChange is properly defined and logs when called:
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  console.log("File input changed in HybridReader");
  const files = e.target.files;
  if (!files || files.length === 0) {
    console.log("No files selected");
    return;
  }
  
  const uploadedFile = files[0];
  if (!uploadedFile) {
    console.log("Uploaded file is null");
    return;
  }
  
  console.log("Processing file:", uploadedFile.name);
  
  // Create a more reliable blob URL for file preview
  try {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        const blob = new Blob([reader.result as ArrayBuffer], { type: uploadedFile.type });
        const url = URL.createObjectURL(blob);
        console.log("Blob URL created");
        setPdfURL(url);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  } catch (error) {
    console.error("Error creating blob URL:", error);
  }

  const fileExt = uploadedFile.name.split(".").pop()?.toLowerCase() || "";
  console.log("File extension:", fileExt);
  setFile(uploadedFile);
  setExtension(fileExt);
};

// 2. Fix the file upload input:
<div>
  <label className="block mb-2">Upload a file (PDF, DOCX, or TXT):</label>
  <input
    type="file"
    accept=".pdf,.docx,.txt"
    ref={fileRef}
    className="mb-4"
    onClick={() => console.log("File input clicked")}
    onChange={(e) => {
      console.log("File input changed - calling handler");
      handleFileChange(e);
    }}
  />
</div>

// 3. Fix the dark mode toggle button:
<button 
  onClick={() => {
    console.log("Dark mode toggled from", isDarkMode, "to", !isDarkMode);
    toggleDarkMode();
  }}
  className={`w-12 h-6 rounded-full relative ${
    isDarkMode ? 'bg-blue-600' : 'bg-gray-300'
  }`}
>
  <span 
    className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
      isDarkMode ? 'left-6' : 'left-1'
    }`}
  />
</button>

// 4. Fix the toggleDarkMode function:
const toggleDarkMode = () => {
  console.log("toggleDarkMode called");
  setIsDarkMode(!isDarkMode);
};

// 5. Fix the view mode buttons:
<div className="flex flex-wrap gap-4 mt-2 mb-6">
  <Button 
    onClick={() => {
      console.log("Setting view mode to original");
      setViewMode("original");
    }} 
    variant={viewMode === "original" ? "default" : "secondary"}
  >
    📄 Original View
  </Button>
  <Button 
    onClick={() => {
      console.log("Setting view mode to chapters");
      setViewMode("chapters");
    }} 
    variant={viewMode === "chapters" ? "default" : "outline"}
  >
    📚 Chapters
  </Button>
  <Button 
    onClick={() => {
      console.log("Setting view mode to progressive");
      setViewMode("progressive");
    }} 
    variant={viewMode === "progressive" ? "default" : "outline"}
  >
    🧠 Progressive
  </Button>
  <Button 
    onClick={() => {
      console.log("Setting view mode to hybrid");
      setViewMode("hybrid");
    }} 
    variant={viewMode === "hybrid" ? "default" : "outline"}
  >
    🔁 Hybrid View
  </Button>
</div>

// 6. Fix the font selector:
<select 
  value={fontFamily}
  onChange={(e) => {
    console.log("Font changed to:", e.target.value);
    setFontFamily(e.target.value);
  }}
  className={cn(
    "px-2 py-1 rounded border text-sm",
    isDarkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-300"
  )}
>
  {fontOptions.map(option => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>

// 7. Fix the font size buttons:
<Button 
  onClick={() => {
    console.log("Decreasing font size");
    setFontSize(Math.max(fontSize - 1, 14));
  }}
  variant="outline"
  size="sm"
  className="h-8 px-2"
>
  -
</Button>
<span className="text-sm w-8 text-center">{fontSize}</span>
<Button 
  onClick={() => {
    console.log("Increasing font size");
    setFontSize(Math.min(fontSize + 1, 24));
  }}
  variant="outline"
  size="sm"
  className="h-8 px-2"
>
  +
</Button>

// 8. Fix the line spacing buttons:
<Button 
  onClick={() => {
    console.log("Decreasing line spacing");
    setLineSpacing(Math.max(lineSpacing - 0.1, 1.0));
  }}
  variant="outline"
  size="sm"
  className="h-8 px-2"
>
  -
</Button>
<span className="text-sm w-8 text-center">{lineSpacing.toFixed(1)}</span>
<Button 
  onClick={() => {
    console.log("Increasing line spacing");
    setLineSpacing(Math.min(lineSpacing + 0.1, 3.0));
  }}
  variant="outline"
  size="sm"
  className="h-8 px-2"
>
  +
</Button>

// 9. Fix the reading controls:
<Button 
  onClick={() => {
    console.log("Reading toggled from", isReading, "to", !isReading);
    toggleReading();
  }}
  className={isReading ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
>
  {isReading ? '⏸ Pause' : '▶ Start'}
</Button>

<Button 
  onClick={() => {
    console.log("Reading reset");
    resetReading();
  }}
  variant="outline"
>
  🔄 Reset
</Button>

// 10. Add a debug function for the HybridReader component:
const debugHybridReader = () => {
  console.log("HybridReader Debug Info:");
  console.log({
    file: file ? file.name : null,
    extension,
    pdfURL: pdfURL ? "Set" : "Not set",
    loading,
    viewMode,
    parsedUnits: parsedUnits.length,
    chapters: chapters.length,
    originalTextLength: originalText ? originalText.length : 0,
    hybridHTMLLength: hybridHTML ? hybridHTML.length : 0,
    activeChapter,
    fontSize,
    fontFamily,
    lineSpacing,
    wordSpacing,
    isDarkMode,
    currentUnit,
    isReading,
    readingSpeed,
    progress
  });
  
  alert("HybridReader debug info logged to console");
};

// 11. Add a debug button:
<Button
  onClick={debugHybridReader}
  variant="outline"
  className="mt-4 self-end"
>
  🔍 Debug HybridReader
</Button>