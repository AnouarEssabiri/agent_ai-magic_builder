// 
//llama-document-parser.ts
import { LlamaModel, LlamaContext, LlamaChatSession } from 'node-llama-cpp';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parsePptx } from './pptx-parser';
import { parseDocx, extractDocxMetadata } from './docx-parser';
import xml2js from 'xml2js';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { 
  DocumentType, 
  AnalysisType, 
  OutputFormat, 
  AnalysisResult, 
  DocumentAnalyzerConfig, 
  CommonAnalysisOptions 
} from '../document-analyzer-interface';

/**
 * Document analysis result structure
 */
export interface DocumentAnalysisResult {
  summary: string;
  keywords: Array<{ word: string; relevance: number }>;
  entities: Array<{ name: string; type: string; mentions: number; relevance: number }>;
  structure: { sections: Array<{ title: string; level: number; content: string }> };
  optimizations: Array<{ type: string; description: string; suggestion: string; location?: string }>;
  mermaidDiagrams?: Array<{ title: string; description: string; code: string }>;
  language: string;
  metadata?: Record<string, any>;
  rawText?: string;
}

/**
 * Configuration options for Llama Document Parser
 */
export interface LlamaDocumentParserConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
  preserveRawText?: boolean;
}

/**
 * Analysis options for document processing
 */
export interface AnalysisOptions {
  types: AnalysisType[];
  outputFormat: OutputFormat;
  generateMermaid?: boolean;
  detailedMode?: boolean;
}

/**
 * Document Parser class that uses Llama for analysis
 */
export class LlamaDocumentParser {
  private model: LlamaModel;
  private context: LlamaContext;
  private session: LlamaChatSession;
  private modelPath: string;

  /**
   * Initialize the document parser with model path and optional config
   */
  constructor(config: DocumentAnalyzerConfig) {
    this.modelPath = config.modelPath || 'models/llama-2-7b-chat.gguf';
    
    // @ts-ignore - node-llama-cpp types are not fully accurate
    this.model = new LlamaModel({
      modelPath: this.modelPath,
      contextSize: config.contextSize || 4096,
      batchSize: config.batchSize || 512,
    });
    
    // @ts-ignore - node-llama-cpp types are not fully accurate
    this.context = new LlamaContext({ model: this.model });
    // @ts-ignore - node-llama-cpp types are not fully accurate
    this.session = new LlamaChatSession({ context: this.context });
  }

  /**
   * Analyze a document from file path
   */
  public async analyzeDocument(
    filePath: string, 
    options: CommonAnalysisOptions
  ): Promise<AnalysisResult> {
    // Determine file type from extension
    const fileExt = path.extname(filePath).toLowerCase().substring(1) as DocumentType;
    
    console.log(`Analyzing document: ${filePath} with extension ${fileExt}`);
    
    // Extract content based on file type
    const content = await this.extractContent(filePath, fileExt);
    
    // Detect language
    const language = await this.detectLanguage(content);
    console.log(`Document language: ${language}`);
    
    // Perform requested analyses
    const result = await this.performAnalysis(content, fileExt, options, language);
    
    return result;
  }

  /**
   * Analyze document content directly (when already loaded)
   */
  public async analyzeContent(
    content: string,
    fileType: DocumentType,
    options: CommonAnalysisOptions
  ): Promise<AnalysisResult> {
    // Detect language
    const language = await this.detectLanguage(content);
    
    // Perform requested analyses
    return this.performAnalysis(content, fileType, options, language);
  }

