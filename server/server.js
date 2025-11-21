// OTUI Editor API Server
// Protects critical parsing and generation logic server-side

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Import server-side modules
const otuiParser = require('./lib/otui-parser-server');
const codegen = require('./lib/codegen-server');
const styleLoader = require('./lib/styleloader-server');
const aiGenerator = require('./lib/ai-generator-server');

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'OTUI Editor API is running' });
});

// 1. Parse OTUI Code
app.post('/api/parse', async (req, res) => {
    try {
        const { code, widgetDefinitions } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'OTUI code is required' });
        }
        
        const result = otuiParser.parseOTUICode(code, widgetDefinitions || {});
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Parse error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// 2. Generate OTUI Code
app.post('/api/generate', async (req, res) => {
    try {
        const { widgetTree, widgetDefinitions, importedTemplates } = req.body;
        if (!widgetTree) {
            return res.status(400).json({ error: 'Widget tree is required' });
        }
        
        const result = codegen.generateOTUICode(widgetTree, widgetDefinitions || {}, importedTemplates || []);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// 3. Parse OTUI File Content
app.post('/api/styles/parse', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'OTUI file content is required' });
        }
        
        const styles = styleLoader.parseOTUIFile(content);
        res.json({ success: true, data: styles });
    } catch (error) {
        console.error('Style parse error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Load OTUI Styles from Files
app.post('/api/styles/load', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }
        
        const results = [];
        for (const file of req.files) {
            try {
                const content = fs.readFileSync(file.path, 'utf8');
                const styles = styleLoader.parseOTUIFile(content);
                results.push({
                    filename: file.originalname,
                    styles: styles,
                    count: Object.keys(styles).length
                });
                // Clean up uploaded file
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err);
            }
        }
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Style load error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Process Images
app.post('/api/images/process', upload.array('images'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images provided' });
        }
        
        const results = [];
        for (const file of req.files) {
            try {
                // Read image file and convert to base64
                const imageBuffer = fs.readFileSync(file.path);
                const base64 = imageBuffer.toString('base64');
                const mimeType = file.mimetype || 'image/png';
                
                results.push({
                    path: file.originalname,
                    base64: `data:${mimeType};base64,${base64}`,
                    size: file.size
                });
                
                // Clean up uploaded file
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error(`Error processing image ${file.originalname}:`, err);
            }
        }
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Image process error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. AI Generate OTUI Module
app.post('/api/ai/generate', async (req, res) => {
    try {
        const { prompt, context, apiKey, provider, model, endpoint } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        const result = await aiGenerator.generateOTUIModule({
            prompt,
            context: context || '',
            apiKey: apiKey || '',
            provider: provider || 'openai',
            model: model || 'gpt-4o-mini',
            endpoint: endpoint || ''
        });
        
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('AI generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
    console.log(`OTUI Editor API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

