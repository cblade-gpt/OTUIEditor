// SECURE VERSION - OTUI Parser (Client-side stub only)
// Actual parsing logic is server-side only
// This file contains only DOM-dependent widget creation, NOT parsing logic

// CRITICAL: parseOTUICode is now server-side only
// This stub redirects to API client
function parseOTUICode(code) {
    if (window.APIClient && window.APIClient.parseOTUICode) {
        // Use API client (which handles async and fallback)
        return window.APIClient.parseOTUICode(code);
    }
    throw new Error('parseOTUICode: API client not available. Please ensure server is running or use secure build.');
}

// Keep createWidgetsFromOTUI - this is DOM-dependent and safe to keep client-side
// (It only creates DOM elements, doesn't contain parsing logic)
function createWidgetsFromOTUI(widgets, parentElement = null, startX = 50, startY = 50) {
    // ... existing implementation stays (DOM manipulation only) ...
    // This function is safe because it only creates widgets from already-parsed data
}

// Export - but parseOTUICode now calls API
window.parseOTUICode = parseOTUICode;
window.createWidgetsFromOTUI = createWidgetsFromOTUI;

