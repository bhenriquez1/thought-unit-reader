import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  content: string; // HTML string (parsed)
}

export default function PreviewModal({ open, onClose, title = "Preview", content }: PreviewModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const links = ref.current.querySelectorAll("a[href^='#chapter-']");
      links.forEach((link) => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const id = (link as HTMLAnchorElement).getAttribute("href")?.slice(1);
          const target = document.getElementById(id!);
          if (target) target.scrollIntoView({ behavior: "smooth" });
        });
      });
    }
  }, [content]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-full w-full mt-4 border rounded">
          <div
            ref={ref}
            className="prose dark:prose-invert max-w-none px-4 py-2"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </ScrollArea>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}