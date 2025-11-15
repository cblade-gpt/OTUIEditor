// OBJS/styleloader.js - OTUI Style Loader for OTClientV8
let clientDataPath = null;
let loadedStyles = {};
let styleCache = {};
let imageCache = {}; // Maps image paths to blob URLs: { "images/ui/button.png": "blob:http://..." }
let imageFiles = {}; // Maps image paths to File objects: { "images/ui/button.png": File }

// Widget type mapping from OTUI to builder
const WIDGET_TYPE_MAP = {
    'UIWindow': 'UIWindow',
    'Window': 'UIWindow',
    'UILabel': 'UILabel',
    'Label': 'UILabel',
    'UIPanel': 'UIPanel',
    'Panel': 'UIPanel',
    'UIWidget': 'UIPanel',
    'UIScrollArea': 'UIScrollArea',
    'ScrollablePanel': 'UIScrollArea',
    'UIScrollBar': 'UIScrollBar',
    'VerticalScrollBar': 'UIScrollBar',
    'HorizontalScrollBar': 'UIScrollBar',
    'UIMiniWindow': 'UIMiniWindow',
    'MiniWindow': 'UIMiniWindow',
    'UIButton': 'UIButton',
    'Button': 'UIButton',
    'UITextEdit': 'UITextEdit',
    'TextEdit': 'UITextEdit',
    'UICheckBox': 'UICheckBox',
    'CheckBox': 'UICheckBox',
    'UIRadioButton': 'UIRadioButton',
    'RadioButton': 'UIRadioButton',
    'UIProgressBar': 'UIProgressBar',
    'ProgressBar': 'UIProgressBar',
    'UIItem': 'UIItem',
    'Item': 'UIItem',
    'UIImage': 'UIImage',
    'Image': 'UIImage',
    'UISprite': 'UISprite',
    'Sprite': 'UISprite'
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
    const styles = {};
    const lines = content.split('\n');
    let currentStyle = null;
    let currentState = null;
    let indentLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith('//')) continue;
        
        // Check for style definition (WidgetName < ParentWidget or WidgetName)
        const styleMatch = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:<\s*([A-Za-z][A-Za-z0-9_]*))?/);
        if (styleMatch) {
            const styleName = styleMatch[1];
            const parentName = styleMatch[2];
            
            currentStyle = {
                name: styleName,
                parent: parentName,
                properties: {},
                states: {}
            };
            styles[styleName] = currentStyle;
            currentState = null;
            indentLevel = 0;
            continue;
        }
        
        // Check for state ($hover, $pressed, etc.)
        const stateMatch = line.match(/^\$([a-z]+)/);
        if (stateMatch) {
            const stateName = stateMatch[1];
            if (!currentStyle.states[stateName]) {
                currentStyle.states[stateName] = {};
            }
            currentState = currentStyle.states[stateName];
            continue;
        }
        
        // Check for property (key: value)
        const propMatch = line.match(/^([a-z-]+):\s*(.+)$/);
        if (propMatch && currentStyle) {
            const key = propMatch[1];
            const value = propMatch[2].trim();
            
            const target = currentState || currentStyle.properties;
            target[key] = value;
        }
    }
    
    return styles;
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
                        const styles = parseOTUIFile(content);
                        styleCache[filename] = styles;
                        return styles;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback to XMLHttpRequest for file://
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `file:///${path.replace(/\\/g, '/')}/styles/${filename}`, true);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 0 || xhr.status === 200) {
                            const content = xhr.responseText;
                            const styles = parseOTUIFile(content);
                            styleCache[filename] = styles;
                            resolve(styles);
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
        const resolved = resolveStyle(styleName);
        loadedStyles[styleName].resolved = resolved;
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
        'UIWindow': 'Window',
        'UILabel': 'Label',
        'UIPanel': 'Panel',
        'UIWidget': 'Panel',
        'UIScrollArea': 'ScrollablePanel',
        'UIScrollBar': 'VerticalScrollBar',
        'UIMiniWindow': 'MiniWindow',
        'UIButton': 'Button',
        'UITextEdit': 'TextEdit',
        'UICheckBox': 'CheckBox',
        'UIRadioButton': 'RadioButton',
        'UIProgressBar': 'ProgressBar',
        'UIItem': 'Item',
        'UIImage': 'Image',
        'UISprite': 'Sprite'
    };
    
    // Get the style name for this widget type
    const styleName = styleNameMap[widgetType] || widgetType.replace('UI', '');
    
    // Try to find the style directly
    let style = loadedStyles[styleName];
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
    
    // Try parent styles
    if (style && style.parent) {
        const parentStyle = loadedStyles[style.parent];
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
        'UILabel': ['Label', 'GameLabel'],
        'UIPanel': ['Panel', 'FlatPanel'],
        'UIScrollArea': ['ScrollablePanel', 'Panel'],
        'UIScrollBar': ['VerticalScrollBar', 'HorizontalScrollBar'],
        'UIMiniWindow': ['MiniWindow'],
        'UIButton': ['Button']
    };
    
    if (fallbacks[widgetType]) {
        for (const fallbackName of fallbacks[widgetType]) {
            const fallbackStyle = loadedStyles[fallbackName];
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
    
    const style = getStyleForWidget(widgetType);
    if (!style) {
        // No style found - styles might not be loaded or widget type doesn't have a style
        return false;
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
    
    // Handle image-source with border (9-slice scaling) - do this first as it affects borders
    if (style['image-source']) {
        let imagePath = style['image-source'].replace(/^\//, '');
        
        // Get image URL from cache (works with HTTP/HTTPS)
        let imageUrl = getImageUrl(imagePath);
        
        // If not found in cache, try with .png extension
        if (!imageUrl && !imagePath.toLowerCase().endsWith('.png')) {
            imageUrl = getImageUrl(`${imagePath}.png`);
        }
        
        if (imageUrl) {
            // Handle image-clip (sprite sheet coordinates: x y width height)
            const imageClip = style['image-clip'];
            let clipX = 0, clipY = 0, clipW = null, clipH = null;
            
            if (imageClip) {
                const clipParts = imageClip.split(/\s+/);
                clipX = parseInt(clipParts[0] || '0');
                clipY = parseInt(clipParts[1] || '0');
                clipW = parseInt(clipParts[2] || '0');
                clipH = parseInt(clipParts[3] || '0');
            }
            
            // Handle image borders (9-slice scaling)
            const borderTop = parseInt(style['image-border-top'] || style['image-border'] || '0');
            const borderBottom = parseInt(style['image-border-bottom'] || style['image-border'] || '0');
            const borderLeft = parseInt(style['image-border-left'] || style['image-border'] || '0');
            const borderRight = parseInt(style['image-border-right'] || style['image-border'] || '0');
            
            if (borderTop || borderBottom || borderLeft || borderRight) {
                // Use border-image for 9-slice scaling
                widget.style.border = 'none';
                widget.style.borderImageSource = `url("${imageUrl}")`;
                widget.style.borderImageSlice = `${borderTop} ${borderRight} ${borderBottom} ${borderLeft} fill`;
                widget.style.borderImageWidth = `${borderTop}px ${borderRight}px ${borderBottom}px ${borderLeft}px`;
                widget.style.borderImageRepeat = 'stretch';
                widget.style.borderImageOutset = '0';
                widget.style.backgroundImage = 'none';
                widget.style.backgroundColor = 'transparent';
                
                // If image-clip is specified, we need to use background-image with clip-path or create a sprite
                if (imageClip && clipW && clipH) {
                    // Use background-image with positioning for sprite sheets
                    widget.style.backgroundImage = `url("${imageUrl}")`;
                    widget.style.backgroundPosition = `-${clipX}px -${clipY}px`;
                    widget.style.backgroundSize = 'auto';
                    widget.style.backgroundRepeat = 'no-repeat';
                    // Override border-image
                    widget.style.borderImageSource = 'none';
                    widget.style.border = 'none';
                }
            } else {
                // Use background image (with sprite sheet support)
                widget.style.backgroundImage = `url("${imageUrl}")`;
                widget.style.backgroundRepeat = 'no-repeat';
                
                if (imageClip && clipW && clipH) {
                    // Sprite sheet: position the background to show the clipped portion
                    widget.style.backgroundPosition = `-${clipX}px -${clipY}px`;
                    widget.style.backgroundSize = 'auto';
                    // Set size to match clip dimensions if not already set
                    if (!preservedWidth || preservedWidth === 'auto' || preservedWidth === '') {
                        widget.style.width = `${clipW}px`;
                    }
                    if (!preservedHeight || preservedHeight === 'auto' || preservedHeight === '') {
                        widget.style.height = `${clipH}px`;
                    }
                } else {
                    // Regular image
                    widget.style.backgroundPosition = 'center';
                    const border = parseInt(style['image-border'] || '0');
                    if (border) {
                        widget.style.backgroundSize = `calc(100% + ${border * 2}px)`;
                    } else {
                        widget.style.backgroundSize = '100% 100%';
                    }
                }
            }
        }
    }
    
    // Handle background color (if no image or image failed to load)
    if (!style['image-source'] || !dataPath) {
        if (style.background) {
            widget.style.backgroundColor = style.background;
        }
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
    
    // Handle font
    if (style.font) {
        widget.style.fontFamily = '"Tahoma", "Arial", sans-serif';
        const fontSizeMatch = style.font.match(/(\d+)px/);
        if (fontSizeMatch) {
            widget.style.fontSize = fontSizeMatch[1] + 'px';
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
    
    // Handle text alignment
    if (style['text-align']) {
        widget.style.textAlign = style['text-align'];
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            const align = style['text-align'];
            if (align === 'left' || align === 'topLeft') {
                contentEl.style.justifyContent = 'flex-start';
            } else if (align === 'right' || align === 'topRight') {
                contentEl.style.justifyContent = 'flex-end';
            } else {
                contentEl.style.justifyContent = 'center';
            }
        }
    }
    
    // Handle text-offset (adjusts text position)
    if (style['text-offset']) {
        const offsetParts = style['text-offset'].split(/\s+/);
        const offsetX = parseInt(offsetParts[0] || '0');
        const offsetY = parseInt(offsetParts[1] || '0');
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            contentEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }
    }
    
    // Handle opacity
    if (style.opacity !== undefined) {
        widget.style.opacity = style.opacity;
    }
    
    // Handle size (but preserve if widget already has a size from user)
    // Only apply default size if widget doesn't have a custom size
    if (style.size) {
        const [w, h] = style.size.split(/\s+/);
        // Only set size if widget doesn't have a preserved size (user hasn't resized it)
        if (w && (!preservedWidth || preservedWidth === '140px' || preservedWidth === 'auto' || preservedWidth === '')) {
            widget.style.width = `${w}px`;
        }
        if (h && (!preservedHeight || preservedHeight === '90px' || preservedHeight === 'auto' || preservedHeight === '')) {
            widget.style.height = `${h}px`;
        }
    }
    
    // Restore preserved dimensions if they were custom
    if (preservedWidth && preservedWidth !== '140px') widget.style.width = preservedWidth;
    if (preservedHeight && preservedHeight !== '90px') widget.style.height = preservedHeight;
    
    // Restore position
    if (preservedPosition) widget.style.position = preservedPosition;
    if (preservedLeft) widget.style.left = preservedLeft;
    if (preservedTop) widget.style.top = preservedTop;
    
    // Apply other properties
    for (const [key, value] of Object.entries(style)) {
        // Skip properties we've already handled
        if (['image-source', 'image-border', 'image-border-top', 'image-border-bottom', 
             'image-border-left', 'image-border-right', 'image-clip', 'image-color',
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
        
        // Also try variations (with/without extension, different cases)
        const pathWithoutExt = normalizedPath.replace(/\.(png|jpg|jpeg)$/i, '');
        imageCache[pathWithoutExt] = blobUrl;
        
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
    return loaded;
}

// Get image URL for a given path
function getImageUrl(imagePath) {
    if (!imagePath) return null;
    
    // Normalize path
    let normalizedPath = imagePath.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase();
    
    // Try exact match
    if (imageCache[normalizedPath]) {
        return imageCache[normalizedPath];
    }
    
    // Try without extension
    const pathWithoutExt = normalizedPath.replace(/\.(png|jpg|jpeg)$/i, '');
    if (imageCache[pathWithoutExt]) {
        return imageCache[pathWithoutExt];
    }
    
    // Try with .png extension
    if (!normalizedPath.endsWith('.png')) {
        const pathWithPng = pathWithoutExt + '.png';
        if (imageCache[pathWithPng]) {
            return imageCache[pathWithPng];
        }
    }
    
    // Try partial matches (for nested paths)
    for (const cachedPath in imageCache) {
        if (cachedPath.endsWith(normalizedPath) || normalizedPath.endsWith(cachedPath)) {
            return imageCache[cachedPath];
        }
    }
    
    return null;
}

// Load OTUI file from File object (user-selected file)
async function loadOTUIFileFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const styles = parseOTUIFile(content);
                // Store with filename as key
                const filename = file.name;
                styleCache[filename] = styles;
                Object.assign(loadedStyles, styles);
                console.log(`✓ Loaded ${filename}: ${Object.keys(styles).length} styles`);
                resolve(styles);
            } catch (error) {
                console.error(`Error parsing ${file.name}:`, error);
                reject(error);
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

