// OTUI Editor API Server
// Protects critical parsing and generation logic server-side

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Get the parent directory (where HTML, CSS, JS files are located)
const parentDir = path.join(__dirname, '..');

// Middleware
app.use(cors({
    origin: true,
    credentials: true  // Allow cookies to be sent
}));
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (CSS, JS, OBJS folder) from parent directory
app.use(express.static(parentDir));

// Serve main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.join(parentDir, 'otui_builder.html'));
});

// Import server-side modules (before using in middleware)
const otuiParser = require('./lib/otui-parser-server');
const codegen = require('./lib/codegen-server');
const styleLoader = require('./lib/styleloader-server');
const aiGenerator = require('./lib/ai-generator-server');
const auth = require('./lib/auth');

// Track visitors
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    auth.trackVisitor(ip, userAgent);
    next();
});

// Authentication middleware
function requireAuth(req, res, next) {
    // Check for token in: Authorization header, cookie, body, or query
    const token = req.headers.authorization?.replace('Bearer ', '') 
        || req.cookies?.auth_token 
        || req.body.token 
        || req.query.token;
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const session = auth.verifyToken(token);
    if (!session) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = session;
    next();
}

// Require full access role
function requireFullAccess(req, res, next) {
    if (req.user.role !== auth.ROLES.FULL_ACCESS && req.user.role !== auth.ROLES.ADMIN) {
        return res.status(403).json({ error: 'Full access required' });
    }
    next();
}

// Require admin role
function requireAdmin(req, res, next) {
    if (req.user.role !== auth.ROLES.ADMIN) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});


// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'OTUI Editor API is running' });
});

// ========== AUTHENTICATION ROUTES ==========

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        const user = await auth.registerUser(email, password);
        res.json({ success: true, user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const result = await auth.loginUser(email, password);
        
        // Set cookie with token (30 days expiration)
        res.cookie('auth_token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
        
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Verify token
app.get('/api/auth/verify', requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') 
        || req.cookies?.auth_token 
        || req.body.token;
    auth.logout(token);
    
    // Clear cookie
    res.clearCookie('auth_token');
    res.json({ success: true });
});

// ========== ADMIN ROUTES ==========

// Get statistics
app.get('/api/admin/statistics', requireAuth, requireAdmin, (req, res) => {
    try {
        const stats = auth.getStatistics();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    try {
        const users = auth.getAllUsers();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user role
app.post('/api/admin/users/:userId/role', requireAuth, requireAdmin, (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        if (!role) {
            return res.status(400).json({ error: 'Role is required' });
        }
        
        const user = auth.updateUserRole(userId, role);
        res.json({ success: true, user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get activity logs
app.get('/api/admin/activity', requireAuth, requireAdmin, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const logs = auth.getActivityLogs(limit);
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 1. Parse OTUI Code (requires full access)
app.post('/api/parse', requireAuth, requireFullAccess, async (req, res) => {
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

// 2. Generate OTUI Code (requires full access)
app.post('/api/generate', requireAuth, requireFullAccess, async (req, res) => {
    try {
        const { widgetTree, widgetDefinitions, importedTemplates, userTemplates } = req.body;
        if (!widgetTree) {
            return res.status(400).json({ error: 'Widget tree is required' });
        }
        
        const result = codegen.generateOTUICode(widgetTree, widgetDefinitions || {}, importedTemplates || [], userTemplates || []);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// 3. Parse OTUI File Content (requires authentication - for style loading, allowed for demo users)
app.post('/api/styles/parse', requireAuth, async (req, res) => {
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

// 4. Load OTUI Styles from Files (requires authentication)
app.post('/api/styles/load', requireAuth, upload.array('files'), async (req, res) => {
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

// 5. Process Images (requires authentication)
app.post('/api/images/process', requireAuth, upload.array('images'), async (req, res) => {
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

// 6. AI Generate OTUI Module (requires full access)
app.post('/api/ai/generate', requireAuth, requireFullAccess, async (req, res) => {
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

