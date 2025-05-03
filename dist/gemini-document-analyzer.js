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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiDocumentAnalyzer = void 0;
const generative_ai_1 = require("@google/generative-ai");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const pptx_parser_1 = require("./parsers/pptx-parser");
const docx_parser_1 = require("./parsers/docx-parser");
const language_detector_1 = require("./utils/language-detector");
/**
 * Main Document Analyzer class that integrates with Gemini
 */
class GeminiDocumentAnalyzer {
    /**
     * Initialize the document analyzer with API key and optional config
     */
    constructor(config) {
        this.apiKey = config.apiKey;
        this.modelName = config.model || 'gemini-1.5-pro';
        const genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
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
    async analyzeDocument(filePath, options) {
        // Determine file type from extension
        const fileExt = path.extname(filePath).toLowerCase().substring(1);
        // Extract content based on file type
        const content = await this.extractContent(filePath, fileExt);
        // Detect language
        const language = await (0, language_detector_1.detectLanguage)(content);
        // Perform requested analyses
        const result = await this.performAnalysis(content, fileExt, options, language);
        return result;
    }
    /**
     * Analyze document content directly (when already loaded)
     */
    async analyzeContent(content, fileType, options) {
        // Detect language
        const language = await (0, language_detector_1.detectLanguage)(content);
        // Perform requested analyses
        return this.performAnalysis(content, fileType, options, language);
    }
    /**
     * Extract content from different file types
     */
    async extractContent(filePath, fileType) {
        try {
            const fileBuffer = await fs.readFile(filePath);
            switch (fileType) {
                case 'pdf':
                    const pdfData = await (0, pdf_parse_1.default)(fileBuffer);
                    return pdfData.text;
                case 'docx':
                    return (0, docx_parser_1.parseDocx)(fileBuffer);
                case 'pptx':
                    return (0, pptx_parser_1.parsePptx)(fileBuffer);
                case 'txt':
                    return fileBuffer.toString('utf-8');
                default:
                    throw new Error(`Unsupported file type: ${fileType}`);
            }
        }
        catch (error) {
            throw new Error(`Failed to extract content: ${error.message}`);
        }
    }
    /**
     * Generate the prompt for Gemini based on analysis types
     */
    generatePrompt(content, fileType, options, language) {
        const analysisTypes = options.types.includes('all')
            ? ['summary', 'keywords', 'entities', 'structure', 'optimization']
            : options.types;
        let prompt = `You are an expert document analyzer. Analyze the following ${fileType} document content. `;
        // prompt += `The document is written in ${language}. `;
        prompt += `\nPerform the following types of analysis: ${analysisTypes.join(', ')}. `;
        if (options.detailedMode) {
            prompt += `\nProvide a detailed analysis. `;
        }
        prompt += `\nFormat your response in ${options.outputFormat}. `;
        if (options.generateMermaid && options.outputFormat === 'json') {
            prompt += `\nInclude a mermaid diagrammes structure in your JSON response that represents the document structure or key concepts as a flowchart or mind map. `;
        }
        if (options.outputFormat === 'json') {
            prompt += `\nReturn a valid JSON object matching this structure:
      {
        "summary": "Concise summary of the document",
        "keywords": [{"word": "keyword", "relevance": 0-1 score}],
        "entities": [{"name": "entity name", "type": "person/organization/date/etc", "mentions": count, "relevance": 0-1 score}],
        "structure": {"sections": [{"title": "section title", "level": hierarchy level, "content": "brief content description"}]},
        "optimizations": [{"type": "structure/clarity/content/formatting", "description": "issue description", "suggestion": "improvement suggestion"}],
        "language": "detected language"
      }`;
            if (options.generateMermaid) {
                prompt += `,\n"mermaidDiagram": "the mermaid diagram code as a string"`;
            }
        }
        prompt += `\n\nDocument content:\n${content.substring(0, 15000)}`; // Truncate if too long
        return prompt;
    }
    /**
     * Perform the actual analysis using Gemini
     */
    async performAnalysis(content, fileType, options, language) {
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
                    };
                }
                catch (error) {
                    throw new Error(`Failed to parse JSON response: ${error.message}`);
                }
            }
            else {
                // Format non-JSON response into our result structure
                return this.formatTextResponse(responseText, language);
            }
        }
        catch (error) {
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }
    /**
     * Extract JSON from response text which might contain markdown or other formatting
     */
    extractJsonFromResponse(text) {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
            text.match(/(\{[\s\S]*?\})/);
        if (jsonMatch && jsonMatch[1]) {
            return JSON.parse(jsonMatch[1]);
        }
        // If no json block found, try parsing the whole text
        try {
            return JSON.parse(text);
        }
        catch (e) {
            throw new Error('Could not extract valid JSON from the response');
        }
    }
    /**
     * Format a text/markdown response into our result structure
     */
    formatTextResponse(text, language) {
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
    async generateMermaidDiagram(analysis) {
        // If we already have a mermaid diagram, return it
        if (analysis.mermaidDiagram) {
            return analysis.mermaidDiagram;
        }
        // Otherwise, generate a new one using Gemini
        const prompt = `
    Generate a mermaid diagram representing the structure and key concepts of this document. 
    Use flowchart or mindmap format.
    
    Document summary: ${analysis.summary}
    
    Key entities: ${analysis.entities.map(e => e.name).join(', ')}
    
    Structure: ${JSON.stringify(analysis.structure)}
    
    Return only the mermaid code without any explanation or markdown formatting.
    `;
        try {
            const result = await this.model.generateContent(prompt);
            const mermaidCode = result.response.text().replace(/```mermaid|```/g, '').trim();
            return mermaidCode;
        }
        catch (error) {
            throw new Error(`Failed to generate mermaid diagram: ${error.message}`);
        }
    }
}
exports.GeminiDocumentAnalyzer = GeminiDocumentAnalyzer;
