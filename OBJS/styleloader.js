// OBJS/styleloader.js - OTUI Style Loader for OTClientV8
let clientDataPath = null;
let loadedStyles = {};
let styleCache = {};
let imageCache = {}; // Maps image paths to blob URLs: { "images/ui/button.png": "blob:http://..." }
let imageFiles = {}; // Maps image paths to File objects: { "images/ui/button.png": File }

function toCamelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function getDatasetValue(widget, key) {
    if (!widget || !widget.dataset) return undefined;
    const camelKey = toCamelCase(key);
    return widget.dataset[camelKey];
}

// Widget type mapping from OTUI to builder (bidirectional mapping)
const WIDGET_TYPE_MAP = {
    // Layout Widgets
    'UIWindow': 'UIWindow',
    'Window': 'UIWindow',
    'CleanStaticMainWindow': 'CleanStaticMainWindow',
    'UIPanel': 'UIPanel',
    'Panel': 'UIPanel',
    'UIWidget': 'UIPanel',
    'Widget': 'UIPanel',
    'UIScrollArea': 'UIScrollArea',
    'ScrollablePanel': 'UIScrollArea',
    'ScrollArea': 'UIScrollArea',
    'UITabBar': 'UITabBar',
    'TabBar': 'UITabBar',
    'UITab': 'UITab',
    'Tab': 'UITab',
    'UIVerticalLayout': 'UIVerticalLayout',
    'VerticalLayout': 'UIVerticalLayout',
    'UIHorizontalLayout': 'UIHorizontalLayout',
    'HorizontalLayout': 'UIHorizontalLayout',
    'UIGridLayout': 'UIGridLayout',
    'GridLayout': 'UIGridLayout',
    'UIHorizontalSeparator': 'UIHorizontalSeparator',
    'HorizontalSeparator': 'UIHorizontalSeparator',
    'UIVerticalSeparator': 'UIVerticalSeparator',
    'VerticalSeparator': 'UIVerticalSeparator',
    'UISeparator': 'UISeparator',
    'Separator': 'UISeparator',
    
    // Controls
    'UIButton': 'UIButton',
    'Button': 'UIButton',
    'UICheckBox': 'UICheckBox',
    'CheckBox': 'UICheckBox',
    'UIRadioButton': 'UIRadioButton',
    'RadioButton': 'UIRadioButton',
    'UITextEdit': 'UITextEdit',
    'TextEdit': 'UITextEdit',
    'UIProgressBar': 'UIProgressBar',
    'ProgressBar': 'UIProgressBar',
    'UISlider': 'UISlider',
    'Slider': 'UISlider',
    'UIComboBox': 'UIComboBox',
    'ComboBox': 'UIComboBox',
    'UIList': 'UIList',
    'List': 'UIList',
    'UITextList': 'UITextList',
    'TextList': 'UITextList',
    'UIScrollBar': 'UIScrollBar',
    'VerticalScrollBar': 'UIScrollBar',
    'HorizontalScrollBar': 'UIScrollBar',
    'ScrollBar': 'UIScrollBar',
    'UISpinBox': 'UISpinBox',
    'SpinBox': 'UISpinBox',
    
    // Display
    'UILabel': 'UILabel',
    'Label': 'UILabel',
    'GameLabel': 'UILabel',
    'UIImage': 'UIImage',
    'Image': 'UIImage',
    'UISprite': 'UISprite',
    'Sprite': 'UISprite',
    'UIMap': 'UIMap',
    'Map': 'UIMap',
    'UIMinimap': 'UIMinimap',
    'Minimap': 'UIMinimap',
    'UICreature': 'UICreature',
    'Creature': 'UICreature',
    
    // Game UI
    'UIItem': 'UIItem',
    'Item': 'UIItem',
    'UIHealthBar': 'UIHealthBar',
    'HealthBar': 'UIHealthBar',
    'UIManaBar': 'UIManaBar',
    'ManaBar': 'UIManaBar',
    'UIExperienceBar': 'UIExperienceBar',
    'ExperienceBar': 'UIExperienceBar',
    'UIOutfit': 'UIOutfit',
    'Outfit': 'UIOutfit',
    'UICreatureBox': 'UICreatureBox',
    'CreatureBox': 'UICreatureBox',
    'UISkillBar': 'UISkillBar',
    'SkillBar': 'UISkillBar',
    'UIInventory': 'UIInventory',
    'Inventory': 'UIInventory',
    'UIContainer': 'UIContainer',
    'Container': 'UIContainer',
    
    // MiniWindow
    'UIMiniWindow': 'UIMiniWindow',
    'MiniWindow': 'UIMiniWindow'
};

const DEFAULT_STYLE_OVERRIDES = {
    UIPanel: {
        '__fallbackTheme': 'panel-flat',
        'image-source': '/images/ui/panel_flat',
        'image-border': 6,
        'padding': 6,
        'color': '#0f1624',
        'opacity': 0.95,
        'border-width': 0
    },
    UIWidget: {
        '__fallbackTheme': 'panel-flat',
        'image-source': '/images/ui/panel_flat',
        'image-border': 6,
        'padding': 6,
        'color': '#0f1624',
        'opacity': 0.95,
        'border-width': 0
    },
    FlatPanel: {
        '__fallbackTheme': 'panel-flat',
        'image-source': '/images/ui/panel_flat',
        'image-border': 3,
        'padding': 4,
        'color': '#1f2c3c',
        'opacity': 0.9,
        'border-width': 0
    }
};

// Set client data path
function setClientDataPath(path) {
    clientDataPath = path;
    // Store in localStorage
    localStorage.setItem('otclient_data_path', path);
    // Clear caches
    loadedStyles = {};
    styleCache = {};
    imageCache = {};
    // Load styles
    loadAllStyles();
}

// Get client data path from localStorage
function getClientDataPath() {
    if (!clientDataPath) {
        clientDataPath = localStorage.getItem('otclient_data_path');
    }
    return clientDataPath;
}

// Parse OTUI file content
function parseOTUIFile(content) {
    // SECURE: All parsing logic is server-side only
    if (window.APIClient && window.APIClient.parseOTUIFile) {
        return window.APIClient.parseOTUIFile(content);
    }
    throw new Error('parseOTUIFile: API server required. Please start the server.');
}

