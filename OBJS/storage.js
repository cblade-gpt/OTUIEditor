// OBJS/storage.js - Cookie-based storage for widgets, progress, and preferences
// Handles cookie consent and storage operations

let cookieConsentGiven = false;
const COOKIE_EXPIRY_DAYS = 365; // 1 year expiry for templates and preferences
const PROGRESS_COOKIE_EXPIRY_DAYS = 7; // 7 days for auto-save progress
const DAY_MS = 24 * 60 * 60 * 1000;
const COOKIE_STORAGE_PREFIX = 'otui_builder_cookie:';
let cachedCookieAvailability = null;

function getFallbackStorageKey(name) {
    return `${COOKIE_STORAGE_PREFIX}${name}`;
}

function setLocalStorageCookie(name, value, days) {
    try {
        const payload = {
            value,
            expiresAt: days ? Date.now() + days * DAY_MS : null
        };
        localStorage.setItem(getFallbackStorageKey(name), JSON.stringify(payload));
        return true;
    } catch (e) {
        console.error('Error using localStorage fallback for cookie:', e);
        return false;
    }
}

function getLocalStorageCookie(name) {
    try {
        const raw = localStorage.getItem(getFallbackStorageKey(name));
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (payload.expiresAt && payload.expiresAt < Date.now()) {
            localStorage.removeItem(getFallbackStorageKey(name));
            return null;
        }
        return payload.value;
    } catch (e) {
        return null;
    }
}

function deleteLocalStorageCookie(name) {
    try {
        localStorage.removeItem(getFallbackStorageKey(name));
    } catch (e) {
        console.error('Error removing localStorage fallback cookie:', e);
    }
}

// Check if cookies are enabled
function areCookiesEnabled() {
    if (cachedCookieAvailability !== null) {
        return cachedCookieAvailability;
    }
    try {
        document.cookie = 'otui_builder_test=1';
        const enabled = document.cookie.indexOf('otui_builder_test=') !== -1;
        document.cookie = 'otui_builder_test=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        cachedCookieAvailability = enabled;
        return enabled;
    } catch (e) {
        cachedCookieAvailability = false;
        return false;
    }
}

