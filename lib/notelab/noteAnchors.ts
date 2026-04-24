export type NoteAnchor = {
  id: string;
  docId: string;
  pageNumber: number;
  anchorType: 'paragraph' | 'figure' | 'caption' | 'section';
  sourceAnchorId: string;
  rect?: { x: number; y: number; width: number; height: number };
  label?: string;
};