// Load a single OTUI file
async function loadOTUIFile(filename, suppressErrors = false) {
    if (styleCache[filename]) {
        return styleCache[filename];
    }
    
    const path = getClientDataPath();
    if (!path) return null;
    
    // Check if we're running from HTTP/HTTPS
    const isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    
    try {
        let urlToTry = null;
        
        if (isHttp) {
            // Running from HTTP - browsers cannot access local file system paths
            // If path starts with http:// or https://, use it directly
            if (path.startsWith('http://') || path.startsWith('https://')) {
                urlToTry = `${path}/styles/${filename}`;
            } else if (path.startsWith('/')) {
                // Already a relative HTTP path
                urlToTry = `${window.location.origin}${path}/styles/${filename}`;
            } else {
                // File system path provided when running from HTTP
                // Browsers cannot access local file system from HTTP due to security restrictions
                // Return null - user needs to either:
                // 1. Use file:// protocol to open the HTML file directly
                // 2. Use a file input to select files
                // 3. Set up an HTTP server that serves the data folder
                if (!suppressErrors && filename.includes('10-')) {
                    // Only show this once per load attempt
                    console.warn('Cannot access local file system paths when running from HTTP.');
                    console.warn('Options:');
                    console.warn('1. Open the HTML file directly (file://) instead of HTTP');
                    console.warn('2. Use a file input to select .otui files (coming soon)');
                    console.warn('3. Set up HTTP server to serve your data folder and enter HTTP URL');
                }
                return null;
            }
        } else {
            // Running from file:// - try file:// protocol
            const pathVariations = [
                `${path}/styles/${filename}`,
                `${path}\\styles\\${filename}`,
                path.replace(/\\/g, '/') + `/styles/${filename}`,
                path + `\\styles\\${filename}`
            ];
            
            for (const fullPath of pathVariations) {
                try {
                    const fileUrl = `file:///${fullPath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
                    const response = await fetch(fileUrl);
                    
                    if (response.ok) {
                        const content = await response.text();
                        const styles = await parseOTUIFile(content);
                        styleCache[filename] = styles;
                        return styles;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback to XMLHttpRequest for file://
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `file:///${path.replace(/\\/g, '/')}/styles/${filename}`, true);
                xhr.onreadystatechange = async function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 0 || xhr.status === 200) {
                            const content = xhr.responseText;
                            try {
                                const styles = await parseOTUIFile(content);
                                styleCache[filename] = styles;
                                resolve(styles);
                            } catch (error) {
                                // Check if it's a connection error
                                const isConnectionError = error.message.includes('Failed to fetch') || 
                                                          error.message.includes('ERR_CONNECTION_REFUSED') ||
                                                          error.message.includes('NetworkError');
                                
                                if (isConnectionError) {
                                    console.warn(`API server not available for ${filename}. Returning empty styles.`);
                                    styleCache[filename] = {};
                                    resolve({});
                                } else {
                                    reject(error);
                                }
                            }
                        } else {
                            if (!suppressErrors) {
                                console.warn(`Failed to load ${filename} (status: ${xhr.status})`);
                            }
                            resolve(null);
                        }
                    }
                };
                xhr.onerror = () => {
                    if (!suppressErrors) {
                        console.warn(`Error loading ${filename}`);
                    }
                    resolve(null);
                };
                xhr.send();
            });
        }
        
        // Try HTTP fetch with multiple path variations
        const urlsToTry = [];
        if (urlToTry) {
            urlsToTry.push(urlToTry);
        }
        
        // Don't try to guess HTTP paths from file system paths
        // User must provide HTTP URL if running from HTTP
        
        // Try each URL (suppress console errors for 404s since we're trying multiple paths)
        for (const url of urlsToTry) {
            try {
                const response = await fetch(url, { 
                    method: 'GET',
                    // Suppress error logging for expected 404s
                });
                if (response.ok) {
                    const content = await response.text();
                    const styles = parseOTUIFile(content);
                    styleCache[filename] = styles;
                    if (!suppressErrors) {
                        console.log(`✓ Successfully loaded ${filename} from ${url}`);
                    }
                    return styles;
                }
                // 404 is expected when trying different paths, don't log it
            } catch (e) {
                // Network errors are also expected, continue to next URL
                continue;
            }
        }
        
        // Don't log warnings for expected 404s when trying multiple paths
        // User should enter the correct HTTP URL in Settings
        
        return null;
    } catch (error) {
        if (!suppressErrors) {
            console.warn(`Error loading ${filename}:`, error);
        }
        return null;
    }
}

// Try to discover and load all .otui files in the styles folder
async function discoverAndLoadOTUIFiles() {
    const path = getClientDataPath();
    if (!path) {
        console.warn('Client data path not set');
        return [];
    }
    
    // Since browsers can't list directories, we'll try common OTUI file naming patterns
    // Based on typical OTClientV8 structure - only try known/common patterns
    const prefixes = ['10', '20', '30', '40', '50', '60', '70', '80', '90'];
    const commonSuffixes = [
        'windows', 'labels', 'panels', 'scrollbars', 'buttons', 'textedits', 
        'checkboxes', 'comboboxes', 'creaturebuttons', 'creatures', 'items', 
        'listboxes', 'progressbars', 'separators', 'splitters', 'imageview',
        'popupmenus', 'smallscrollbar', 'spinboxes', 'tabbars', 'tables',
        'topmenu', 'inputboxes', 'messageboxes', 'miniwindow', 'console',
        'container', 'gamebuttons', 'healthinfo', 'outfitwindow', 'tilewidget',
        'tenlilui'
    ];
    
    const filesToTry = new Set();
    
    // Generate potential filenames with common suffixes only
    for (const prefix of prefixes) {
        for (const suffix of commonSuffixes) {
            filesToTry.add(`${prefix}-${suffix}.otui`);
        }
    }
    
    const loadedFiles = [];
    const filesArray = Array.from(filesToTry);
    
    console.log(`Attempting to load .otui files from styles folder (trying ${filesArray.length} common patterns)...`);
    console.log('Note: Browsers cannot list directories. Only common file patterns are tried.');
    console.log('For full directory listing, use a local HTTP server (e.g., Python: python -m http.server)');
    
    // Load files in batches to avoid overwhelming the browser
    const batchSize = 20;
    let loadedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < filesArray.length; i += batchSize) {
        const batch = filesArray.slice(i, i + batchSize);
        const promises = batch.map(async (filename) => {
            try {
                const styles = await loadOTUIFile(filename, true); // Pass true to suppress errors
                if (styles && Object.keys(styles).length > 0) {
                    loadedFiles.push(filename);
                    loadedCount++;
                    return { filename, styles };
                } else {
                    failedCount++;
                }
            } catch (e) {
                // File doesn't exist - expected, don't log
                failedCount++;
            }
            return null;
        });
        
        const results = await Promise.all(promises);
        for (const result of results) {
            if (result && result.styles) {
                Object.assign(loadedStyles, result.styles);
                console.log(`✓ Loaded ${result.filename}: ${Object.keys(result.styles).length} styles`);
            }
        }
    }
    
    console.log(`Loaded ${loadedCount} .otui files (${failedCount} files not found - this is normal)`);
    if (loadedFiles.length === 0) {
        console.warn('No .otui files were loaded. Please check:');
        console.warn('1. The data folder path is correct');
        console.warn('2. The styles folder exists and contains .otui files');
        console.warn('3. Consider using a local HTTP server to bypass browser file:// restrictions');
    }
    
    return loadedFiles;
}

// Load all style files
async function loadAllStyles() {
    const path = getClientDataPath();
    if (!path) {
        console.warn('Client data path not set');
        return;
    }
    
    loadedStyles = {};
    
    // Discover and load all .otui files
    await discoverAndLoadOTUIFiles();
    
    // Resolve inheritance
    resolveInheritance();
    
    const totalStyles = Object.keys(loadedStyles).length;
    const styleNames = Object.keys(loadedStyles);
    console.log(`Total loaded styles: ${totalStyles}`);
    if (typeof window !== 'undefined' && totalStyles > 0) {
        window._stylesLoaded = true;
    }
    if (typeof window !== 'undefined' && totalStyles > 0) {
        window._stylesLoaded = true;
    }
    if (totalStyles > 0) {
        console.log('Sample style names:', styleNames.slice(0, 20).join(', '), totalStyles > 20 ? '...' : '');
        // Show important styles
        const importantStyles = ['Button', 'Window', 'Label', 'Panel', 'MiniWindow', 'ScrollablePanel'];
        importantStyles.forEach(name => {
            if (loadedStyles[name]) {
                console.log(`✓ ${name} style loaded with ${Object.keys(loadedStyles[name].resolved || {}).length} properties`);
            } else {
                console.warn(`✗ ${name} style NOT found`);
            }
        });
    } else {
        console.warn('No styles were loaded from folder path.');
        console.warn('💡 TIP: Use the file input in Settings to select .otui files directly - it works everywhere!');
    }
}

