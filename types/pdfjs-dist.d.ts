// types/pdfjs-dist.d.ts

declare module "pdfjs-dist/build/pdf" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(
    src: string | Uint8Array | PDFSource
  ): PDFLoadingTask<PDFDocumentProxy>;

  export interface PDFSource {
    data?: Uint8Array;
    url?: string;
    httpHeaders?: Record<string, string>;
    withCredentials?: boolean;
  }

  export interface PDFLoadingTask<T> {
    promise: Promise<T>;
    destroy(): void;
    onProgress?: (progressData: { loaded: number; total: number }) => void;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    getMetadata(): Promise<any>;
    getOutline(): Promise<any>;
    getTextContent(): Promise<any>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
    render(params: RenderParameters): RenderTask;
  }

  export interface TextContent {
    items: TextItem[];
    styles: Record<string, any>;
  }

  export interface TextItem {
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
  }

  export interface RenderParameters {
    canvasContext: CanvasRenderingContext2D;
    viewport: PageViewport;
  }

  export interface RenderTask {
    promise: Promise<void>;
    cancel(): void;
  }

  export interface PageViewport {
    width: number;
    height: number;
    transform: number[];
    clone(options: any): PageViewport;
  }
}

declare module "pdfjs-dist/build/pdf.worker.entry" {
  const worker: any;
  export = worker;
}