// API Client - Wraps server-side API calls
// SECURE: No local fallback - API server required

// API_BASE_URL is set in HTML, fallback to auto-detect
const API_BASE_URL = (typeof window !== 'undefined' && window.API_BASE_URL) 
    ? window.API_BASE_URL 
    : (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3000/api');

// Always try to use the API - let actual calls fail if server is unavailable
// This ensures we don't block on health checks that might fail due to CORS or missing endpoints
let useServerAPI = true; // Default to true - always try API first
let apiAvailable = true; // Default to true - we'll discover if it's not available on first call

// Get auth headers for API requests
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (window.AuthClient && window.AuthClient.token) {
        headers['Authorization'] = `Bearer ${window.AuthClient.token}`;
    }
    return headers;
}

// Get API base URL dynamically
function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
        return window.API_BASE_URL;
    }
    if (typeof window !== 'undefined') {
        return window.location.origin + '/api';
    }
    return 'http://localhost:3000/api';
}

// Check if API is available (optional - doesn't block usage)
async function checkAPIAvailability() {
    try {
        const apiUrl = getApiBaseUrl();
        const response = await fetch(`${apiUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        apiAvailable = response.ok;
        useServerAPI = apiAvailable;
        return apiAvailable;
    } catch (error) {
        // Don't set to false - let actual API calls determine availability
        // Health check might fail due to CORS, missing endpoint, etc., but API might still work
        console.warn('API health check failed (this is OK if /health endpoint doesn\'t exist):', error.message);
        return null; // Return null to indicate check was inconclusive
    }
}

// Initialize API check on load (non-blocking)
if (typeof window !== 'undefined') {
    checkAPIAvailability().catch(() => {
        // Ignore errors - health check is optional
    });
}

// 1. Parse OTUI Code
// SECURE: No local fallback - API server required
async function parseOTUICodeAPI(code) {
    // Always try the API - don't block on health check status
    try {
        const widgetDefinitions = typeof OTUI_WIDGETS !== 'undefined' ? OTUI_WIDGETS : {};
        const response = await fetch(`${getApiBaseUrl()}/parse`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include', // Include cookies
            body: JSON.stringify({ code, widgetDefinitions })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            // Store templates in window for compatibility
            if (typeof window !== 'undefined' && result.data.templates) {
                window._importedTemplates = result.data.templates;
                window._otuiTemplateMap = result.data.templateMap;
            }
            return result.data;
        } else {
            throw new Error(result.error || 'Parse failed');
        }
    } catch (error) {
        console.error('API parse failed:', error);
        throw error;
    }
}

// 2. Generate OTUI Code
// SECURE: No local fallback - API server required
async function generateOTUICodeAPI() {
    // Always try the API - don't block on health check status
    try {
        // Collect widget tree from DOM
        const editorContent = document.getElementById('editorContent');
        if (!editorContent) {
            throw new Error('editorContent not found');
        }
        
        const roots = [...editorContent.querySelectorAll(':scope > .widget')];
        const widgetTree = roots.map(root => serializeWidgetForAPI(root));
        
        const widgetDefinitions = typeof OTUI_WIDGETS !== 'undefined' ? OTUI_WIDGETS : {};
        const importedTemplates = (typeof window !== 'undefined' && Array.isArray(window._importedTemplates))
            ? window._importedTemplates
            : [];
        
        // Collect user-created templates from storage for template definitions
        const userTemplates = [];
        if (window.OTUIStorage && window.OTUIStorage.getWidgetTemplates) {
            const templates = window.OTUIStorage.getWidgetTemplates();
            Object.entries(templates).forEach(([name, template]) => {
                // Check if this template is used in the widget tree
                function hasTemplateInTree(widgetData) {
                    if (!widgetData) return false;
                    if (widgetData.isTemplate && widgetData.templateName === name) {
                        return true;
                    }
                    if (widgetData.children && Array.isArray(widgetData.children)) {
                        return widgetData.children.some(child => hasTemplateInTree(child));
                    }
                    return false;
                }
                
                // Only include templates that are actually used
                const isUsed = widgetTree.some(root => hasTemplateInTree(root));
                if (isUsed) {
                    userTemplates.push({
                        name: name,
                        baseType: template.baseType || template.type,
                        data: template.data // Original template data with properties
                    });
                }
            });
        }
        
        const response = await fetch(`${getApiBaseUrl()}/generate`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include', // Include cookies
            body: JSON.stringify({ widgetTree, widgetDefinitions, importedTemplates, userTemplates })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error('API generate failed:', error);
        throw error;
    }
}

const NON_OTUI_DATASET_KEYS = new Set([
    'type',
    'baseType',
    'imageApplied',
    'styleApplied',
    'styleName',
    'selector',
    'hooked',
    'hookedWidget',
    'widgetdata',
    'widgetData',
    'parentType',
    'originalTypeName',
    'clipWidth',
    'clipHeight',
    'clipX',
    'clipY',
    'clipSizeApplied',
    'clipObserverAdded',
    'imageWidth',
    'imageHeight',
    'originalImageUrl',
    'userWidthOverride',
    'userHeightOverride',
    'explicitWidthApplied',
    'explicitHeightApplied',
    '_appliedMinSize'
]);

function camelToHyphenCase(str) {
    if (!str) return str;
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

// Serialize widget to data structure (API only, avoid collision with template serialization)
// IMPORTANT: This function must NOT include parent references to avoid circular structures
function serializeWidgetForAPI(widget) {
    // Check if widget has events (for code generation)
    const widgetType = widget.dataset.type;
    const def = typeof OTUI_WIDGETS !== 'undefined' ? OTUI_WIDGETS[widgetType] : null;
    const hasEvents = def && def.events && Object.keys(def.events).length > 0;
    const isAutoGeneratedId = widget.id && widget.id.match(/^ui\w+_\d+$/);
    
    const parent = widget.parentElement;
    const widgetStyle = window.getComputedStyle(widget);
    const parentStyle = parent ? window.getComputedStyle(parent) : null;
    let propertyKeyMap = null;
    if (widget.dataset._keyMap) {
        try {
            propertyKeyMap = JSON.parse(widget.dataset._keyMap);
        } catch (e) {
            propertyKeyMap = null;
        }
    }
    const normalizePropertyKey = (rawKey) => {
        if (!rawKey) return rawKey;
        if (propertyKeyMap && propertyKeyMap[rawKey]) {
            return propertyKeyMap[rawKey];
        }
        if (rawKey.startsWith('!')) {
            return '!' + camelToHyphenCase(rawKey.slice(1));
        }
        return camelToHyphenCase(rawKey);
    };
    const safeParse = (value) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };
    
    const rect = widget.getBoundingClientRect();
    const measuredWidth = Math.round(rect.width || 0);
    const measuredHeight = Math.round(rect.height || 0);
    const resolvedWidth = measuredWidth || parseInt(widget.style.width) || parseInt(widget.dataset.width) || 0;
    const resolvedHeight = measuredHeight || parseInt(widget.style.height) || parseInt(widget.dataset.height) || 0;
    
    const widgetData = {
        type: widget.dataset.type,
        originalTypeName: widget.dataset.originalTypeName || widget.dataset.type,
        id: widget.id,
        baseType: widget.dataset.baseType,
        isTemplate: widget.dataset._isTemplate === 'true',
        templateName: widget.dataset._templateName || null,
        templateBaseType: widget.dataset._templateBaseType || null,
        isRoot: widget.parentElement && widget.parentElement.id === 'editorContent',
        width: resolvedWidth,
        height: resolvedHeight,
        properties: {},
        originalAnchors: widget.dataset._originalAnchors,
        originalMargins: widget.dataset._originalMargins,
        originalSizeDefined: widget.dataset._originalSizeDefined === 'true',
        originalPropertyList: widget.dataset._originalPropertyList ? JSON.parse(widget.dataset._originalPropertyList) : null,
        specialProps: widget.dataset._specialProps ? JSON.parse(widget.dataset._specialProps) : null,
        hasEvents: hasEvents,
        isAutoGeneratedId: isAutoGeneratedId,
        parentId: parent ? parent.id : null,
        parentType: parent && parent.dataset ? parent.dataset.type : null,
        layout: {
            left: safeParse(widget.style.left || widgetStyle.left || widget.offsetLeft || 0),
            top: safeParse(widget.style.top || widgetStyle.top || widget.offsetTop || 0),
            width: resolvedWidth,
            height: resolvedHeight,
            parentWidth: parent ? parent.offsetWidth || 0 : 0,
            parentHeight: parent ? parent.offsetHeight || 0 : 0,
            parentPaddingLeft: parentStyle ? safeParse(parentStyle.paddingLeft) : 0,
            parentPaddingTop: parentStyle ? safeParse(parentStyle.paddingTop) : 0,
            parentPaddingRight: parentStyle ? safeParse(parentStyle.paddingRight) : 0,
            parentPaddingBottom: parentStyle ? safeParse(parentStyle.paddingBottom) : 0
        },
        children: []
    };
    
    // Collect all dataset properties (excluding internal _ prefixed ones)
    Object.keys(widget.dataset).forEach(key => {
        if (!key.startsWith('_') && !NON_OTUI_DATASET_KEYS.has(key)) {
            let datasetKey = key;
            if (datasetKey === 'align') {
                datasetKey = 'textAlign';
            }
            const normalizedKey = normalizePropertyKey(datasetKey);
            widgetData.properties[normalizedKey] = widget.dataset[key];
        }
    });
    
    // Collect children recursively (no parent references)
    const children = [...widget.children].filter(c => c.classList.contains('widget'));
    widgetData.children = children.map(child => serializeWidgetForAPI(child));
    
    // Ensure no parent references exist
    delete widgetData.parent;
    
    return widgetData;
}

// 3. Parse OTUI File (single file content)
// SECURE: No local fallback - API server required
async function parseOTUIFileAPI(content) {
    // Always try the API - don't block on health check status
    try {
        const response = await fetch(`${getApiBaseUrl()}/styles/parse`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include', // Include cookies
            body: JSON.stringify({ content })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || 'Style parsing failed');
        }
    } catch (error) {
        console.error('API style parse failed:', error);
        throw error;
    }
}

// 4. Load OTUI Styles
async function loadOTUIFilesFromFilesAPI(files) {
    if (!useServerAPI || !apiAvailable) {
        throw new Error('loadOTUIFilesFromFiles: API server required. Please start the server and ensure API_BASE_URL is configured.');
    }
    
    try {
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });
        
        const headers = {};
        if (window.AuthClient && window.AuthClient.token) {
            headers['Authorization'] = `Bearer ${window.AuthClient.token}`;
        }
        const response = await fetch(`${getApiBaseUrl()}/styles/load`, {
            method: 'POST',
            headers: headers,
            credentials: 'include', // Include cookies
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            // Merge styles into window.OTUIStyleLoader
            if (window.OTUIStyleLoader && result.data) {
                result.data.forEach(fileResult => {
                    if (fileResult.styles) {
                        Object.assign(window.OTUIStyleLoader.loadedStyles || {}, fileResult.styles);
                    }
                });
            }
            return result.data;
        } else {
            throw new Error(result.error || 'Style loading failed');
        }
    } catch (error) {
        console.error('API style load failed:', error);
        throw error;
    }
}

// 5. Process Images
async function processImagesAPI(files) {
    if (!useServerAPI || !apiAvailable) {
        throw new Error('processImages: API server required. Please start the server and ensure API_BASE_URL is configured.');
    }
    
    try {
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('images', file);
        });
        
        const headers = {};
        if (window.AuthClient && window.AuthClient.token) {
            headers['Authorization'] = `Bearer ${window.AuthClient.token}`;
        }
        const response = await fetch(`${getApiBaseUrl()}/images/process`, {
            method: 'POST',
            headers: headers,
            credentials: 'include', // Include cookies
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || 'Image processing failed');
        }
    } catch (error) {
        console.error('API image process failed:', error);
        throw error;
    }
}

// 6. AI Generate
// SECURE: No local fallback - API server required
async function generateOTUIModuleAPI(prompt, context = '') {
    // Always try the API - don't block on health check status
    try {
        const apiKey = localStorage.getItem('ai_api_key') || '';
        const provider = localStorage.getItem('ai_provider') || 'openai';
        const model = localStorage.getItem('ai_model') || 'gpt-4o-mini';
        const endpoint = localStorage.getItem('ai_endpoint') || '';
        
        const response = await fetch(`${getApiBaseUrl()}/ai/generate`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include', // Include cookies
            body: JSON.stringify({ prompt, context, apiKey, provider, model, endpoint })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.error || 'AI generation failed');
        }
    } catch (error) {
        console.error('API AI generate failed:', error);
        throw error;
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.APIClient = {
        checkAPIAvailability,
        parseOTUICode: parseOTUICodeAPI,
        generateOTUICode: generateOTUICodeAPI,
        parseOTUIFile: parseOTUIFileAPI,
        loadOTUIFilesFromFiles: loadOTUIFilesFromFilesAPI,
        processImages: processImagesAPI,
        generateOTUIModule: generateOTUIModuleAPI,
        useServerAPI: () => useServerAPI,
        setUseServerAPI: (value) => { useServerAPI = value && apiAvailable; },
        API_BASE_URL: getApiBaseUrl(), // Expose for error messages
        getApiBaseUrl: getApiBaseUrl // Expose function
    };
}
