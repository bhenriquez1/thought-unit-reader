// components/ui/PreviewModal.tsx
import React from "react";
import { Dialog } from "@headlessui/react";
import { Card } from "@/components/ui/card";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
}

export default function PreviewModal({
  isOpen,
  onClose,
  content,
}: PreviewModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed z-50 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4 bg-black/30">
        <Dialog.Panel className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl p-6">
          <Dialog.Title className="text-xl font-bold mb-4">🧠 Right Brain Preview</Dialog.Title>
          <Card className="max-h-[60vh] overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: content }} />
          </Card>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}