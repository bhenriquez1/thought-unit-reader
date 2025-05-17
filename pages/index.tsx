import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Input } from "../components/ui/input"
import { Button } from "../components/ui/button"
import { Label } from "../components/ui/label"
import { Switch } from "../components/ui/switch"

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export default function Home() {
  const [enabled, setEnabled] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-4 text-center">Thought-Unit Parser</h1>

        <div className="mt-6 flex items-center gap-4">
          <Label htmlFor="toggleParser">Enable Parser</Label>
          <Switch
            id="toggleParser"
            checked={enabled}
            onChange={setEnabled}
          />
        </div>

        <div className="mt-6">
          <Button>Start Parsing</Button>
        </div>
      </div>
    </div>
  )
}