// Resolve style inheritance
function resolveInheritance() {
    function resolveStyle(styleName, visited = new Set()) {
        if (visited.has(styleName)) return {};
        visited.add(styleName);
        
        const style = loadedStyles[styleName];
        if (!style) return {};
        
        let props = {};
        
        // Get parent properties first
        if (style.parent) {
            const parentProps = resolveStyle(style.parent, visited);
            props = { ...parentProps };
        }
        
        // Override with current style properties
        props = { ...props, ...style.properties };
        
        return props;
    }
    
    // Resolve all styles
    for (const styleName in loadedStyles) {
        const style = loadedStyles[styleName];
        const resolved = resolveStyle(styleName);
        style.resolved = resolved;
        
        // Also resolve state properties (merge with base resolved properties)
        if (style.states) {
            for (const stateName in style.states) {
                const stateProps = style.states[stateName];
                // Merge base resolved properties with state-specific properties
                // Keep original state properties for reference
                style.states[stateName] = { ...resolved, ...stateProps };
            }
        }
    }
}

// Export resolveInheritance
window.resolveInheritance = resolveInheritance;

// Get style for a widget type
function getStyleForWidget(widgetType) {
    if (!widgetType) return null;
    
    // Debug: log available styles
    const availableStyles = Object.keys(loadedStyles);
    if (availableStyles.length === 0) {
        return null;
    }
    
    // Map widget types to OTUI style names
    const styleNameMap = {
        // Layout Widgets
        'UIWindow': 'Window',
        'CleanStaticMainWindow': 'CleanStaticMainWindow',
        'UIPanel': 'Panel',
        'UIWidget': 'Panel',
        'UIScrollArea': 'ScrollablePanel',
        'UITabBar': 'TabBar',
        'UITab': 'Tab',
        'UIVerticalLayout': 'VerticalLayout',
        'UIHorizontalLayout': 'HorizontalLayout',
        'UIGridLayout': 'GridLayout',
        'UIHorizontalSeparator': 'HorizontalSeparator',
        'UIVerticalSeparator': 'VerticalSeparator',
        'UISeparator': 'Separator',
        
        // Controls
        'UIButton': 'Button',
        'UICheckBox': 'CheckBox',
        'UIRadioButton': 'RadioButton',
        'UITextEdit': 'TextEdit',
        'UIProgressBar': 'ProgressBar',
        'UISlider': 'Slider',
        'UIComboBox': 'ComboBox',
        'UIList': 'List',
        'UITextList': 'TextList',
        'UIScrollBar': 'VerticalScrollBar',
        'UISpinBox': 'SpinBox',
        
        // Display
        'UILabel': 'Label',
        'UIImage': 'Image',
        'UISprite': 'Sprite',
        'UIMap': 'Map',
        'UIMinimap': 'Minimap',
        'UICreature': 'Creature',
        
        // Game UI
        'UIItem': 'Item',
        'UIHealthBar': 'HealthBar',
        'UIManaBar': 'ManaBar',
        'UIExperienceBar': 'ExperienceBar',
        'UIOutfit': 'Outfit',
        'UICreatureBox': 'CreatureBox',
        'UISkillBar': 'SkillBar',
        'UIInventory': 'Inventory',
        'UIContainer': 'Container',
        
        // MiniWindow
        'UIMiniWindow': 'MiniWindow'
    };
    
    // Get the style name for this widget type (safe lookup)
    const styleName = (styleNameMap && styleNameMap[widgetType]) ? styleNameMap[widgetType] : (widgetType ? widgetType.replace('UI', '') : '');
    
    if (!styleName) {
        if (DEFAULT_STYLE_OVERRIDES[widgetType]) {
            return { ...DEFAULT_STYLE_OVERRIDES[widgetType] };
        }
        return null;
    }
    
    // Try to find the style directly (safe lookup)
    let style = loadedStyles && loadedStyles[styleName] ? loadedStyles[styleName] : null;
    if (style) {
        // Make sure it's resolved
        if (!style.resolved) {
            // Resolve it now if not already resolved
            resolveInheritance();
        }
        if (style.resolved) {
            return style.resolved;
        }
    }
    
    // Try parent styles - safe access
    if (style && style.parent && loadedStyles) {
        const parentStyle = loadedStyles[style.parent] || null;
        if (parentStyle) {
            if (!parentStyle.resolved) {
                resolveInheritance();
            }
            if (parentStyle.resolved) {
                return parentStyle.resolved;
            }
        }
    }
    
    // Try common fallbacks
    const fallbacks = {
        'UIWindow': ['Window'],
        'CleanStaticMainWindow': ['CleanStaticMainWindow'],
        'UIPanel': ['Panel', 'FlatPanel', 'Widget'],
        'UIWidget': ['Panel', 'Widget'],
        'UIScrollArea': ['ScrollablePanel', 'ScrollArea', 'Panel'],
        'UITabBar': ['TabBar'],
        'UITab': ['Tab'],
        'UIVerticalLayout': ['VerticalLayout'],
        'UIHorizontalLayout': ['HorizontalLayout'],
        'UIGridLayout': ['GridLayout'],
        'UIHorizontalSeparator': ['HorizontalSeparator', 'Separator'],
        'UIVerticalSeparator': ['VerticalSeparator', 'Separator'],
        'UISeparator': ['Separator'],
        'UIButton': ['Button'],
        'UICheckBox': ['CheckBox'],
        'UIRadioButton': ['RadioButton'],
        'UITextEdit': ['TextEdit'],
        'UIProgressBar': ['ProgressBar'],
        'UISlider': ['Slider'],
        'UIComboBox': ['ComboBox'],
        'UIList': ['List'],
        'UITextList': ['TextList'],
        'UIScrollBar': ['VerticalScrollBar', 'HorizontalScrollBar', 'ScrollBar'],
        'UISpinBox': ['SpinBox'],
        'UILabel': ['Label', 'GameLabel'],
        'UIImage': ['Image'],
        'UISprite': ['Sprite'],
        'UIMap': ['Map'],
        'UIMinimap': ['Minimap'],
        'UICreature': ['Creature'],
        'UIItem': ['Item'],
        'UIHealthBar': ['HealthBar'],
        'UIManaBar': ['ManaBar'],
        'UIExperienceBar': ['ExperienceBar'],
        'UIOutfit': ['Outfit'],
        'UICreatureBox': ['CreatureBox'],
        'UISkillBar': ['SkillBar'],
        'UIInventory': ['Inventory'],
        'UIContainer': ['Container'],
        'UIMiniWindow': ['MiniWindow']
    };
    
    if (fallbacks && fallbacks[widgetType] && Array.isArray(fallbacks[widgetType])) {
        for (const fallbackName of fallbacks[widgetType]) {
            const fallbackStyle = loadedStyles && loadedStyles[fallbackName] ? loadedStyles[fallbackName] : null;
            if (fallbackStyle) {
                if (!fallbackStyle.resolved) {
                    resolveInheritance();
                }
                if (fallbackStyle.resolved) {
                    return fallbackStyle.resolved;
                }
            }
        }
    }
    
    if (DEFAULT_STYLE_OVERRIDES[widgetType]) {
        return { ...DEFAULT_STYLE_OVERRIDES[widgetType] };
    }
    
    return null;
}