// Set a cookie with expiry
function setCookie(name, value, days) {
    const isConsentCookie = name === 'otui_builder_cookie_consent';
    if (!cookieConsentGiven && !isConsentCookie) {
        console.warn('Cookie consent not given. Cannot set cookie:', name);
        return false;
    }
    
    try {
        if (areCookiesEnabled()) {
            const date = new Date();
            date.setTime(date.getTime() + ((days || COOKIE_EXPIRY_DAYS) * DAY_MS));
            const expires = `expires=${date.toUTCString()}`;
            document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`;
            return true;
        }
    } catch (e) {
        console.error('Error setting cookie:', e);
    }
    
    return setLocalStorageCookie(name, value, days || COOKIE_EXPIRY_DAYS);
}

// Get a cookie value
function getCookie(name) {
    try {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        const fallback = getLocalStorageCookie(name);
        return fallback;
    } catch (e) {
        console.error('Error getting cookie:', e);
        return null;
    }
}

// Delete a cookie
function deleteCookie(name) {
    try {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        deleteLocalStorageCookie(name);
        return true;
    } catch (e) {
        console.error('Error deleting cookie:', e);
        return false;
    }
}

// Check if cookie consent has been given
function hasCookieConsent() {
    if (cookieConsentGiven) return true;
    const consent = getCookie('otui_builder_cookie_consent');
    if (consent === 'accepted') {
        cookieConsentGiven = true;
        return true;
    }
    return false;
}

// Set cookie consent
function setCookieConsent(accepted) {
    cookieConsentGiven = accepted;
    if (accepted) {
        setCookie('otui_builder_cookie_consent', 'accepted', COOKIE_EXPIRY_DAYS);
    } else {
        deleteCookie('otui_builder_cookie_consent');
    }
}

// Initialize cookie consent on page load
function initCookieConsent() {
    if (hasCookieConsent()) {
        cookieConsentGiven = true;
        // Hide consent dialog if already accepted
        const consentDialog = document.getElementById('cookieConsentDialog');
        if (consentDialog) {
            consentDialog.style.display = 'none';
        }
    } else {
        // Show consent dialog
        const consentDialog = document.getElementById('cookieConsentDialog');
        if (consentDialog) {
            consentDialog.style.display = 'flex';
        }
    }
}

// Save widget template to cookies
function saveWidgetTemplate(widget, name) {
    if (!cookieConsentGiven) {
        showToast('Please accept cookies to save widget templates');
        return false;
    }
    
    try {
        // Serialize widget to JSON (includes all children recursively)
        const widgetData = serializeWidget(widget);
        
        // Count total children (including nested)
        function countChildren(data) {
            let count = data.children ? data.children.length : 0;
            if (data.children) {
                data.children.forEach(child => {
                    count += countChildren(child);
                });
            }
            return count;
        }
        const childCount = countChildren(widgetData);
        
        // Get existing templates
        const templates = getWidgetTemplates();
        
        // Add or update template
        templates[name] = {
            name: name,
            type: widget.dataset.type,
            data: widgetData,
            childCount: childCount, // Store child count for display
            savedAt: new Date().toISOString()
        };
        
        // Save to cookie (limit to 50 templates to avoid cookie size limits)
        const templateKeys = Object.keys(templates);
        if (templateKeys.length > 50) {
            // Remove oldest template
            const oldestKey = templateKeys.sort((a, b) => {
                return new Date(templates[a].savedAt) - new Date(templates[b].savedAt);
            })[0];
            delete templates[oldestKey];
        }
        
        const templatesJson = JSON.stringify(templates);
        return setCookie('otui_builder_widget_templates', templatesJson, COOKIE_EXPIRY_DAYS);
    } catch (e) {
        console.error('Error saving widget template:', e);
        showToast('Error saving widget template: ' + e.message);
        return false;
    }
}

// Get all widget templates
function getWidgetTemplates() {
    try {
        const templatesJson = getCookie('otui_builder_widget_templates');
        if (!templatesJson) return {};
        return JSON.parse(templatesJson);
    } catch (e) {
        console.error('Error getting widget templates:', e);
        return {};
    }
}

// Load widget template from cookies
function loadWidgetTemplate(name) {
    try {
        const templates = getWidgetTemplates();
        const template = templates[name];
        if (!template) {
            showToast('Template not found: ' + name);
            return null;
        }
        
        // Deserialize and create widget
        const widget = deserializeWidget(template.data);
        return widget;
    } catch (e) {
        console.error('Error loading widget template:', e);
        showToast('Error loading widget template: ' + e.message);
        return null;
    }
}

// Delete widget template
function deleteWidgetTemplate(name) {
    try {
        const templates = getWidgetTemplates();
        delete templates[name];
        const templatesJson = JSON.stringify(templates);
        return setCookie('otui_builder_widget_templates', templatesJson, COOKIE_EXPIRY_DAYS);
    } catch (e) {
        console.error('Error deleting widget template:', e);
        return false;
    }
}

// Serialize widget to JSON (including all properties, styles, dataset, and children)
function serializeWidget(widget) {
    const data = {
        type: widget.dataset.type,
        baseType: widget.dataset.baseType || null,
        id: widget.id,
        className: widget.className,
        style: {
            left: widget.style.left,
            top: widget.style.top,
            width: widget.style.width,
            height: widget.style.height,
            position: widget.style.position
        },
        dataset: {},
        children: []
    };
    
    // Copy all dataset attributes (including _originalAnchors, _originalMargins, etc.)
    Object.keys(widget.dataset).forEach(key => {
        data.dataset[key] = widget.dataset[key];
    });
    
    // Serialize child widgets recursively (including nested children)
    widget.querySelectorAll(':scope > .widget').forEach(child => {
        data.children.push(serializeWidget(child));
    });
    
    return data;
}

// Deserialize widget from JSON
function deserializeWidget(data) {
    // Create widget using the base type if available, otherwise use type
    // For custom widgets with inheritance, use baseType to create the actual widget
    const widgetType = data.baseType || data.type;
    const widget = createWidget(widgetType);
    if (!widget) {
        console.error('Failed to create widget:', widgetType);
        return null;
    }
    
    // Restore original type name if it was a custom widget
    // This ensures "CharmItem < UICheckBox" is restored correctly
    if (data.baseType && data.type !== data.baseType) {
        widget.dataset.type = data.type; // Original name (e.g., "CharmItem")
        widget.dataset.baseType = data.baseType; // Base type (e.g., "UICheckBox")
    } else if (data.type) {
        widget.dataset.type = data.type;
    }
    
    // Restore ID if provided
    if (data.id) {
        widget.id = data.id;
    }
    
    // Restore className
    if (data.className) {
        widget.className = data.className;
    }
    
    // Restore styles
    if (data.style) {
        Object.keys(data.style).forEach(key => {
            if (data.style[key]) {
                widget.style[key] = data.style[key];
            }
        });
    }
    
    // Restore dataset attributes
    if (data.dataset) {
        Object.keys(data.dataset).forEach(key => {
            widget.dataset[key] = data.dataset[key];
        });
    }
    
    // Restore child widgets recursively (including nested children)
    if (data.children && data.children.length > 0) {
        data.children.forEach(childData => {
            const childWidget = deserializeWidget(childData);
            if (childWidget) {
                widget.appendChild(childWidget);
            }
        });
    }
    
    // Update widget content display
    updateWidgetContent(widget);
    
    // Reattach event handlers to this widget and all children recursively
    attachWidgetHandlers(widget);
    
    // Apply OTUI styles if available
    if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
        const widgetType = widget.dataset.type;
        if (widgetType) {
            window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, widgetType);
            // Also apply styles to children
            widget.querySelectorAll('.widget').forEach(child => {
                const childType = child.dataset.type;
                if (childType) {
                    window.OTUIStyleLoader.applyOTUIStyleToWidget(child, childType);
                }
            });
        }
    }
    
    return widget;
}

// Update widget content display after deserialization
function updateWidgetContent(widget) {
    const contentEl = widget.querySelector('.widget-content');
    if (contentEl) {
        if (widget.dataset.text) {
            contentEl.textContent = widget.dataset.text;
        } else if (widget.dataset.title) {
            contentEl.textContent = widget.dataset.title;
        } else if (widget.dataset.placeholder) {
            contentEl.textContent = widget.dataset.placeholder;
        } else if (widget.dataset.itemId) {
            contentEl.textContent = `Item ${widget.dataset.itemId}`;
        } else if (widget.dataset.percent !== undefined) {
            contentEl.textContent = `${widget.dataset.percent}%`;
        } else if (widget.dataset.value !== undefined) {
            contentEl.textContent = `Value: ${widget.dataset.value}`;
        } else if (widget.dataset.source) {
            contentEl.textContent = 'Image';
        } else if (widget.dataset.spriteId) {
            contentEl.textContent = `Sprite ${widget.dataset.spriteId}`;
        }
    }
}

// Attach event handlers to widget (and recursively to children)
function attachWidgetHandlers(widget) {
    widget.onclick = e => { e.stopPropagation(); selectWidget(widget); };
    widget.onmousedown = e => {
        if (e.button === 0) {
            const target = e.target;
            let checkElement = target;
            while (checkElement && checkElement !== widget) {
                if (checkElement.classList && checkElement.classList.contains('widget')) {
                    return;
                }
                checkElement = checkElement.parentElement;
            }
            if (target === widget || 
                (target.classList.contains('widget-content') && target.parentElement === widget) ||
                target.classList.contains('resize-handle')) {
                e.stopPropagation();
                startDrag(widget, e);
            }
        }
    };
    
    widget.querySelectorAll('.resize-handle').forEach(h => {
        h.onmousedown = e => { 
            e.stopPropagation(); 
            const dir = h.className.split(' ').find(c => c !== 'resize-handle');
            startResize(widget, dir, e); 
        };
    });
    
    // Recursively attach handlers to children
    widget.querySelectorAll(':scope > .widget').forEach(child => {
        attachWidgetHandlers(child);
    });
}

// Save canvas progress (auto-save)
function saveCanvasProgress() {
    if (!cookieConsentGiven) return false;
    
    try {
        const content = document.getElementById('editorContent');
        if (!content) return false;
        
        const progress = {
            html: content.innerHTML,
            savedAt: new Date().toISOString(),
            widgetCount: document.querySelectorAll('.widget').length
        };
        
        const progressJson = JSON.stringify(progress);
        return setCookie('otui_builder_canvas_progress', progressJson, PROGRESS_COOKIE_EXPIRY_DAYS);
    } catch (e) {
        console.error('Error saving canvas progress:', e);
        return false;
    }
}

// Load canvas progress
function loadCanvasProgress() {
    try {
        const progressJson = getCookie('otui_builder_canvas_progress');
        if (!progressJson) return false;
        
        const progress = JSON.parse(progressJson);
        const content = document.getElementById('editorContent');
        if (!content) return false;
        
        // Ask user if they want to restore
        const savedDate = new Date(progress.savedAt).toLocaleString();
        if (!confirm(`Restore canvas from ${savedDate}? (${progress.widgetCount} widgets)`)) {
            return false;
        }
        
        content.innerHTML = progress.html;
        
        // Reattach handlers to all widgets
        content.querySelectorAll('.widget').forEach(w => {
            attachWidgetHandlers(w);
        });
        
        // Reapply OTUI styles
        content.querySelectorAll('.widget').forEach(w => {
            const type = w.dataset.type;
            if (type && window.OTUIStyleLoader) {
                window.OTUIStyleLoader.applyOTUIStyleToWidget(w, type);
            }
        });
        
        saveState();
        updateAll();
        showToast('Canvas progress restored!');
        return true;
    } catch (e) {
        console.error('Error loading canvas progress:', e);
        showToast('Error loading canvas progress: ' + e.message);
        return false;
    }
}

// Auto-save progress (debounced)
let autoSaveTimeout = null;
function autoSaveProgress() {
    if (!cookieConsentGiven) return;
    
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveCanvasProgress();
    }, 2000); // Save 2 seconds after last change
}

// Save user preferences
function saveUserPreference(key, value) {
    if (!cookieConsentGiven) return false;
    
    try {
        const prefs = getUserPreferences();
        prefs[key] = value;
        const prefsJson = JSON.stringify(prefs);
        return setCookie('otui_builder_preferences', prefsJson, COOKIE_EXPIRY_DAYS);
    } catch (e) {
        console.error('Error saving preference:', e);
        return false;
    }
}

// Get user preferences
function getUserPreferences() {
    try {
        const prefsJson = getCookie('otui_builder_preferences');
        if (!prefsJson) return {};
        return JSON.parse(prefsJson);
    } catch (e) {
        console.error('Error getting preferences:', e);
        return {};
    }
}

// Get a specific user preference
function getUserPreference(key, defaultValue = null) {
    const prefs = getUserPreferences();
    return prefs[key] !== undefined ? prefs[key] : defaultValue;
}

// Export storage functions to window
window.OTUIStorage = {
    initCookieConsent,
    setCookieConsent,
    hasCookieConsent,
    areCookiesEnabled,
    getCookie,
    setCookie,
    deleteCookie,
    saveWidgetTemplate,
    getWidgetTemplates,
    loadWidgetTemplate,
    deleteWidgetTemplate,
    saveCanvasProgress,
    loadCanvasProgress,
    autoSaveProgress,
    saveUserPreference,
    getUserPreference,
    getUserPreferences
};

