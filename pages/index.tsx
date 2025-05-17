import { useState } from "react";
import { Switch } from "@headlessui/react";

// Label Component
const Label = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
    {children}
  </label>
);

// Button Component
const Button = ({ children }: { children: React.ReactNode }) => (
  <button className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
    {children}
  </button>
);

// Main Page Component
export default function HomePage() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="mt-6 flex items-center gap-4">
      <Label htmlFor="toggleParser">Enable Parser</Label>
      <Switch
        id="toggleParser"
        checked={enabled}
        onChange={setEnabled} // ✅ Fixed here
        className={`${enabled ? 'bg-blue-600' : 'bg-gray-300'}
          relative inline-flex h-6 w-11 items-center rounded-full transition`}
      >
        <span
          className={`${
            enabled ? 'translate-x-6' : 'translate-x-1'
          } inline-block h-4 w-4 transform rounded-full bg-white transition`}
        />
      </Switch>
      <Button>Start Parsing</Button>
    </div>
  );
}