"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const gemini_document_analyzer_1 = require("./gemini-document-analyzer");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Example function to demonstrate using the analyzer
async function analyzeDocumentExample(filePath) {
    // Initialize the analyzer with your API key
    const analyzer = new gemini_document_analyzer_1.GeminiDocumentAnalyzer({
        apiKey: process.env.GEMINI_API_KEY || '',
        model: 'gemini-1.5-pro', // Use the most capable model
        temperature: 0.2, // Lower temperature for more factual responses
    });
    // Configure analysis options
    const options = {
        types: ['all'], // Perform all types of analysis
        outputFormat: 'json', // Get structured JSON output
        generateMermaid: true, // Generate mermaid diagram
        detailedMode: true, // Get detailed analysis
    };
    try {
        console.log(`Analyzing document: ${path.basename(filePath)}`);
        // Perform the analysis
        const result = await analyzer.analyzeDocument(filePath, options);
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
        // Save the full JSON results
        fs.writeFileSync(path.join(outputDir, `${path.basename(filePath)}-analysis.json`), JSON.stringify(result, null, 2));
        // Save the summary as a markdown file
        fs.writeFileSync(path.join(outputDir, `${path.basename(filePath)}-summary.md`), generateMarkdownSummary(result));
        // Save the mermaid diagram if available
        if (result.mermaidDiagram) {
            fs.writeFileSync(path.join(outputDir, `${path.basename(filePath)}-diagram.mmd`), result.mermaidDiagram);
        }
        console.log(`Results saved to ${outputDir}`);
    }
    catch (error) {
        console.error('Analysis failed:', error);
    }
}
/**
 * Generate a markdown summary from the analysis results
 */
function generateMarkdownSummary(result) {
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
    }
    else {
        markdown += '*No keywords extracted*';
    }
    markdown += '\n\n';
    // Add entities section
    markdown += `## Named Entities\n\n`;
    if (result.entities && result.entities.length > 0) {
        const groupedEntities = result.entities.reduce((acc, entity) => {
            if (!acc[entity.type]) {
                acc[entity.type] = [];
            }
            acc[entity.type].push(entity);
            return acc;
        }, {});
        for (const [type, entities] of Object.entries(groupedEntities)) {
            markdown += `### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
            for (const entity of entities) {
                markdown += `- **${entity.name}** (mentions: ${entity.mentions}, relevance: ${entity.relevance.toFixed(2)})\n`;
            }
            markdown += '\n';
        }
    }
    else {
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
    }
    else {
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
    }
    else {
        markdown += '*No optimization suggestions*\n\n';
    }
    // Add mermaid diagram reference
    if (result.mermaidDiagram) {
        markdown += `## Document Structure Diagram\n\n`;
        markdown += '```mermaid\n' + result.mermaidDiagram + '\n```\n';
    }
    return markdown;
}
// Example CLI usage
if (require.main === module) {
    // Get file path from command line argument
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Please provide a file path');
        process.exit(1);
    }
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }
    analyzeDocumentExample(filePath)
        .then(() => console.log('Analysis complete'))
        .catch(err => console.error('Error:', err));
}
