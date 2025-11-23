// Authentication and User Management
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/users.json');
const SESSIONS_PATH = path.join(__dirname, '../data/sessions.json');
const ACTIVITY_PATH = path.join(__dirname, '../data/activity.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database files
function initDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }, null, 2));
    }
    if (!fs.existsSync(SESSIONS_PATH)) {
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify({ sessions: {} }, null, 2));
    }
    if (!fs.existsSync(ACTIVITY_PATH)) {
        fs.writeFileSync(ACTIVITY_PATH, JSON.stringify({ activities: [], visitors: [] }, null, 2));
    }
}

// Load database
function loadDB() {
    initDatabase();
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: [] };
    }
}

// Save database
function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Load sessions
function loadSessions() {
    initDatabase();
    try {
        const data = fs.readFileSync(SESSIONS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { sessions: {} };
    }
}

// Save sessions
function saveSessions(data) {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(data, null, 2));
}

// Load activity
function loadActivity() {
    initDatabase();
    try {
        const data = fs.readFileSync(ACTIVITY_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { activities: [], visitors: [] };
    }
}

// Save activity
function saveActivity(data) {
    fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(data, null, 2));
}

// Generate session token
function generateToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

// User roles
const ROLES = {
    DEMO: 'demo',
    FULL_ACCESS: 'full_access',
    ADMIN: 'admin'
};

// Register new user
async function registerUser(email, password) {
    const db = loadDB();
    
    // Check if user exists
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('User already exists');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user (default to demo)
    const user = {
        id: Date.now().toString(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role: ROLES.DEMO,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginCount: 0,
        isActive: true
    };
    
    db.users.push(user);
    saveDB(db);
    
    // Log activity
    logActivity(user.id, 'register', { email: user.email });
    
    return { id: user.id, email: user.email, role: user.role };
}

// Login user
async function loginUser(email, password) {
    const db = loadDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.isActive);
    
    if (!user) {
        throw new Error('Invalid email or password');
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        throw new Error('Invalid email or password');
    }
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    user.loginCount = (user.loginCount || 0) + 1;
    saveDB(db);
    
    // Create session
    const sessions = loadSessions();
    const token = generateToken();
    sessions.sessions[token] = {
        userId: user.id,
        email: user.email,
        role: user.role,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
    };
    saveSessions(sessions);
    
    // Log activity
    logActivity(user.id, 'login', { email: user.email });
    
    return {
        token,
        user: {
            id: user.id,
            email: user.email,
            role: user.role
        }
    };
}

// Verify session token
function verifyToken(token) {
    const sessions = loadSessions();
    const session = sessions.sessions[token];
    
    if (!session) {
        return null;
    }
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    saveSessions(sessions);
    
    return session;
}

// Logout
function logout(token) {
    const sessions = loadSessions();
    if (sessions.sessions[token]) {
        const userId = sessions.sessions[token].userId;
        delete sessions.sessions[token];
        saveSessions(sessions);
        logActivity(userId, 'logout', {});
    }
}

// Get user by ID
function getUserById(userId) {
    const db = loadDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return null;
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount
    };
}

// Update user role (admin only)
function updateUserRole(userId, newRole) {
    const db = loadDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
        throw new Error('User not found');
    }
    
    if (!Object.values(ROLES).includes(newRole)) {
        throw new Error('Invalid role');
    }
    
    user.role = newRole;
    saveDB(db);
    
    logActivity(userId, 'role_update', { newRole, updatedBy: 'admin' });
    
    return getUserById(userId);
}

// Get all users (admin only)
function getAllUsers() {
    const db = loadDB();
    return db.users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        loginCount: u.loginCount || 0,
        isActive: u.isActive
    }));
}

// Log activity
function logActivity(userId, action, data = {}) {
    const activity = loadActivity();
    activity.activities.push({
        userId,
        action,
        data,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 10000 activities
    if (activity.activities.length > 10000) {
        activity.activities = activity.activities.slice(-10000);
    }
    
    saveActivity(activity);
}

// Track visitor
function trackVisitor(ip, userAgent) {
    const activity = loadActivity();
    const today = new Date().toISOString().split('T')[0];
    
    const existing = activity.visitors.find(v => v.date === today && v.ip === ip);
    if (existing) {
        existing.count++;
        existing.lastVisit = new Date().toISOString();
    } else {
        activity.visitors.push({
            date: today,
            ip,
            userAgent,
            count: 1,
            firstVisit: new Date().toISOString(),
            lastVisit: new Date().toISOString()
        });
    }
    
    // Keep only last 365 days
    activity.visitors = activity.visitors.filter(v => {
        const visitDate = new Date(v.date);
        const daysDiff = (Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff < 365;
    });
    
    saveActivity(activity);
}

// Get statistics
function getStatistics() {
    const db = loadDB();
    const sessions = loadSessions();
    const activity = loadActivity();
    
    const now = Date.now();
    const activeSessions = Object.values(sessions.sessions).filter(s => {
        const lastActivity = new Date(s.lastActivity).getTime();
        return (now - lastActivity) < 30 * 60 * 1000; // Active if last activity < 30 min ago
    });
    
    const today = new Date().toISOString().split('T')[0];
    const todayVisitors = activity.visitors.filter(v => v.date === today);
    const uniqueTodayVisitors = new Set(todayVisitors.map(v => v.ip)).size;
    
    const roleCounts = {};
    db.users.forEach(u => {
        roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    });
    
    return {
        totalUsers: db.users.length,
        activeUsers: activeSessions.length,
        todayVisitors: uniqueTodayVisitors,
        roleCounts,
        totalSessions: Object.keys(sessions.sessions).length,
        totalActivities: activity.activities.length
    };
}

// Get activity logs
function getActivityLogs(limit = 100) {
    const activity = loadActivity();
    return activity.activities.slice(-limit).reverse();
}

// Initialize on load
initDatabase();

module.exports = {
    ROLES,
    registerUser,
    loginUser,
    verifyToken,
    logout,
    getUserById,
    updateUserRole,
    getAllUsers,
    logActivity,
    trackVisitor,
    getStatistics,
    getActivityLogs
};