  /**
   * Extract content from different file types
   */
  private async extractContent(filePath: string, fileType: DocumentType): Promise<string> {
    try {
      console.log(`Extracting content from ${filePath} (${fileType})`);
      const fileBuffer = await fs.readFile(filePath);
      
      switch (fileType) {
        case 'pdf':
          try {
            // Dynamic import to avoid issues with pdf-parse
            const pdfParse = await import('pdf-parse');
            const extractPdf = pdfParse.default;
            const pdfData = await extractPdf(fileBuffer);
            return pdfData.text;
          } catch (pdfError) {
            console.warn('PDF parsing failed, falling back to raw text:', (pdfError as Error).message);
            return fileBuffer.toString('utf-8');
          }
        
        case 'docx':
          return parseDocx(fileBuffer);
        
        case 'pptx':
          console.log('Parsing PowerPoint file...');
          return parsePptx(fileBuffer);
        
        case 'txt':
          return fileBuffer.toString('utf-8');
        
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      throw new Error(`Failed to extract content: ${(error as Error).message}`);
    }
  }

  /**
   * Detect language of text content
   */
  private async detectLanguage(text: string): Promise<string> {
    try {
      const prompt = `Detect the language of the following text. Reply with only the language name (e.g., "English", "Spanish", etc.):

${text.substring(0, 1000)}`;

      const response = await this.session.prompt(prompt);
      return response.trim();
    } catch (error) {
      console.warn('Language detection failed:', (error as Error).message);
      return 'unknown';
    }
  }

  /**
   * Determine file type from extension
   */
  private getFileTypeFromExtension(extension: string): DocumentType {
    switch (extension.toLowerCase()) {
      case '.pdf':
        return 'pdf';
      case '.docx':
      case '.doc':
        return 'docx';
      case '.pptx':
      case '.ppt':
        return 'pptx';
      case '.txt':
      case '.md':
      case '.csv':
      case '.json':
      case '.xml':
      case '.html':
      case '.htm':
        return 'txt';
      default:
        return 'unknown';
    }
  }

  /**
   * Generate a prompt for Llama based on analysis types
   */
  private generateAnalysisPrompt(
    content: string, 
    fileType: DocumentType, 
    options: CommonAnalysisOptions,
    language: string
  ): string {
    const analysisTypes = options.types.includes('all') 
      ? ['summary', 'keywords', 'entities', 'structure', 'optimization']
      : options.types;
    
    let prompt = `<|system|>
You are an expert document analyzer with advanced capabilities in understanding and extracting information from documents.
Your analysis is thorough, accurate, and structured precisely according to the requested format.
</s>

<|user|>
Analyze the following ${fileType} document content. The document language appears to be ${language}.

Please perform these analysis types: ${analysisTypes.join(', ')}.
${options.detailedMode ? 'Provide a detailed analysis.' : 'Provide a concise analysis.'}

Format your response in ${options.outputFormat}.

${options.outputFormat === 'json' ? `Return a valid JSON object with this structure:
{
  "summary": "A comprehensive summary of the document content",
  "keywords": [{"word": "keyword", "relevance": 0-1 score}],
  "entities": [{"name": "entity name", "type": "person/organization/date/etc", "mentions": count, "relevance": 0-1 score}],
  "structure": {"sections": [{"title": "section title", "level": hierarchy level, "content": "brief content description"}]},
  "optimizations": [{"type": "structure/clarity/content/formatting", "description": "issue description", "suggestion": "improvement suggestion"}]
  ${options.generateMermaid ? `,
  "mermaidDiagrams": [
    {
      "title": "Diagram title",
      "description": "What this diagram shows",
      "code": "mermaid diagram code"
    }
  ]` : ''}
}` : ''}

${options.outputFormat === 'markdown' ? 'Use markdown headings to structure your response.' : ''}
${options.generateMermaid && options.outputFormat === 'markdown' ? 'Include mermaid diagram code blocks to visualize the document structure.' : ''}

Document content:
${content.substring(0, 15000)}
</s>

<|assistant|>`;
    
    return prompt;
  }

  /**
   * Perform the analysis using Llama
   */
  private async performAnalysis(
    content: string, 
    fileType: DocumentType, 
    options: CommonAnalysisOptions,
    language: string,
    metadata?: Record<string, any>
  ): Promise<DocumentAnalysisResult> {
    try {
      const prompt = this.generateAnalysisPrompt(content, fileType, options, language);
      
      const responseText = await this.session.prompt(prompt);
      
      let result: DocumentAnalysisResult;
      
      if (options.outputFormat === 'json') {
        try {
          // Parse the JSON response
          const jsonResponse = this.extractJsonFromResponse(responseText);
          result = {
            ...jsonResponse,
            language: language,
            metadata: metadata || {}
          };
        } catch (error) {
          throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
        }
      } else {
        // Format non-JSON response into our result structure
        result = {
          summary: responseText,
          keywords: [],
          entities: [],
          structure: { sections: [] },
          optimizations: [],
          language: language,
          metadata: metadata || {}
        };
      }
      
      // Generate mermaid diagrams if requested and not already included
      if (options.generateMermaid && (!result.mermaidDiagrams || result.mermaidDiagrams.length === 0)) {
        result.mermaidDiagrams = await this.generateMermaidDiagrams(result);
      }
      
      // Include raw text if requested
      if (options.preserveRawText) {
        result.rawText = content;
      }
      
      return result;
    } catch (error) {
      throw new Error(`Analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extract JSON from response text
   */
  private extractJsonFromResponse(text: string): any {
    // Find JSON content between braces
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }
    
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('JSON parsing failed, attempting to fix malformed JSON');
      
      // Try to fix common JSON issues
      let fixedJson = jsonMatch[0]
        .replace(/,(\s*[\}\]])/g, '$1')  // Remove trailing commas
        .replace(/'/g, '"')              // Replace single quotes with double quotes
        .replace(/\n/g, ' ');            // Remove newlines
        
      return JSON.parse(fixedJson);
    }
  }

  /**
   * Generate mermaid diagrams for document visualization
   */
  private async generateMermaidDiagrams(result: Partial<DocumentAnalysisResult>): Promise<Array<{ title: string; description: string; code: string }>> {
    try {
      // Structure diagram based on document sections
      const structureDiagram = this.generateStructureDiagram(result.structure?.sections || []);
      
      // Entity relationship diagram based on entities
      const entityDiagram = this.generateEntityDiagram(result.entities || []);
      
      return [
        {
          title: 'Document Structure',
          description: 'Visualization of document sections and hierarchy',
          code: structureDiagram
        },
        {
          title: 'Entity Relationships',
          description: 'Key entities and their relationships in the document',
          code: entityDiagram
        }
      ];
    } catch (error) {
      console.warn('Failed to generate mermaid diagrams:', (error as Error).message);
      return [];
    }
  }

  /**
   * Generate a mermaid diagram for document structure
   */
  private generateStructureDiagram(sections: Array<{ title: string; level: number; content: string }>): string {
    if (!sections || sections.length === 0) {
      return 'graph TD\n  A[Document] --> B[No structured sections found]';
    }

    let diagram = 'graph TD\n';
    let nodeIds: Record<string, string> = {};
    let nodeCounter = 0;

    // Create nodes for each section
    sections.forEach((section, index) => {
      const nodeId = `N${nodeCounter++}`;
      // Clean title for node label
      const cleanTitle = section.title.replace(/"/g, "'").substring(0, 30);
      diagram += `  ${nodeId}["${cleanTitle}${cleanTitle.length < section.title.length ? '...' : ''}"]\n`;
      nodeIds[index.toString()] = nodeId;
    });

    // Add connections based on section levels
    let lastNodesByLevel: Record<number, string> = {};
    
    sections.forEach((section, index) => {
      const currentNodeId = nodeIds[index.toString()];
      
      if (section.level === 1) {
        // Top level connects to root if we had one
        if (index > 0) {
          diagram += `  Document --> ${currentNodeId}\n`;
        }
      } else {
        // Find parent (closest section with lower level)
        let parentLevel = section.level - 1;
        while (parentLevel >= 1 && !lastNodesByLevel[parentLevel]) {
          parentLevel--;
        }
        
        if (parentLevel >= 1 && lastNodesByLevel[parentLevel]) {
          diagram += `  ${lastNodesByLevel[parentLevel]} --> ${currentNodeId}\n`;
        } else {
          // Fallback: connect to previous section
          if (index > 0) {
            diagram += `  ${nodeIds[(index - 1).toString()]} --> ${currentNodeId}\n`;
          }
        }
      }
      
      // Update last node for this level
      lastNodesByLevel[section.level] = currentNodeId;
    });

    return diagram;
  }

  /**
   * Generate a mermaid diagram for entity relationships
   */
  private generateEntityDiagram(entities: Array<{ name: string; type: string; mentions: number; relevance: number }>): string {
    if (!entities || entities.length === 0) {
      return 'graph LR\n  A[Document] --> B[No entities detected]';
    }

    // Limit to top entities to avoid overcrowding
    const topEntities = entities
      .filter(e => e.relevance > 0.5)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);

    if (topEntities.length === 0) {
      return 'graph LR\n  A[Document] --> B[No significant entities detected]';
    }

    let diagram = 'graph LR\n';
    
    // Create nodes for document and entities
    diagram += '  Doc[Document]\n';
    
    // Group entities by type
    const entitiesByType: Record<string, Array<{ name: string; mentions: number; relevance: number }>> = {};
    
    topEntities.forEach(entity => {
      if (!entitiesByType[entity.type]) {
        entitiesByType[entity.type] = [];
      }
      entitiesByType[entity.type].push({
        name: entity.name,
        mentions: entity.mentions,
        relevance: entity.relevance
      });
    });
    
    // Create subgraphs for each entity type
    let entityCounter = 0;
    Object.entries(entitiesByType).forEach(([type, typeEntities]) => {
      diagram += `  subgraph ${type}\n`;
      
      typeEntities.forEach(entity => {
        const nodeId = `E${entityCounter++}`;
        // Clean name for node label
        const cleanName = entity.name.replace(/"/g, "'").substring(0, 20);
        diagram += `    ${nodeId}["${cleanName}${cleanName.length < entity.name.length ? '...' : ''}"]\n`;
        
        // Connect to document with weight based on mentions
        const lineStyle = entity.relevance > 0.8 ? '===' : 
                         entity.relevance > 0.6 ? '==' : '--';
        
        diagram += `    Doc ${lineStyle}> ${nodeId}\n`;
      });
      
      diagram += '  end\n';
    });
    
    return diagram;
  }

  /**
   * Extract metadata from document
   */
  private async extractMetadata(filePath: string, fileType: DocumentType): Promise<Record<string, any>> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      
      switch (fileType) {
        case 'pdf':
          // For PDF metadata, we'd use pdf-parse or another library
          return { format: 'pdf' };
          
        case 'docx':
          return await extractDocxMetadata(fileBuffer);
          
        case 'pptx':
          // Extract PPTX metadata
          const zip = await JSZip.loadAsync(fileBuffer);
          const coreFile = zip.file('docProps/core.xml');
          
          if (coreFile) {
            const coreXml = await coreFile.async('string');
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(coreXml);
            
            // Extract core properties
            const coreProps = result['cp:coreProperties'] || {};
            return {
              title: coreProps['dc:title'] || '',
              creator: coreProps['dc:creator'] || '',
              lastModifiedBy: coreProps['cp:lastModifiedBy'] || '',
              created: coreProps['dcterms:created'] || '',
              modified: coreProps['dcterms:modified'] || '',
              format: 'pptx'
            };
          }
          return { format: 'pptx' };
          
        default:
          return { format: fileType };
      }
    } catch (error) {
      console.warn('Metadata extraction failed:', (error as Error).message);
      return { format: fileType, error: (error as Error).message };
    }
  }

  /**
   * Close and cleanup resources when done
   */
  public async close(): Promise<void> {
    // Cleanup model resources
    if (this.context) {
      // @ts-ignore - node-llama-cpp types are not fully accurate
      this.context.free();
    }
    if (this.model) {
      // @ts-ignore - node-llama-cpp types are not fully accurate
      this.model.free();
    }
  }
}

// Export the Document Parser class
export default LlamaDocumentParser;