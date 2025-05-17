import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export default function ThoughtUnitReader() {
  const [file, setFile] = useState(null)
  const [text, setText] = useState("")
  const [formattedText, setFormattedText] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [dyslexiaFont, setDyslexiaFont] = useState(false)
  const [parserEditMode, setParserEditMode] = useState(false)
  const [toc, setToc] = useState([])

  useEffect(() => {
    document.body.className = `${darkMode ? "dark" : ""} ${dyslexiaFont ? "dyslexia-font" : ""}`
  }, [darkMode, dyslexiaFont])

  function parseThoughtUnits(input) {
    const lines = input.split(/(?<=\\.|\\?|!)\\s+/)
    return lines
      .map((phrase, i) => `<span style='color: ${i % 2 === 0 ? "black" : "gray"};'>${phrase}</span>`)
      .join(" ")
  }

  function extractTOC(text) {
    return text
      .split("\\n")
      .filter((line) => /chapter|section|unit|topic/i.test(line))
      .slice(0, 20)
  }

  function handleFileUpload(e) {
    const uploadedFile = e.target.files[0]
    setFile(uploadedFile)

    const reader = new FileReader()
    reader.onload = function () {
      const content = reader.result
      setText(content)
      setFormattedText(parseThoughtUnits(content))
      setToc(extractTOC(content))
    }

    reader.readAsText(uploadedFile)
  }

  return (
    <div className={`min-h-screen flex ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}>
      <div className="w-1/2 p-4 border-r space-y-4 overflow-y-scroll">
        <h1 className="text-xl font-bold">Thought-Unit Reader</h1>

        <div className="flex items-center gap-4">
          <Label>🌙 Dark Mode</Label>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          <Label>🧠 Dyslexia Font</Label>
          <Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} />
          <Label>🛠 Parser Edit</Label>
          <Switch checked={parserEditMode} onCheckedChange={setParserEditMode} />
        </div>

        <Input type="file" onChange={handleFileUpload} accept=".txt,.pdf,.docx" />

        {toc.length > 0 && (
          <div className="mt-4">
            <h2 className="font-semibold text-lg">📑 Table of Contents</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {toc.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="w-1/2 p-4 space-y-2 overflow-y-scroll bg-gray-50 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold mb-2">🧠 Thought-Unit Output</h2>
        <div
          className={`prose max-w-full ${dyslexiaFont ? "dyslexia-font" : ""}`}
          dangerouslySetInnerHTML={{ __html: formattedText }}
        />
      </div>
    </div>
  )
}