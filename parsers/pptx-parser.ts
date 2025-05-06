import * as fs from 'fs';
import JSZip from 'jszip';
import xml2js from 'xml2js';

/**
 * Parse PowerPoint (.pptx) files to extract text content
 * @param buffer The file buffer containing the .pptx file
 * @returns A promise that resolves to the extracted text content
 */
export async function parsePptx(buffer: Buffer): Promise<string> {
  try {
    // Load the .pptx file as a ZIP archive
    const zip = await JSZip.loadAsync(buffer);
    
    // Get all the slide XML files
    const slideFiles = Object.keys(zip.files).filter(
      (fileName) => fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml')
    );
    
    // Sort the slides by their number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
      return numA - numB;
    });
    
    const parser = new xml2js.Parser();
    let allText = '';
    
    // Process each slide
    for (const slideFile of slideFiles) {
      const slideXml = await zip.file(slideFile)?.async('text');
      
      if (!slideXml) continue;
      
      try {
        const result = await parser.parseStringPromise(slideXml);
        
        // Extract text from the slide
        const slideContent = extractTextFromSlide(result);
        allText += `\n--- Slide ${allText ? slideFiles.indexOf(slideFile) + 1 : 1} ---\n${slideContent}\n`;
      } catch (xmlError) {
        console.warn(`Error parsing slide ${slideFile}:`, xmlError);
      }
    }
    
    // Look for notes if available
    const noteFiles = Object.keys(zip.files).filter(
      (fileName) => fileName.startsWith('ppt/notesSlides/notesSlide') && fileName.endsWith('.xml')
    );
    
    if (noteFiles.length > 0) {
      allText += '\n--- Notes ---\n';
      
      for (const noteFile of noteFiles) {
        const noteXml = await zip.file(noteFile)?.async('text');
        
        if (!noteXml) continue;
        
        try {
          const result = await parser.parseStringPromise(noteXml);
          const noteContent = extractTextFromSlide(result);
          
          if (noteContent.trim()) {
            const slideNum = noteFile.match(/notesSlide(\d+)\.xml/)?.[1] || '';
            allText += `\nNote for Slide ${slideNum}:\n${noteContent}\n`;
          }
        } catch (xmlError) {
          console.warn(`Error parsing note ${noteFile}:`, xmlError);
        }
      }
    }
    
    return allText.trim();
  } catch (error) {
    throw new Error(`Failed to parse PPTX: ${(error as Error).message}`);
  }
}

/**
 * Helper function to recursively extract text from XML elements
 */
function extractTextFromSlide(obj: any): string {
  let text = '';
  
  // Find all text runs ('a:t' elements)
  if (obj && typeof obj === 'object') {
    if ('a:t' in obj) {
      // Direct text content
      const content = Array.isArray(obj['a:t']) 
        ? obj['a:t'].join(' ') 
        : obj['a:t'].toString();
      
      text += content + ' ';
    } else {
      // Recursively search through all properties
      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          for (const item of obj[key]) {
            text += extractTextFromSlide(item);
          }
        } else if (typeof obj[key] === 'object') {
          text += extractTextFromSlide(obj[key]);
        }
      }
    }
  }
  
  return text;
}

/**
 * Extract metadata from a PowerPoint file
 */
export async function extractPptxMetadata(buffer: Buffer): Promise<Record<string, any>> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const coreProps = zip.file('docProps/core.xml');
    const appProps = zip.file('docProps/app.xml');
    
    const metadata: Record<string, any> = {};
    
    if (coreProps) {
      const coreXml = await coreProps.async('text');
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(coreXml);
      
      // Extract core properties
      const cp = result['cp:coreProperties'];
      if (cp) {
        if (cp['dc:title']) metadata.title = cp['dc:title'][0];
        if (cp['dc:creator']) metadata.author = cp['dc:creator'][0];
        if (cp['dc:subject']) metadata.subject = cp['dc:subject'][0];
        if (cp['cp:lastModifiedBy']) metadata.lastModifiedBy = cp['cp:lastModifiedBy'][0];
        if (cp['dcterms:created']) metadata.created = cp['dcterms:created'][0];
        if (cp['dcterms:modified']) metadata.modified = cp['dcterms:modified'][0];
      }
    }
    
    if (appProps) {
      const appXml = await appProps.async('text');
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(appXml);
      
      // Extract extended properties
      const ep = result['Properties'];
      if (ep) {
        if (ep['Slides']) metadata.slides = parseInt(ep['Slides'][0]);
        if (ep['Words']) metadata.words = parseInt(ep['Words'][0]);
        if (ep['Company']) metadata.company = ep['Company'][0];
      }
    }
    
    return metadata;
  } catch (error) {
    console.warn('Failed to extract PPTX metadata:', (error as Error).message);
    return {};
  }
}

// Export the functions
export default parsePptx;