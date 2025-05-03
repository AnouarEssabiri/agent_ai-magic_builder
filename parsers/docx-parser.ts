import mammoth from 'mammoth';
import JSZip from 'jszip';
import xml2js from 'xml2js';

/**
 * Parse DOCX file and extract text content
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.warn('Failed to parse DOCX:', (error as Error).message);
    return 'Failed to extract text from DOCX file.';
  }
}

/**
 * Extract metadata from DOCX file
 */
export async function extractDocxMetadata(buffer: Buffer): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {};
  
  try {
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(buffer);
    const corePropFile = zipContent.file('docProps/core.xml');
    
    if (corePropFile) {
      const propXml = await corePropFile.async('text');
      const propData = await xml2js.parseStringPromise(propXml);
      
      if (propData['cp:coreProperties']) {
        const coreProp = propData['cp:coreProperties'];
        metadata.title = coreProp['dc:title']?.[0] || '';
        metadata.creator = coreProp['dc:creator']?.[0] || '';
        metadata.lastModifiedBy = coreProp['cp:lastModifiedBy']?.[0] || '';
        metadata.created = coreProp['dcterms:created']?.[0] || '';
        metadata.modified = coreProp['dcterms:modified']?.[0] || '';
      }
    }
  } catch (error) {
    console.warn('Failed to extract DOCX metadata:', (error as Error).message);
  }
  
  return metadata;
}