// Convert OTUI property to CSS
function convertOTUIPropertyToCSS(key, value, dataPath) {
    switch (key) {
        case 'image-source':
            // Convert /images/ui/popupwindow to file path
            const imagePath = value.replace(/^\//, '');
            const fullImagePath = `${dataPath}/${imagePath}`;
            return {
                property: 'backgroundImage',
                value: `url("file:///${fullImagePath.replace(/\\/g, '/')}")`
            };
        
        case 'image-border':
            const border = parseInt(value) || 0;
            return {
                property: 'backgroundSize',
                value: `calc(100% + ${border * 2}px)`
            };
        
        case 'image-border-top':
        case 'image-border-bottom':
        case 'image-border-left':
        case 'image-border-right':
            // These are handled by background positioning
            return null;
        
        case 'color':
            return {
                property: 'color',
                value: value
            };
        
        case 'background':
            return {
                property: 'backgroundColor',
                value: value
            };
        
        case 'opacity':
            return {
                property: 'opacity',
                value: value
            };
        
        case 'font':
            // Font is handled separately
            return null;
        
        case 'size':
            // Size is handled by width/height
            const [w, h] = value.split(/\s+/);
            return {
                properties: {
                    width: w ? `${w}px` : null,
                    height: h ? `${h}px` : null
                }
            };
        
        case 'padding-top':
            return { property: 'paddingTop', value: `${value}px` };
        case 'padding-bottom':
            return { property: 'paddingBottom', value: `${value}px` };
        case 'padding-left':
            return { property: 'paddingLeft', value: `${value}px` };
        case 'padding-right':
            return { property: 'paddingRight', value: `${value}px` };
        
        case 'margin-top':
            return { property: 'marginTop', value: `${value}px` };
        case 'margin-bottom':
            return { property: 'marginBottom', value: `${value}px` };
        case 'margin-left':
            return { property: 'marginLeft', value: `${value}px` };
        case 'margin-right':
            return { property: 'marginRight', value: `${value}px` };
        
        case 'text-align':
            return { property: 'textAlign', value: value };
        
        case 'text-offset':
            // Text offset affects positioning
            return null;
        
        case 'image-clip':
            // Image clip is handled separately for sprite sheets
            return null;
        
        case 'image-rect':
            // Image rect is handled separately (similar to image-clip)
            return null;
        
        case 'image-color':
            // Image color tinting (would need canvas manipulation)
            return null;
        
        default:
            return null;
    }
}

// Apply OTUI style to a widget element
function applyOTUIStyleToWidget(widget, widgetType) {
    if (!widget || !widgetType) {
        return false;
    }
    
    const styleObj = getStyleForWidget(widgetType);
    if (!styleObj) {
        // No style found - styles might not be loaded or widget type doesn't have a style
        return false;
    }
    
    // Get the actual style object (not just resolved properties) - safe lookup
    const styleName = widgetType ? widgetType.replace('UI', '') : '';
    const fullStyle = (loadedStyles && styleName) ? loadedStyles[styleName] : null;
    
    // Merge base style with state-specific style (e.g., $checked, $unchecked)
    let style = styleObj ? { ...styleObj } : {};
    const fallbackTheme = style.__fallbackTheme || null;
    if (fallbackTheme) {
        delete style.__fallbackTheme;
    }
    
    // Check for widget state (for checkboxes: checked/unchecked) - safe access
    if (fullStyle && fullStyle.states && typeof fullStyle.states === 'object') {
        // Check if widget has checked state (for checkboxes)
        const isChecked = widget.dataset.checked === 'true' || widget.classList.contains('checked');
        
        // Use resolved state properties (they already have base properties merged)
        if (isChecked && fullStyle.states.checked) {
            // Merge checked state properties (already resolved with base)
            style = { ...style, ...fullStyle.states.checked };
        } else if (!isChecked && fullStyle.states.unchecked) {
            // Merge unchecked state properties (already resolved with base)
            style = { ...style, ...fullStyle.states.unchecked };
        }
        
        // Also check for hover/pressed states if needed
        if (widget.classList.contains('hover') && fullStyle.states.hover) {
            style = { ...style, ...fullStyle.states.hover };
        }
        if (widget.classList.contains('pressed') && fullStyle.states.pressed) {
            style = { ...style, ...fullStyle.states.pressed };
        }
    }
    
    // Debug: log what we're applying
    if (window.DEBUG_STYLES) {
        console.log(`Applying styles to ${widgetType}:`, Object.keys(style).slice(0, 10));
    }
    
    // For images, we need the data path, but if not set, we can still apply other styles
    const dataPath = getClientDataPath();
    // Don't require dataPath - we can apply styles without images
    
    // Preserve essential layout properties
    const preservedWidth = widget.style.width;
    const preservedHeight = widget.style.height;
    const preservedLeft = widget.style.left;
    const preservedTop = widget.style.top;
    const preservedPosition = widget.style.position;
    
    // Reset styles but keep layout
    widget.style.boxSizing = 'border-box';
    // Don't reset margin completely - OTUI styles will set it if needed
    // widget.style.margin = '0';
    
    // Remove default builder styles that might interfere
    widget.style.borderRadius = '0'; // OTUI widgets typically don't use border-radius
    
    // Check for image-clip and image-rect FIRST (even without image-source) to enforce size
    // This applies to ALL widgets with image-clip/image-rect, regardless of whether image is loaded
    // IMPORTANT: Check state-specific style FIRST, then base style
    // Checkboxes may have different clips for $checked vs $unchecked states
    // We need to check states BEFORE merging because state image-clip/image-rect should take precedence
    // image-rect works the same as image-clip: x y width height
    let imageClip = null;
    let imageRect = null;
    
    // Check state-specific image-clip/image-rect FIRST (before merging) - safe access
    if (fullStyle && fullStyle.states && typeof fullStyle.states === 'object') {
        const isChecked = widget.dataset.checked === 'true' || widget.classList.contains('checked');
        // Check resolved state first (already merged with base) - safe access
        if (isChecked && fullStyle.states.checked && typeof fullStyle.states.checked === 'object') {
            imageClip = fullStyle.states.checked['image-clip'] || imageClip;
            imageRect = fullStyle.states.checked['image-rect'] || imageRect;
        } else if (!isChecked && fullStyle.states.unchecked && typeof fullStyle.states.unchecked === 'object') {
            imageClip = fullStyle.states.unchecked['image-clip'] || imageClip;
            imageRect = fullStyle.states.unchecked['image-rect'] || imageRect;
        }
        // Also check original state properties if still not found (before resolution) - safe access
        if ((!imageClip && !imageRect) && fullStyle.originalStates && typeof fullStyle.originalStates === 'object') {
            if (isChecked && fullStyle.originalStates.checked && typeof fullStyle.originalStates.checked === 'object') {
                imageClip = fullStyle.originalStates.checked['image-clip'] || imageClip;
                imageRect = fullStyle.originalStates.checked['image-rect'] || imageRect;
            } else if (!isChecked && fullStyle.originalStates.unchecked && typeof fullStyle.originalStates.unchecked === 'object') {
                imageClip = fullStyle.originalStates.unchecked['image-clip'] || imageClip;
                imageRect = fullStyle.originalStates.unchecked['image-rect'] || imageRect;
            }
        }
    }
    
    // If no state clip/rect found, check merged style (base style)
    if (!imageClip) {
        imageClip = style['image-clip'];
    }
    if (!imageRect) {
        imageRect = style['image-rect'];
    }
    
    // image-rect takes precedence over image-clip if both are present
    // Use image-rect if available, otherwise use image-clip
    const finalImageClip = imageRect || imageClip;
    
    let clipX = 0, clipY = 0, clipW = null, clipH = null;
    let hasClip = false;
    
    // Process image-clip or image-rect (both use same format: x y width height)
    if (finalImageClip) {
        const clipParts = finalImageClip.trim().split(/\s+/);
        if (clipParts.length >= 4) {
            clipX = parseInt(clipParts[0] || '0', 10);
            clipY = parseInt(clipParts[1] || '0', 10);
            clipW = parseInt(clipParts[2] || '0', 10);
            clipH = parseInt(clipParts[3] || '0', 10);
            hasClip = clipW > 0 && clipH > 0;
            
            // ALWAYS set size to clip dimensions if we have clip (for ALL widgets)
            // This applies to buttons, checkboxes, separators, etc.
            if (hasClip) {
                // Remove min-width/min-height restrictions for clipped widgets
                // This is critical for separators which are often 1-3px
                widget.style.minWidth = '0';
                widget.style.minHeight = '0';
                widget.style.maxWidth = 'none';
                widget.style.maxHeight = 'none';
                
                // ALWAYS set size to clip dimensions - override any preserved sizes
                // This ensures separators, buttons, checkboxes all show the correct clipped size
                widget.style.width = `${clipW}px`;
                widget.style.height = `${clipH}px`;
                
                // Store clip info - will be used when image is loaded
                widget.dataset.clipSizeApplied = 'true';
                widget.dataset.clipWidth = clipW;
                widget.dataset.clipHeight = clipH;
                widget.dataset.clipX = clipX;
                widget.dataset.clipY = clipY;
            }
        }
    }
    
    // Handle image-source with border (9-slice scaling) - do this first as it affects borders
    // Check for custom image-source from dataset first (user-set property), then style
    let imageSource = getDatasetValue(widget, 'image-source') || style['image-source'];
    if (imageSource) {
        let imagePath = imageSource.replace(/^\//, '');
        
        // Get image URL from cache (works with HTTP/HTTPS)
        let imageUrl = getImageUrl(imagePath);
        let imageApplied = false;
        
        // If not found in cache, try with .png extension
        if (!imageUrl && !imagePath.toLowerCase().endsWith('.png')) {
            imageUrl = getImageUrl(`${imagePath}.png`);
        }
        
        // Debug image lookup
        if (window.DEBUG_STYLES) {
            if (imageUrl) {
                console.log(`✓ Found image for ${widgetType}: ${imagePath} -> ${imageUrl.substring(0, 50)}...`);
            } else {
                console.warn(`✗ Image not found for ${widgetType}: ${imagePath}`);
                console.log(`  Available image paths (first 5):`, Object.keys(imageCache).slice(0, 5));
            }
        }
        
        if (imageUrl) {
            // Use the hasClip variable we already calculated above
            // Handle image borders (9-slice scaling)
            const borderTop = parseInt(style['image-border-top'] || style['image-border'] || '0', 10);
            const borderBottom = parseInt(style['image-border-bottom'] || style['image-border'] || '0', 10);
            const borderLeft = parseInt(style['image-border-left'] || style['image-border'] || '0', 10);
            const borderRight = parseInt(style['image-border-right'] || style['image-border'] || '0', 10);
            const hasBorder = borderTop || borderBottom || borderLeft || borderRight;
            
            // Priority: image-clip takes precedence over border-image for sprite sheets
            // Use the clip info we already calculated above
            if (hasClip && clipW > 0 && clipH > 0) {
                // CROP the image: Position background to show clip region, then crop to exact size
                widget.style.backgroundImage = `url("${imageUrl}")`;
                widget.style.backgroundRepeat = 'no-repeat';
                widget.style.backgroundColor = 'transparent';
                imageApplied = true;
                
                // CROP: Use overflow hidden to crop everything outside the clip region
                widget.style.overflow = 'hidden';
                
                // Remove min-width/min-height restrictions
                widget.style.minWidth = '0';
                widget.style.minHeight = '0';
                
                // Size should already be set above when we detected image-clip
                // But ensure it's correct - ALWAYS use clip dimensions
                widget.style.width = `${clipW}px`;
                widget.style.height = `${clipH}px`;
                widget.style.minWidth = '0';
                widget.style.minHeight = '0';
                
                // Set initial background-size and position IMMEDIATELY (before image loads)
                // Use 'auto' to use the image's natural size - this ensures correct clipping from the start
                // The background-position offsets to show the clip region
                // overflow:hidden crops to the widget size (clipW x clipH)
                widget.style.backgroundSize = 'auto'; // Use natural image size - ensures correct clipping
                widget.style.backgroundPosition = `${-clipX}px ${-clipY}px`;
                
                // Update stored clip info with image URL (before image loads)
                widget.dataset.clipSizeApplied = 'true';
                widget.dataset.clipWidth = clipW;
                widget.dataset.clipHeight = clipH;
                widget.dataset.clipX = clipX;
                widget.dataset.clipY = clipY;
                widget.dataset.originalImageUrl = imageUrl;
                
                // Function to update background size and position based on current widget size
                const updateClipBackground = function(targetEl) {
                    const el = targetEl || widget;
                    const rect = el.getBoundingClientRect();
                    const currentWidth = rect.width || parseInt(el.style.width) || clipW;
                    const currentHeight = rect.height || parseInt(el.style.height) || clipH;
                    const storedClipW = parseInt(el.dataset.clipWidth || '0', 10);
                    const storedClipH = parseInt(el.dataset.clipHeight || '0', 10);
                    
                    if (storedClipW > 0 && storedClipH > 0) {
                        // Calculate scale factors (how much bigger/smaller than original clip)
                        const scaleX = currentWidth / storedClipW;
                        const scaleY = currentHeight / storedClipH;
                        
                        // Get image dimensions (use stored or estimate)
                        const storedClipX = parseInt(el.dataset.clipX || '0', 10);
                        const storedClipY = parseInt(el.dataset.clipY || '0', 10);
                        const imgW = parseInt(el.dataset.imageWidth || '0', 10);
                        const imgH = parseInt(el.dataset.imageHeight || '0', 10);
                        
                        if (imgW > 0 && imgH > 0) {
                            // Use actual image dimensions
                            el.style.backgroundSize = `${imgW * scaleX}px ${imgH * scaleY}px`;
                            el.style.backgroundPosition = `${-storedClipX * scaleX}px ${-storedClipY * scaleY}px`;
                        } else {
                            // Image not loaded yet - use 'auto' for natural size
                            el.style.backgroundSize = 'auto';
                            el.style.backgroundPosition = `${-storedClipX}px ${-storedClipY}px`;
                        }
                    }
                };
                
                // Load image to get actual dimensions for proper scaling
                const img = new Image();
                img.onload = function() {
                    const imgW = this.width;
                    const imgH = this.height;
                    widget.dataset.imageWidth = imgW;
                    widget.dataset.imageHeight = imgH;
                    
                    // Update background immediately after image loads
                    updateClipBackground();
                };
                img.onerror = function() {
                    // If image fails, keep using 'auto' for background-size
                    widget.dataset.imageWidth = '0';
                    widget.dataset.imageHeight = '0';
                    updateClipBackground();
                };
                img.src = imageUrl;
                
                // Add resize observer to scale the cropped image when widget is resized
                // When user resizes, scale the background image proportionally
                if (!widget.dataset.clipObserverAdded) {
                    widget.dataset.clipObserverAdded = 'true';
                    if (window.ResizeObserver) {
                        const resizeObserver = new ResizeObserver(entries => {
                            for (const entry of entries) {
                                const el = entry.target;
                                if (el.dataset.clipSizeApplied === 'true') {
                                    updateClipBackground(el);
                                }
                            }
                        });
                        resizeObserver.observe(widget);
                        
                        // Trigger initial update after DOM is ready
                        // This ensures styles are applied correctly on initial creation
                        // Use double requestAnimationFrame to ensure layout is complete
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                updateClipBackground(widget);
                            });
                        });
                    } else {
                        // ResizeObserver not available - trigger update manually
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                updateClipBackground(widget);
                            });
                        });
                    }
                } else {
                    // Observer already added, but trigger update anyway to ensure it's correct
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            updateClipBackground(widget);
                        });
                    });
                }
                
                // Clear border-image if it was set
                widget.style.borderImageSource = 'none';
                widget.style.border = 'none';
                
            } else if (hasBorder) {
                // 9-slice scaling mode: use border-image
                widget.style.border = 'none';
                widget.style.borderImageSource = `url("${imageUrl}")`;
                widget.style.borderImageSlice = `${borderTop} ${borderRight} ${borderBottom} ${borderLeft} fill`;
                widget.style.borderImageWidth = `${borderTop}px ${borderRight}px ${borderBottom}px ${borderLeft}px`;
                widget.style.borderImageRepeat = 'stretch';
                widget.style.borderImageOutset = '0';
                widget.style.backgroundImage = 'none';
                widget.style.backgroundColor = 'transparent';
                imageApplied = true;
            } else {
                // Regular image mode
                widget.style.backgroundImage = `url("${imageUrl}")`;
                widget.style.backgroundRepeat = 'no-repeat';
                widget.style.backgroundPosition = 'center';
                widget.style.backgroundSize = '100% 100%';
                imageApplied = true;
            }
        }
        
        widget.dataset.imageApplied = imageApplied ? 'true' : 'false';
    } else {
        widget.dataset.imageApplied = 'false';
    }
    
    // Handle background color (if no image or image failed to load)
    // Check both dataset and style for image-source
    const hasImageSource = widget.dataset.imageApplied === 'true';
    
    // Labels should always be transparent - no background, no border
    if (widgetType === 'UILabel') {
        widget.style.backgroundColor = 'transparent';
        widget.style.border = 'none';
        widget.style.boxShadow = 'none';
        widget.style.padding = '0';
    } else if (!hasImageSource || !dataPath) {
        if (style.background) {
            widget.style.backgroundColor = style.background;
        }
    }
    
    if (style.opacity !== undefined) {
        widget.style.opacity = style.opacity;
    }
    
    // Handle padding (OTUI uses padding-top, padding-bottom, etc.)
    const paddingTop = style['padding-top'];
    const paddingBottom = style['padding-bottom'];
    const paddingLeft = style['padding-left'];
    const paddingRight = style['padding-right'];
    const padding = style['padding']; // Also check for single padding value
    
    if (padding) {
        // Single padding value applies to all sides
        widget.style.padding = `${padding}px`;
    } else if (paddingTop !== undefined || paddingBottom !== undefined || paddingLeft !== undefined || paddingRight !== undefined) {
        // Individual padding values
        widget.style.padding = `${paddingTop || '0'}px ${paddingRight || '0'}px ${paddingBottom || '0'}px ${paddingLeft || '0'}px`;
    }
    
    // Handle margins
    const marginTop = style['margin-top'];
    const marginBottom = style['margin-bottom'];
    const marginLeft = style['margin-left'];
    const marginRight = style['margin-right'];
    
    if (marginTop !== undefined) widget.style.marginTop = `${marginTop}px`;
    if (marginBottom !== undefined) widget.style.marginBottom = `${marginBottom}px`;
    if (marginLeft !== undefined) widget.style.marginLeft = `${marginLeft}px`;
    if (marginRight !== undefined) widget.style.marginRight = `${marginRight}px`;
    
    // Handle font (check dataset first for custom values)
    const fontValue = getDatasetValue(widget, 'font') || style.font;
    if (fontValue) {
        widget.style.fontFamily = '"Tahoma", "Arial", sans-serif';
        const fontSizeMatch = fontValue.match(/(\d+)px/);
        if (fontSizeMatch) {
            // Make font size 25% smaller
            const originalSize = parseInt(fontSizeMatch[1], 10);
            const smallerSize = Math.round(originalSize * 0.75);
            widget.style.fontSize = smallerSize + 'px';
        }
        // Apply full font string if provided
        if (fontValue.includes('px')) {
            widget.style.font = fontValue;
        }
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            if (fontSizeMatch) {
                contentEl.style.fontSize = widget.style.fontSize;
            }
            contentEl.style.fontFamily = widget.style.fontFamily;
        }
    }
    
    // Handle color
    if (style.color) {
        widget.style.color = style.color;
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            contentEl.style.color = style.color;
        }
    }
    
    // Handle text alignment (check dataset first for custom values)
    const textAlign = getDatasetValue(widget, 'text-align') || style['text-align'];
    const isWindow = widgetType === 'UIWindow' || widgetType === 'CleanStaticMainWindow';
    const hasTitle = widget.dataset.title && widget.dataset.title.trim() !== '';
    
    if (textAlign) {
        widget.style.textAlign = textAlign;
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            const align = textAlign;
            if (align === 'left' || align === 'topLeft') {
                contentEl.style.justifyContent = 'flex-start';
            } else if (align === 'right' || align === 'topRight') {
                contentEl.style.justifyContent = 'flex-end';
            } else {
                contentEl.style.justifyContent = 'center';
            }
            contentEl.style.textAlign = textAlign;
        }
    }
    
    // Special handling for windows with titles: position title at top center
    // Use OTUI text-offset and text-align properties instead of hardcoded padding
    if (isWindow && hasTitle) {
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            // Get text-offset from style (already handled above, but ensure it's applied)
            const textOffset = style['text-offset'];
            const textAlign = style['text-align'] || 'top';
            
            // Position title at top center using OTUI properties
            // Don't add extra padding - use the actual padding from OTUI style
            contentEl.style.alignItems = 'flex-start';
            contentEl.style.justifyContent = 'center';
            contentEl.style.textAlign = 'center';
            
            // Remove hardcoded padding - let OTUI padding and text-offset handle positioning
            // The padding-top from OTUI (e.g., 35px for Window) already accounts for the title area
        }
    }
    
    // Handle text-offset (check dataset first for custom values)
    // Check for text-offset-x/y in dataset, or text-offset in style
    const textOffsetX = getDatasetValue(widget, 'text-offset-x');
    const textOffsetY = getDatasetValue(widget, 'text-offset-y');
    const textOffset = style['text-offset'];
    
    if (textOffsetX !== undefined || textOffsetY !== undefined || textOffset) {
        let offsetX = 0, offsetY = 0;
        if (textOffsetX !== undefined && textOffsetY !== undefined) {
            // Use dataset values (from properties panel)
            offsetX = parseInt(textOffsetX || '0', 10);
            offsetY = parseInt(textOffsetY || '0', 10);
        } else if (textOffset) {
            // Use style value (from OTUI file)
            const offsetParts = textOffset.split(/\s+/);
            offsetX = parseInt(offsetParts[0] || '0', 10);
            offsetY = parseInt(offsetParts[1] || '0', 10);
        }
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            contentEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }
    }
    
    // Handle opacity
    if (style.opacity !== undefined) {
        widget.style.opacity = style.opacity;
    }
    
    // Special handling for separators: enforce constrained dimension but allow resizing in other dimension
    const isHorizontalSeparator = widgetType === 'UIHorizontalSeparator';
    const isVerticalSeparator = widgetType === 'UIVerticalSeparator';
    const isSeparator = isHorizontalSeparator || isVerticalSeparator;
    
    // Handle size (but preserve if widget already has a size from user)
    // IMPORTANT: If image-clip is present, NEVER override with size property
    // image-clip takes absolute precedence for sizing
    if (!widget.dataset.clipSizeApplied) {
        if (style.size) {
            const [w, h] = style.size.split(/\s+/);
            const sizeW = parseInt(w, 10);
            const sizeH = parseInt(h, 10);
            
            // Apply size - even very small sizes (1-3px) should be respected
            // This is critical for separators which are often 1-3px thick
            // Remove min-width/min-height restrictions for small widgets
            if (sizeW > 0 && sizeW < 10) {
                widget.style.minWidth = '0';
            }
            if (sizeH > 0 && sizeH < 10) {
                widget.style.minHeight = '0';
            }
            
            // Special handling for separators
            if (isSeparator) {
                if (isHorizontalSeparator) {
                    // HorizontalSeparator: enforce height (from OTUI or default 2px), allow width to be resized
                    const separatorHeight = sizeH > 0 ? sizeH : 2; // Default to 2px if not specified
                    widget.style.height = `${separatorHeight}px`;
                    widget.style.minHeight = `${separatorHeight}px`;
                    widget.style.maxHeight = `${separatorHeight}px`; // Lock height
                    // Width can be resized - only set if not preserved
                    if (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '') {
                        widget.style.width = sizeW > 0 ? `${sizeW}px` : '100px'; // Default width
                    } else {
                        widget.style.width = preservedWidth; // Keep user's width
                    }
                } else if (isVerticalSeparator) {
                    // VerticalSeparator: enforce width (from OTUI or default 2px), allow height to be resized
                    const separatorWidth = sizeW > 0 ? sizeW : 2; // Default to 2px if not specified
                    widget.style.width = `${separatorWidth}px`;
                    widget.style.minWidth = `${separatorWidth}px`;
                    widget.style.maxWidth = `${separatorWidth}px`; // Lock width
                    // Height can be resized - only set if not preserved
                    if (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '') {
                        widget.style.height = sizeH > 0 ? `${sizeH}px` : '100px'; // Default height
                    } else {
                        widget.style.height = preservedHeight; // Keep user's height
                    }
                }
            } else {
                // Regular widgets: apply size but allow FREE resizing (NO min-width/min-height)
                widget.style.minWidth = '0';
                widget.style.minHeight = '0';
                widget.style.maxWidth = 'none';
                widget.style.maxHeight = 'none';
                
                // Only set if widget doesn't have a preserved size (user hasn't resized it)
                if (w && sizeW > 0 && (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '')) {
                    widget.style.width = `${sizeW}px`;
                }
                if (h && sizeH > 0 && (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '')) {
                    widget.style.height = `${sizeH}px`;
                }
            }
        } else if (isSeparator) {
            // Separator without size property - use defaults
            if (isHorizontalSeparator) {
                widget.style.height = '2px';
                widget.style.minHeight = '2px';
                widget.style.maxHeight = '2px';
                if (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '') {
                    widget.style.width = '100px';
                } else {
                    widget.style.width = preservedWidth;
                }
            } else if (isVerticalSeparator) {
                widget.style.width = '2px';
                widget.style.minWidth = '2px';
                widget.style.maxWidth = '2px';
                if (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '') {
                    widget.style.height = '100px';
                } else {
                    widget.style.height = preservedHeight;
                }
            }
        } else {
            // Regular widgets: NO min-width/min-height restrictions - allow free resizing
            widget.style.minWidth = '0';
            widget.style.minHeight = '0';
            widget.style.maxWidth = 'none';
            widget.style.maxHeight = 'none';
        }
        
        // Restore preserved dimensions if they were custom (but not if clip size was applied)
        // For separators, only restore the resizable dimension
        if (isSeparator) {
            if (isHorizontalSeparator) {
                // Only restore width (height is locked)
                if (preservedWidth && preservedWidth !== '140px' && preservedWidth !== 'auto' && preservedWidth !== '') {
                    widget.style.width = preservedWidth;
                }
            } else if (isVerticalSeparator) {
                // Only restore height (width is locked)
                if (preservedHeight && preservedHeight !== '90px' && preservedHeight !== 'auto' && preservedHeight !== '') {
                    widget.style.height = preservedHeight;
                }
            }
        } else {
            // Regular widgets: restore both dimensions
            if (preservedWidth && preservedWidth !== '140px' && preservedWidth !== 'auto' && preservedWidth !== '') {
                widget.style.width = preservedWidth;
            }
            if (preservedHeight && preservedHeight !== '90px' && preservedHeight !== 'auto' && preservedHeight !== '') {
                widget.style.height = preservedHeight;
            }
        }
    } else {
        // For widgets with image-clip, ensure min-width/min-height are removed
        // AND ensure size property doesn't override clip dimensions
        widget.style.minWidth = '0';
        widget.style.minHeight = '0';
        widget.style.maxWidth = 'none';
        widget.style.maxHeight = 'none';
        
        // Re-enforce clip size - size property should NEVER override image-clip
        const clipW = parseInt(widget.dataset.clipWidth || '0', 10);
        const clipH = parseInt(widget.dataset.clipHeight || '0', 10);
        if (clipW > 0 && clipH > 0) {
            // Only set if user hasn't manually resized (check if current size matches clip)
            const currentW = parseInt(widget.style.width) || 0;
            const currentH = parseInt(widget.style.height) || 0;
            // If size was overridden by style.size, reset it to clip dimensions
            if (currentW !== clipW || currentH !== clipH) {
                // Check if this is a preserved user resize or an override
                if (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '') {
                    widget.style.width = `${clipW}px`;
                }
                if (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '') {
                    widget.style.height = `${clipH}px`;
                }
            }
        }
    }
    // Note: Clip size re-enforcement moved to the absolute end of the function
    
    // Restore position
    if (preservedPosition) widget.style.position = preservedPosition;
    if (preservedLeft) widget.style.left = preservedLeft;
    if (preservedTop) widget.style.top = preservedTop;
    
    // Apply other properties
    for (const [key, value] of Object.entries(style)) {
        // Skip properties we've already handled
        if (['image-source', 'image-border', 'image-border-top', 'image-border-bottom', 
             'image-border-left', 'image-border-right', 'image-clip', 'image-rect', 'image-color',
             'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 
             'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 
             'font', 'color', 'background', 'opacity', 'size', 'text-align', 'text-offset'].includes(key)) {
            continue;
        }
        
        const css = convertOTUIPropertyToCSS(key, value, dataPath);
        if (css) {
            if (css.properties) {
                for (const [prop, val] of Object.entries(css.properties)) {
                    if (val) widget.style[prop] = val;
                }
            } else if (css.property) {
                widget.style[css.property] = css.value;
            }
        }
    }
    
    // Final re-enforcement: If image-clip was applied, ensure size is correct
    // This must be at the end to override any size property that was applied
    // This ensures separators, checkboxes, and buttons with image-clip always use clip dimensions
    // BUT: For separators, only enforce the constrained dimension from clip
    if (widget.dataset.clipSizeApplied === 'true') {
        const clipW = parseInt(widget.dataset.clipWidth || '0', 10);
        const clipH = parseInt(widget.dataset.clipHeight || '0', 10);
        if (clipW > 0 && clipH > 0) {
            if (isSeparator) {
                // For separators, only enforce the constrained dimension from clip
                if (isHorizontalSeparator) {
                    // HorizontalSeparator: enforce height from clip, allow width to be resized
                    widget.style.height = `${clipH}px`;
                    widget.style.minHeight = `${clipH}px`;
                    widget.style.maxHeight = `${clipH}px`;
                    // Width can be resized - only set if not preserved
                    if (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '') {
                        widget.style.width = `${clipW}px`;
                    }
                } else if (isVerticalSeparator) {
                    // VerticalSeparator: enforce width from clip, allow height to be resized
                    widget.style.width = `${clipW}px`;
                    widget.style.minWidth = `${clipW}px`;
                    widget.style.maxWidth = `${clipW}px`;
                    // Height can be resized - only set if not preserved
                    if (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '') {
                        widget.style.height = `${clipH}px`;
                    }
                }
            } else {
                // Regular widgets: check if size was overridden - if so, reset to clip dimensions
                const currentW = parseInt(widget.style.width) || 0;
                const currentH = parseInt(widget.style.height) || 0;
                // Only reset if it doesn't match clip AND user hasn't manually resized
                if ((currentW !== clipW || currentH !== clipH) && 
                    (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '')) {
                    widget.style.width = `${clipW}px`;
                }
                if ((currentW !== clipW || currentH !== clipH) && 
                    (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '')) {
                    widget.style.height = `${clipH}px`;
                }
            }
        }
    } else if (isSeparator) {
        // Final re-enforcement for separators without image-clip
        // Ensure locked dimensions are maintained
        if (isHorizontalSeparator) {
            const lockedHeight = parseInt(widget.style.height) || 2;
            widget.style.minHeight = `${lockedHeight}px`;
            widget.style.maxHeight = `${lockedHeight}px`;
        } else if (isVerticalSeparator) {
            const lockedWidth = parseInt(widget.style.width) || 2;
            widget.style.minWidth = `${lockedWidth}px`;
            widget.style.maxWidth = `${lockedWidth}px`;
        }
    }
    
    return true; // Styles were applied
}

