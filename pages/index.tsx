// Inside <main className="flex-1 p-4">...

{/* Main Panel Controls */}
<div className="flex justify-between items-center mb-4">
  <h1 className="text-2xl font-bold">Thought Unit Reader</h1>
  <div className="flex gap-2">
    <Button onClick={() => setSelectedPage((p) => Math.max(p - 1, 1))}>←</Button>
    <Button onClick={() => setSelectedPage((p) => p + 1)}>→</Button>
    <Button onClick={handleZoomIn}>Zoom In</Button>
    <Button onClick={handleZoomOut}>Zoom Out</Button>
  </div>
</div>

{/* Conditional Rendering Based on View Mode */}
{uploadStatus === "done" && (
  <>
    {viewMode === "original" && fileType === "pdf" && fileData && (
      <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
        <Document file={fileData} onLoadError={(err) => console.error(err)}>
          <Page pageNumber={selectedPage} />
        </Document>
      </div>
    )}

    {viewMode === "chapters" && chapters.length > 0 && (
      <div className="prose dark:prose-invert">
        {chapters.map((ch, i) => (
          <div key={i} className="mb-6">
            <h2 className="text-lg font-semibold">{ch}</h2>
            <p className="italic text-zinc-500">Chapter {i + 1} content loading soon...</p>
          </div>
        ))}
      </div>
    )}

    {viewMode === "progressive" && fileType === "text" && (
      <div
        className="prose dark:prose-invert"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        dangerouslySetInnerHTML={{ __html: output || "" }}
      />
    )}

    {viewMode === "hybrid" && (
      <div className="prose dark:prose-invert">
        <p className="mb-4 font-bold text-primary">🧠 Hybrid Mode: Chapter + Thought Units</p>
        {chapters.map((ch, i) => (
          <div key={i} className="mb-4">
            <h3 className="font-semibold">{ch}</h3>
            <p className="text-sm italic text-zinc-400">Chapter {i + 1}</p>
          </div>
        ))}
        {fileType === "text" && (
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
            dangerouslySetInnerHTML={{ __html: output || "" }}
          />
        )}
      </div>
    )}
  </>
)}

{/* Loader or Preload state */}
{uploadStatus !== "done" && (
  <div className="text-center text-zinc-500 dark:text-zinc-400">
    {uploadStatus === "uploading"
      ? "Uploading file..."
      : uploadStatus === "processing"
      ? "Processing file..."
      : "Upload a file to begin"}
  </div>
)}