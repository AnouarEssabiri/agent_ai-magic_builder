"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePptx = parsePptx;
// import * as JSZip from 'jszip';
const xml2js_1 = require("xml2js");
const jszip_1 = __importDefault(require("jszip"));
const util_1 = require("util");
const parseXmlString = (0, util_1.promisify)(xml2js_1.parseString);
/**
 * Extract text content from a PPTX file
 */
async function parsePptx(buffer) {
    try {
        const zip = new jszip_1.default();
        const zipContent = await zip.loadAsync(buffer);
        // Find all slide XML files
        const slideFiles = Object.keys(zipContent.files).filter(fileName => fileName.startsWith('ppt/slides/slide') && fileName.endsWith('.xml'));
        let fullText = '';
        // Process each slide
        for (const slideFile of slideFiles) {
            const slideContent = await zipContent.file(slideFile)?.async('text');
            if (slideContent) {
                const parsedXml = await parseXmlString(slideContent);
                const textContent = extractTextFromPptxXml(parsedXml);
                fullText += `\n--- Slide ${slideFile.match(/slide(\d+)\.xml/)?.[1] || ''} ---\n`;
                fullText += textContent;
            }
        }
        return fullText;
    }
    catch (error) {
        throw new Error(`Failed to parse PPTX: ${error.message}`);
    }
}
/**
 * Extract text content from PPTX slide XML
 */
function extractTextFromPptxXml(parsedXml) {
    let text = '';
    // Navigate through the XML structure to find text
    try {
        const slideContent = parsedXml['p:sld']['p:cSld'][0];
        const shapeTree = slideContent['p:spTree'][0];
        // Process each shape (text box, etc.)
        if (shapeTree['p:sp']) {
            for (const shape of shapeTree['p:sp']) {
                if (shape['p:txBody'] && shape['p:txBody'][0]['a:p']) {
                    for (const paragraph of shape['p:txBody'][0]['a:p']) {
                        if (paragraph['a:r']) {
                            for (const run of paragraph['a:r']) {
                                if (run['a:t'] && run['a:t'][0]) {
                                    text += run['a:t'][0] + ' ';
                                }
                            }
                            text += '\n';
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        // If we can't parse the structure, return empty string
        console.error('Error extracting text from PPTX XML:', error);
    }
    return text;
}
