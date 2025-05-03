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
exports.startServer = startServer;
// api/server.ts
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const gemini_document_analyzer_1 = require("../gemini-document-analyzer");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load environment variables
dotenv.config();
// Initialize Express application
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Configure middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Configure file upload middleware
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Use original filename with timestamp to avoid conflicts
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        // Check file type
        const allowedTypes = ['.pdf', '.docx', '.pptx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`File type not supported. Supported types: ${allowedTypes.join(', ')}`));
        }
    }
});
// Initialize the document analyzer
const analyzer = new gemini_document_analyzer_1.GeminiDocumentAnalyzer({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.2'),
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '8192')
});
// API routes
app.post('/api/analyze', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        // Parse request parameters
        // const analysisTypes = req.body.analysisTypes ? 
        //   (req.body.analysisTypes as string).split(',') as AnalysisType[] : 
        //   ['all'];
        const analysisTypes = req.body.analysisTypes ?
            req.body.analysisTypes.split(',').map((type) => {
                if (type === 'all' || type === 'summary' || type === 'keywords' || type === 'entities' || type === 'structure' || type === 'optimization') {
                    return type;
                }
                else {
                    throw new Error(`Invalid analysis type: ${type}`);
                }
            }) :
            ['all'];
        const outputFormat = (req.body.outputFormat || 'json');
        const generateMermaid = req.body.generateMermaid === 'true';
        const detailedMode = req.body.detailedMode === 'true';
        // Configure analysis options
        const options = {
            types: analysisTypes,
            outputFormat,
            generateMermaid,
            detailedMode
        };
        // Perform analysis
        const result = await analyzer.analyzeDocument(req.file.path, options);
        // Delete temporary file after analysis
        fs.unlinkSync(req.file.path);
        // Return results
        res.json({
            success: true,
            filename: req.file.originalname,
            result
        });
    }
    catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: 'Analysis failed',
            message: error.message
        });
    }
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});
/**
 * Start server
 */
function startServer() {
    return new Promise((resolve, reject) => {
        try {
            app.listen(PORT, () => {
                console.log(`Document analyzer API running on port ${PORT}`);
                resolve(PORT);
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
// Start server if directly run
if (require.main === module) {
    startServer()
        .then((port) => console.log(`Server started on port ${port}`))
        .catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}
