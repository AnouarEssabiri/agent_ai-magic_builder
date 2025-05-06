import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parsePptx } from './parsers/pptx-parser';
import { parseDocx } from './parsers/docx-parser';
import { 
  DocumentType, 
  AnalysisType, 
  OutputFormat, 
  AnalysisResult, 
  DocumentAnalyzerConfig, 
  CommonAnalysisOptions 
} from './document-analyzer-interface';

/**
 * Modified version of the code to fix PDF parsing issues
 */

/**
 * Named entity from document
 */
export interface Entity {
  name: string;
  type: string;
  mentions: number;
  relevance: number;
}

/**
 * Keyword with relevance score
 */
export interface Keyword {
  word: string;
  relevance: number;
}

/**
 * Document structure representation
 */
export interface DocumentStructure {
  sections: {
    title: string;
    level: number;
    content: string;
  }[];
}

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
  type: 'structure' | 'clarity' | 'content' | 'formatting';
  description: string;
  suggestion: string;
  location?: string;
}

/**
 * Main Document Analyzer class that integrates with Gemini
 */
export class GeminiDocumentAnalyzer {
  private model: GenerativeModel;
  private apiKey: string;
  private modelName: string;

  /**
   * Initialize the document analyzer with API key and optional config
   */
  constructor(config: DocumentAnalyzerConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required for GeminiDocumentAnalyzer');
    }
    this.apiKey = config.apiKey;
    this.modelName = config.model || 'gemini-1.5-pro';
    
    const genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: config.temperature || 0.2, 
        maxOutputTokens: config.maxTokens || 8192,
      }
    });
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

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      return response.text().trim();
    } catch (error) {
      console.warn('Language detection failed:', (error as Error).message);
      return 'unknown';
    }
  }

  /**
   * Generate the prompt for Gemini based on analysis types
   */
  private generatePrompt(
    content: string, 
    fileType: DocumentType, 
    options: CommonAnalysisOptions,
    language: string
  ): string {
    const analysisTypes = options.types.includes('all') 
      ? ['summary', 'keywords', 'entities', 'structure', 'optimization']
      : options.types;
    
    let prompt = `You are an expert document analyzer. Analyze the following ${fileType} document content. `;
    prompt += `The document is written in ${language}. `;
    
    prompt += `\nPerform the following types of analysis: ${analysisTypes.join(', ')}. `;
    
    if (options.detailedMode) {
      prompt += `\nProvide a detailed analysis. `;
    }
    
    prompt += `\nFormat your response in ${options.outputFormat}. `;
    
    if (options.generateMermaid && options.outputFormat === 'json') {
      prompt += `\nInclude a mermaid diagram structure in your JSON response that represents the document structure or key concepts as a flowchart or mind map. `;
    }
    
    if (options.outputFormat === 'json') {
      prompt += `\nReturn a valid JSON object matching this structure:
      {
        "summary": "Concise summary of the document",
        "keywords": [{"word": "keyword", "relevance": 0-1 score}],
        "entities": [{"name": "entity name", "type": "person/organization/date/etc", "mentions": count, "relevance": 0-1 score}],
        "structure": {"sections": [{"title": "section title", "level": hierarchy level, "content": "brief content description"}]},
        "optimizations": [{"type": "structure/clarity/content/formatting", "description": "issue description", "suggestion": "improvement suggestion"}],
        "language": "detected language"`;
    
      if (options.generateMermaid) {
        prompt += `,
        "mermaidDiagrams": [
          {
            "title": "Diagram title",
            "description": "What this diagram shows",
            "code": "mermaid diagram code"
          }
        ]`;
      }
    
      prompt += `\n}`;
    }
    
    prompt += `\n\nDocument content:\n${content.substring(0, 15000)}`; // Truncate if too long
    
    return prompt;
  }

  /**
   * Perform the actual analysis using Gemini
   */
  private async performAnalysis(
    content: string, 
    fileType: DocumentType, 
    options: CommonAnalysisOptions,
    language: string
  ): Promise<AnalysisResult> {
    try {
      const prompt = this.generatePrompt(content, fileType, options, language);
      
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();
      
      if (options.outputFormat === 'json') {
        try {
          // Parse the JSON response
          const jsonResponse = this.extractJsonFromResponse(responseText);
          return {
            ...jsonResponse,
            language: language
          } as AnalysisResult;
        } catch (error) {
          throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
        }
      } else {
        // Format non-JSON response into our result structure
        return this.formatTextResponse(responseText, language);
      }
    } catch (error) {
      throw new Error(`Analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Extract JSON from response text which might contain markdown or other formatting
   */
  private extractJsonFromResponse(text: string): any {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) || 
                     text.match(/(\{[\s\S]*?\})/);
    
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // If no json block found, try parsing the whole text
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Could not extract valid JSON from the response');
    }
  }

  /**
   * Format a text/markdown response into our result structure
   */
  private formatTextResponse(text: string, language: string): AnalysisResult {
    // Basic structure for results from text response
    return {
      summary: text,
      keywords: [],
      entities: [],
      structure: { sections: [] },
      optimizations: [],
      language: language
    };
  }
  
  /**
   * Generate a mermaid diagram from analysis results
   */
  public async generateMermaidDiagrams(analysis: AnalysisResult): Promise<Array<{ title: string, description: string, code: string }>> {
    // If already present, return existing
    if (analysis.mermaidDiagrams && analysis.mermaidDiagrams.length > 0) {
      return analysis.mermaidDiagrams;
    }
  
    const prompts = [
      {
        title: "Document Structure",
        description: "Hierarchy and section layout of the document",
        prompt: `
          Generate a Mermaid diagram that shows the hierarchical structure of the document.
          Use a flowchart or mindmap. Use section titles and nesting based on the following structure:
          ${JSON.stringify(analysis.structure)}
          Return only the mermaid code.
        `
      },
      {
        title: "Key Concepts Map",
        description: "Mind map of main concepts and their relationships from the summary and keywords",
        prompt: `
          Create a Mermaid mindmap showing the key concepts of this document.
          Base it on the following summary and keywords:
          Summary: ${analysis.summary}
          Keywords: ${analysis.keywords.map(k => k.word).join(', ')}
          Return only the mermaid code.
        `
      },
      {
        title: "Entity Relationship Diagram",
        description: "Shows how named entities are related (persons, organizations, dates, etc.)",
        prompt: `
          Build a Mermaid flowchart that visualizes relationships between these entities:
          ${analysis.entities.map(e => `${e.name} (${e.type})`).join(', ')}
          Try to connect entities logically (e.g., person works at org, event on date).
          Return only the mermaid code.
        `
      }
    ];
  
    const diagrams: Array<{ title: string, description: string, code: string }> = [];
  
    for (const item of prompts) {
      try {
        const result = await this.model.generateContent(item.prompt);
        const code = result.response.text().replace(/```mermaid|```/g, '').trim();
        diagrams.push({
          title: item.title,
          description: item.description,
          code
        });
      } catch (error) {
        console.error(`Failed to generate diagram "${item.title}":`, (error as Error).message);
      }
    }
  
    return diagrams;
  }
}