// Load and store image files
async function loadImageFile(file, relativePath) {
    return new Promise((resolve, reject) => {
        // Normalize path: remove leading slash, use forward slashes
        const normalizedPath = relativePath.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
        
        // Store file reference
        imageFiles[normalizedPath] = file;
        
        // Create blob URL for immediate use
        const blobUrl = URL.createObjectURL(file);
        imageCache[normalizedPath] = blobUrl;
        
        // Also store with "images/" prefix if not present (for OTUI style references)
        if (!normalizedPath.startsWith('images/')) {
            imageCache[`images/${normalizedPath}`] = blobUrl;
        }
        
        // Also try variations (with/without extension, different cases)
        const pathWithoutExt = normalizedPath.replace(/\.(png|jpg|jpeg|gif|bmp|webp)$/i, '');
        imageCache[pathWithoutExt] = blobUrl;
        if (!pathWithoutExt.startsWith('images/')) {
            imageCache[`images/${pathWithoutExt}`] = blobUrl;
        }
        
        // Store filename only for fallback matching
        const fileName = normalizedPath.split('/').pop();
        if (fileName) {
            imageCache[fileName] = blobUrl;
        }
        
        resolve(blobUrl);
    });
}

// Load multiple image files from FileList
async function loadImageFiles(files) {
    const loaded = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    
    for (const file of files) {
        if (file.webkitRelativePath) {
            // File from directory input - extract path relative to images folder
            let relativePath = file.webkitRelativePath;
            
            // Remove leading folder name if it's "images" or similar
            relativePath = relativePath.replace(/^(images?|data)[\/\\]?/i, '');
            relativePath = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
            
            if (imageExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
                try {
                    const url = await loadImageFile(file, relativePath);
                    // Also store with "images/" prefix for OTUI style references
                    const pathWithImages = `images/${relativePath}`;
                    imageCache[pathWithImages.toLowerCase()] = url;
                    loaded.push({ path: relativePath, url });
                } catch (error) {
                    console.warn(`Failed to load image ${file.name}:`, error);
                }
            }
        } else {
            // Single file - try to infer path from name
            const fileName = file.name.toLowerCase();
            if (imageExtensions.some(ext => fileName.endsWith(ext))) {
                try {
                    // Try common image paths
                    const possiblePaths = [
                        `images/${file.name}`,
                        `images/ui/${file.name}`,
                        file.name
                    ];
                    for (const path of possiblePaths) {
                        const url = await loadImageFile(file, path);
                        loaded.push({ path, url });
                    }
                } catch (error) {
                    console.warn(`Failed to load image ${file.name}:`, error);
                }
            }
        }
    }
    
    console.log(`✓ Loaded ${loaded.length} image(s) into cache`);
    console.log(`Sample cached paths:`, Object.keys(imageCache).slice(0, 5));
    
    if (typeof window !== 'undefined' && loaded.length > 0) {
        window._imagesLoaded = true;
    }
    
    return loaded;
}

