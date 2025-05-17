import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"

import { Label } from "../components/ui/label"
import { Switch } from "../components/ui/switch"
import { Button } from "../components/ui/button"

import "react-pdf/dist/esm/Page/AnnotationLayer.css"
import "react-pdf/dist/esm/Page/TextLayer.css"

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export default function Home() {
  const [enabled, setEnabled] = useState(false)

  return (
    <div className="p-6">
      <div className="mt-6 flex items-center gap-4">
        <Label htmlFor="toggleParser">Enable Parser</Label>
        <Switch
          id="toggleParser"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      <Button className="mt-6">Start Parsing</Button>
    </div>
  )
}