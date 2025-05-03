/**
 * Common document types supported by both analyzers
 */
export type DocumentType = 'pdf' | 'docx' | 'pptx' | 'txt' | 'unknown';

/**
 * Common analysis types supported by both analyzers
 */
export type AnalysisType = 
  | 'summary' 
  | 'keywords' 
  | 'entities' 
  | 'structure' 
  | 'optimization'
  | 'all';

/**
 * Common output format options
 */
export type OutputFormat = 'markdown' | 'json' | 'mermaid' | 'text';

/**
 * Common analysis result structure
 */
export interface AnalysisResult {
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
 * Common configuration options for document analyzers
 */
export interface DocumentAnalyzerConfig {
  apiKey?: string;
  model?: string;
  modelPath?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  preserveRawText?: boolean;
  contextSize?: number;
  batchSize?: number;
}

/**
 * Common analysis options
 */
export interface CommonAnalysisOptions {
  types: AnalysisType[];
  outputFormat: OutputFormat;
  generateMermaid?: boolean;
  detailedMode?: boolean;
  preserveRawText?: boolean;
} 