// Get image URL for a given path
function getImageUrl(imagePath) {
    if (!imagePath) return null;
    
    // Normalize path - OTUI paths are like "images/ui/button.png"
    let normalizedPath = imagePath.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
    
    // Try exact match first
    if (imageCache[normalizedPath]) {
        return imageCache[normalizedPath];
    }
    
    // Try with "images/" prefix if not present
    if (!normalizedPath.startsWith('images/')) {
        const pathWithImages = `images/${normalizedPath}`;
        if (imageCache[pathWithImages]) {
            return imageCache[pathWithImages];
        }
    }
    
    // Try without "images/" prefix if present
    if (normalizedPath.startsWith('images/')) {
        const pathWithoutImages = normalizedPath.replace(/^images\//, '');
        if (imageCache[pathWithoutImages]) {
            return imageCache[pathWithoutImages];
        }
    }
    
    // Try without extension
    const pathWithoutExt = normalizedPath.replace(/\.(png|jpg|jpeg|gif|bmp|webp)$/i, '');
    if (imageCache[pathWithoutExt]) {
        return imageCache[pathWithoutExt];
    }
    
    // Try with .png extension
    if (!normalizedPath.endsWith('.png')) {
        const pathWithPng = pathWithoutExt + '.png';
        if (imageCache[pathWithPng]) {
            return imageCache[pathWithPng];
        }
        // Also try with images/ prefix
        const pathWithImagesPng = `images/${pathWithPng}`;
        if (imageCache[pathWithImagesPng]) {
            return imageCache[pathWithImagesPng];
        }
    }
    
    // Try filename-only match (for cases where path structure differs)
    const fileName = normalizedPath.split('/').pop();
    if (fileName && imageCache[fileName]) {
        return imageCache[fileName];
    }
    
    // Try partial matches (for nested paths) - check if any cached path ends with our path
    for (const cachedPath in imageCache) {
        // Check if cached path ends with our normalized path
        if (cachedPath.endsWith(normalizedPath)) {
            return imageCache[cachedPath];
        }
        // Check if normalized path ends with cached path (reverse match)
        if (normalizedPath.endsWith(cachedPath)) {
            return imageCache[cachedPath];
        }
        // Check if filenames match
        const cachedFileName = cachedPath.split('/').pop();
        if (fileName && cachedFileName === fileName) {
            return imageCache[cachedPath];
        }
    }
    
    return null;
}

// Load OTUI file from File object (user-selected file)
async function loadOTUIFileFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                // parseOTUIFile now returns a promise - await it
                const styles = await parseOTUIFile(content);
                // Store with filename as key
                const filename = file.name;
                styleCache[filename] = styles;
                Object.assign(loadedStyles, styles);
                
                // Debug: show property count for first style
                const firstStyleName = Object.keys(styles)[0];
                if (firstStyleName) {
                    const firstStyle = styles[firstStyleName];
                    const propCount = Object.keys(firstStyle.properties || {}).length;
                    console.log(`✓ Loaded ${filename}: ${Object.keys(styles).length} styles (${firstStyleName} has ${propCount} properties)`);
                } else {
                    console.log(`✓ Loaded ${filename}: ${Object.keys(styles).length} styles`);
                }
                
                resolve(styles);
            } catch (error) {
                // Check if it's a connection error
                const isConnectionError = error.message.includes('Failed to fetch') || 
                                          error.message.includes('ERR_CONNECTION_REFUSED') ||
                                          error.message.includes('NetworkError');
                
                if (isConnectionError) {
                    console.warn(`API server not available for ${file.name}. Please ensure the server is running.`);
                    // Return empty styles instead of failing completely
                    const filename = file.name;
                    styleCache[filename] = {};
                    resolve({});
                } else {
                    console.error(`Error parsing ${file.name}:`, error);
                    reject(error);
                }
            }
        };
        reader.onerror = () => {
            console.error(`Error reading ${file.name}`);
            reject(new Error(`Failed to read ${file.name}`));
        };
        reader.readAsText(file);
    });
}

// Load multiple OTUI files from FileList
async function loadOTUIFilesFromFiles(files) {
    const loaded = [];
    for (const file of files) {
        if (file.name.endsWith('.otui')) {
            try {
                const styles = await loadOTUIFileFromFile(file);
                loaded.push({ filename: file.name, styles });
            } catch (error) {
                console.warn(`Failed to load ${file.name}:`, error);
            }
        }
    }
    
    if (typeof window !== 'undefined' && loaded.length > 0) {
        window._stylesLoaded = true;
    }
    
    return loaded;
}

// Export functions
window.OTUIStyleLoader = {
    setClientDataPath,
    getClientDataPath,
    loadAllStyles,
    getStyleForWidget,
    applyOTUIStyleToWidget,
    loadOTUIFilesFromFiles,
    loadImageFiles,
    getImageUrl,
    resolveInheritance,
    loadedStyles: () => loadedStyles,
    imageCache: () => imageCache
};

