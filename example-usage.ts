import { GeminiDocumentAnalyzer } from './gemini-document-analyzer';
import { LlamaDocumentParser } from './parsers/llama-document-parser';
import { CommonAnalysisOptions, DocumentAnalyzerConfig, AnalysisResult } from './document-analyzer-interface';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AnalyzerType = 'gemini' | 'llama';

// Example function to demonstrate using the analyzer
async function analyzeDocumentExample(
  filePath: string,
  analyzerType: AnalyzerType = 'gemini'
): Promise<void> {
  // Resolve the file path relative to the current directory
  const resolvedPath = path.resolve(process.cwd(), filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  // Initialize the appropriate analyzer
  let analyzer;
  const commonConfig: DocumentAnalyzerConfig = {
    apiKey: analyzerType === 'gemini' 
      ? process.env.GEMINI_API_KEY || ''
      : process.env.LLAMA_API_KEY || '',
    model: analyzerType === 'gemini' ? 'gemini-1.5-pro' : 'llama-3-70b-instruct',
    temperature: 0.2,
  };

  if (analyzerType === 'gemini') {
    analyzer = new GeminiDocumentAnalyzer(commonConfig);
  } else {
    analyzer = new LlamaDocumentParser(commonConfig);
  }

  // Configure analysis options
  const options: CommonAnalysisOptions = {
    types: ['all'], // Perform all types of analysis
    outputFormat: 'json', // Get structured JSON output
    generateMermaid: true, // Generate mermaid diagram
    detailedMode: true, // Get detailed analysis
  };

  try {
    console.log(`Analyzing document: ${path.basename(resolvedPath)} using ${analyzerType.toUpperCase()}`);
    
    // Perform the analysis
    const result = await analyzer.analyzeDocument(resolvedPath, options);
    
    // Output the analysis results
    console.log('Analysis complete!');
    console.log(`Document Language: ${result.language}`);
    console.log(`Summary: ${result.summary.substring(0, 200)}...`);
    console.log(`Found ${result.keywords.length} keywords and ${result.entities.length} entities`);
    console.log(`Generated ${result.optimizations.length} optimization suggestions`);
    
    // Save the analysis to files
    const outputDir = path.join(process.cwd(), 'analysis-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    // Create a subdirectory for this analysis
    const analysisDir = path.join(outputDir, `${path.basename(resolvedPath)}-${analyzerType}`);
    if (!fs.existsSync(analysisDir)) {
      fs.mkdirSync(analysisDir);
    }
    
    // Save the full JSON results
    fs.writeFileSync(
      path.join(analysisDir, 'analysis.json'),
      JSON.stringify(result, null, 2)
    );
    
    // Save the summary as a markdown file
    fs.writeFileSync(
      path.join(analysisDir, 'summary.md'),
      generateMarkdownSummary(result)
    );
    
    // Save the mermaid diagrams
    result.mermaidDiagrams?.forEach((diagram, index) => {
      const fileName = `diagram-${index + 1}-${diagram.title.replace(/\s+/g, '_')}.mmd`;
      fs.writeFileSync(
        path.join(analysisDir, fileName),
        diagram.code,
        'utf-8'
      );
    });
    
    console.log(`Results saved to ${analysisDir}`);
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error; // Re-throw to handle in the main block
  }
}

/**
 * Generate a markdown summary from the analysis results
 */
function generateMarkdownSummary(result: AnalysisResult): string {
  let markdown = `# Document Analysis Summary\n\n`;
  
  // Add document language
  markdown += `**Language**: ${result.language}\n\n`;
  
  // Add summary
  markdown += `## Summary\n\n${result.summary}\n\n`;
  
  // Add keywords section
  markdown += `## Keywords\n\n`;
  if (result.keywords && result.keywords.length > 0) {
    const sortedKeywords = [...result.keywords].sort((a, b) => b.relevance - a.relevance);
    markdown += sortedKeywords
      .map(k => `- **${k.word}** (relevance: ${k.relevance.toFixed(2)})`)
      .join('\n');
  } else {
    markdown += '*No keywords extracted*';
  }
  markdown += '\n\n';
  
  // Add entities section
  markdown += `## Named Entities\n\n`;
  if (result.entities && result.entities.length > 0) {
    const groupedEntities = result.entities.reduce((acc: any, entity: any) => {
      if (!acc[entity.type]) {
        acc[entity.type] = [];
      }
      acc[entity.type].push(entity);
      return acc;
    }, {});
    
    for (const [type, entities] of Object.entries(groupedEntities)) {
      markdown += `### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
      for (const entity of entities as any[]) {
        markdown += `- **${entity.name}** (mentions: ${entity.mentions}, relevance: ${entity.relevance.toFixed(2)})\n`;
      }
      markdown += '\n';
    }
  } else {
    markdown += '*No entities extracted*\n\n';
  }
  
  // Add document structure
  markdown += `## Document Structure\n\n`;
  if (result.structure && result.structure.sections && result.structure.sections.length > 0) {
    for (const section of result.structure.sections) {
      const indent = '  '.repeat(section.level - 1);
      markdown += `${indent}- **${section.title}**\n`;
      if (section.content) {
        markdown += `${indent}  ${section.content}\n`;
      }
    }
  } else {
    markdown += '*No structure extracted*\n';
  }
  markdown += '\n';
  
  // Add optimization suggestions
  markdown += `## Optimization Suggestions\n\n`;
  if (result.optimizations && result.optimizations.length > 0) {
    for (const opt of result.optimizations) {
      markdown += `### ${opt.type.charAt(0).toUpperCase() + opt.type.slice(1)}\n\n`;
      markdown += `**Issue:** ${opt.description}\n\n`;
      markdown += `**Suggestion:** ${opt.suggestion}\n\n`;
      if (opt.location) {
        markdown += `**Location:** ${opt.location}\n\n`;
      }
    }
  } else {
    markdown += '*No optimization suggestions*\n\n';
  }
  
  // Add mermaid diagrams
  if (result.mermaidDiagrams && result.mermaidDiagrams.length > 0) {
    markdown += `## Document Diagrams\n\n`;
    for (const diagram of result.mermaidDiagrams) {
      markdown += `### ${diagram.title}\n\n`;
      markdown += `${diagram.description}\n\n`;
      markdown += '```mermaid\n' + diagram.code + '\n```\n\n';
    }
  }
  
  return markdown;
}

// Example CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Get file path and analyzer type from command line arguments
  const filePath = process.argv[2];
  const analyzerType = (process.argv[3] || 'gemini') as AnalyzerType;
  
  if (!filePath) {
    console.error('Please provide a file path');
    process.exit(1);
  }
  
  if (!['gemini', 'llama'].includes(analyzerType)) {
    console.error('Invalid analyzer type. Use "gemini" or "llama"');
    process.exit(1);
  }
  
  analyzeDocumentExample(filePath, analyzerType)
    .then(() => console.log('Analysis complete'))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}