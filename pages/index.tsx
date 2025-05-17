import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

export default function Home() {
  const [parserEnabled, setParserEnabled] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col gap-4 mt-6 items-center">
        <Label htmlFor="toggleParser">Enable Parser</Label>
        <Switch
          id="toggleParser"
          checked={parserEnabled}
          onChange={(e) => setParserEnabled(e.target.checked)}
        />
        <Button>Start Parsing</Button>
      </div>
    </div>
  )
}