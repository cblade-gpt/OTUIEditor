// Authentication Client
// Handles login, registration, and session management

window.AuthClient = {
    token: null,
    user: null,
    get apiBaseUrl() {
        if (window.API_BASE_URL) {
            return window.API_BASE_URL;
        }
        if (typeof window !== 'undefined' && window.location) {
            return window.location.origin + '/api';
        }
        return 'http://localhost:3000/api';
    },
    
    init() {
        // Load token from cookie first, then localStorage (for backward compatibility)
        this.token = this.getCookie('auth_token') || localStorage.getItem('auth_token');
        this.user = JSON.parse(localStorage.getItem('auth_user') || 'null');
        
        // Verify token on load
        if (this.token) {
            this.verifyToken();
        }
    },
    
    // Helper function to get cookie value
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    },
    
    // Helper function to set cookie (for client-side, though server sets it)
    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    },
    
    // Helper function to delete cookie
    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    },
    
    async register(email, password) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Include cookies
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }
            
            // Auto-login after registration
            return await this.login(email, password);
        } catch (error) {
            throw error;
        }
    },
    
    async login(email, password) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Include cookies
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }
            
            this.token = data.token;
            this.user = data.user;
            
            // Save to localStorage (for backward compatibility)
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('auth_user', JSON.stringify(this.user));
            
            // Cookie is set by server, but we can also set it client-side as backup
            // Server sets httpOnly cookie, so this is just for compatibility
            
            return { token: this.token, user: this.user };
        } catch (error) {
            throw error;
        }
    },
    
    async verifyToken() {
        // Check cookie first, then token
        const cookieToken = this.getCookie('auth_token');
        if (cookieToken && !this.token) {
            this.token = cookieToken;
        }
        
        if (!this.token) return false;
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/verify`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: 'include' // Include cookies
            });
            
            const data = await response.json();
            if (!response.ok) {
                this.logout();
                return false;
            }
            
            this.user = data.user;
            this.token = cookieToken || this.token; // Update token from cookie if available
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('auth_user', JSON.stringify(this.user));
            return true;
        } catch (error) {
            this.logout();
            return false;
        }
    },
    
    async logout() {
        if (this.token) {
            try {
                await fetch(`${this.apiBaseUrl}/auth/logout`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include' // Include cookies
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        this.deleteCookie('auth_token');
    },
    
    isAuthenticated() {
        return !!this.token && !!this.user;
    },
    
    hasFullAccess() {
        return this.user && (this.user.role === 'full_access' || this.user.role === 'admin');
    },
    
    isAdmin() {
        return this.user && this.user.role === 'admin';
    },
    
    // Get auth header for API requests
    getAuthHeader() {
        return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    window.AuthClient.init();
}

