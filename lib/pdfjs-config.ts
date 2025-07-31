// lib/pdf-worker-config.ts

/**
 * Helper function to configure PDF.js worker in a Next.js-friendly way
 * This function should be called in a useEffect hook in client components
 */
export const configurePdfWorker = async (): Promise<void> => {
  try {
    // Dynamically import pdfjs in a client-side context
    const { pdfjs } = await import('react-pdf');
    
    // Check if worker source is already configured
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      // Use CDN version of the worker that matches the package version
      pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
      console.log('PDF.js worker configured successfully');
    }
  } catch (error) {
    console.error('Failed to configure PDF.js worker:', error);
  }
};

/**
 * Function to get the URL to the PDF.js worker
 * This can be used in places where the worker URL is needed directly
 */
export const getPdfWorkerUrl = async (): Promise<string> => {
  try {
    const { pdfjs } = await import('react-pdf');
    return `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  } catch (error) {
    console.error('Failed to get PDF.js worker URL:', error);
    // Fallback to a specific version if dynamic import fails
    return '//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }
};