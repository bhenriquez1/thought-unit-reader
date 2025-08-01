// Place this file in your project root or types directory

declare module 'pdfjs-dist/build/pdf' {
  export const getDocument: any;
  export const GlobalWorkerOptions: any;
  export const version: string;
  export default {
    getDocument,
    GlobalWorkerOptions,
    version
  };
}

declare module 'pdfjs-dist/build/pdf.worker.entry' {
  const worker: any;
  export default worker;
}

// This will make TypeScript happy when importing from react-pdf
declare module 'react-pdf' {
  export const Document: any;
  export const Page: any;
  export const pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: string;
    };
    version: string;
  };
}

declare module 'react-pdf/dist/esm/pdfjs' {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };
  export const version: string;
}