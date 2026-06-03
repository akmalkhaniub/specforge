/**
 * Minimal typing for the deep import `pdf-parse/lib/pdf-parse.js`. We import the
 * library directly (not its index) to avoid the debug harness in index.js that
 * reads a sample PDF when the module is loaded as the entry point.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
