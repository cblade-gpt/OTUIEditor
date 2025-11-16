// OBJS/otui-parser.js - Parse OTUI code and create widgets on canvas
// Supports dynamically discovered widgets from loaded OTUI styles

// Helper function to apply anchors to position a widget relative to its parent
function applyAnchorsToWidget(widget, widgetData, parent) {
    if (!parent || parent.id === 'editorContent') {
        // Root level widget - no anchors to apply
        return;
    }
    
    // Get parent dimensions - offsetWidth/Height includes padding but not margin
    const parentWidth = parent.offsetWidth || parseInt(parent.style.width) || 400;
    const parentHeight = parent.offsetHeight || parseInt(parent.style.height) || 300;
    
    // Get parent padding - margins in OTUI are relative to the content area (after padding)
    // In CSS, position:absolute children are positioned relative to padding box
    // But in OTUI, anchors are relative to content box, so we need to account for parent padding
    const parentStyle = window.getComputedStyle(parent);
    const parentPaddingLeft = parseInt(parentStyle.paddingLeft) || 0;
    const parentPaddingTop = parseInt(parentStyle.paddingTop) || 0;
    const parentPaddingRight = parseInt(parentStyle.paddingRight) || 0;
    const parentPaddingBottom = parseInt(parentStyle.paddingBottom) || 0;
    
    // Calculate content area dimensions (excluding padding)
    const contentWidth = parentWidth - parentPaddingLeft - parentPaddingRight;
    const contentHeight = parentHeight - parentPaddingTop - parentPaddingBottom;
    
    const widgetWidth = parseInt(widget.style.width) || widget.offsetWidth || 100;
    const widgetHeight = parseInt(widget.style.height) || widget.offsetHeight || 100;
    
    // Get anchor properties
    const anchors = {};
    const margins = { left: 0, top: 0, right: 0, bottom: 0 };
    
    // Parse anchor properties from widgetData
    // OTCv8 uses case-insensitive anchor names: left, right, top, bottom, horizontalcenter, verticalcenter
    Object.keys(widgetData.properties).forEach(key => {
        if (key.startsWith('anchors.')) {
            const anchorTypeRaw = key.replace('anchors.', '');
            const anchorTypeLower = anchorTypeRaw.toLowerCase();
            const anchorValue = widgetData.properties[key];
            
            // Normalize anchor type names to match OTCv8 (case-insensitive)
            // OTCv8 recognizes: left, right, top, bottom, horizontalcenter, verticalcenter
            let normalizedType;
            if (anchorTypeLower === 'left') {
                normalizedType = 'left';
            } else if (anchorTypeLower === 'right') {
                normalizedType = 'right';
            } else if (anchorTypeLower === 'top') {
                normalizedType = 'top';
            } else if (anchorTypeLower === 'bottom') {
                normalizedType = 'bottom';
            } else if (anchorTypeLower === 'horizontalcenter' || anchorTypeLower === 'horizontal-center') {
                normalizedType = 'horizontalCenter';
            } else if (anchorTypeLower === 'verticalcenter' || anchorTypeLower === 'vertical-center') {
                normalizedType = 'verticalCenter';
            } else if (anchorTypeLower === 'centerin' || anchorTypeLower === 'center-in') {
                normalizedType = 'centerIn';
            } else if (anchorTypeLower === 'fill') {
                normalizedType = 'fill';
            } else {
                // Unknown anchor type - use as-is but log warning
                console.warn(`Unknown anchor type: ${anchorTypeRaw}, using as-is`);
                normalizedType = anchorTypeRaw;
            }
            
            anchors[normalizedType] = anchorValue; // Store the value, but we check for existence
        } else if (key.startsWith('margin-')) {
            const marginType = key.replace('margin-', '');
            margins[marginType] = parseInt(widgetData.properties[key]) || 0;
        }
    });
    
    // Apply anchors to calculate position relative to CONTENT area
    // CRITICAL: Anchors define the base location, then margins are applied as offsets
    // If no anchors are specified, default to anchors.left and anchors.top
    let left = 0;
    let top = 0;
    
    // Check if any anchors are specified
    const hasAnchors = Object.keys(anchors).length > 0;
    
    // Handle anchors.centerIn (value is typically "parent")
    if (anchors.centerIn !== undefined) {
        // Anchor: center in parent
        left = (contentWidth - widgetWidth) / 2;
        top = (contentHeight - widgetHeight) / 2;
        // Apply margins as offset from center
        left += (margins.left || 0) - (margins.right || 0);
        top += (margins.top || 0) - (margins.bottom || 0);
    } else {
        // Handle anchors.fill
        if (anchors.fill !== undefined) {
            // Anchor: fill parent
            left = margins.left || 0;
            top = margins.top || 0;
            widget.style.width = `${contentWidth - (margins.left || 0) - (margins.right || 0)}px`;
            widget.style.height = `${contentHeight - (margins.top || 0) - (margins.bottom || 0)}px`;
        } else {
            // Handle individual anchors - anchors define base position, margins are offsets
            // Horizontal positioning
            if (anchors.left !== undefined) {
                // Anchor: left edge
                left = margins.left || 0;
            } else if (anchors.right !== undefined) {
                // Anchor: right edge
                left = contentWidth - widgetWidth - (margins.right || 0);
            } else if (anchors.horizontalCenter !== undefined) {
                // Anchor: horizontal center
                left = (contentWidth - widgetWidth) / 2 + (margins.left || 0) - (margins.right || 0);
            } else {
                // No horizontal anchor specified - default to left anchor with margin
                left = margins.left || 0;
            }
            
            // Vertical positioning
            if (anchors.top !== undefined) {
                // Anchor: top edge
                top = margins.top || 0;
            } else if (anchors.bottom !== undefined) {
                // Anchor: bottom edge
                top = contentHeight - widgetHeight - (margins.bottom || 0);
            } else if (anchors.verticalCenter !== undefined) {
                // Anchor: vertical center
                top = (contentHeight - widgetHeight) / 2 + (margins.top || 0) - (margins.bottom || 0);
            } else {
                // No vertical anchor specified - default to top anchor with margin
                top = margins.top || 0;
            }
        }
    }
    
    // CRITICAL: Convert from content-relative position to CSS padding-relative position
    // In CSS, position:absolute children are positioned relative to parent's PADDING box
    // OTUI margins are relative to the CONTENT box (after padding)
    // So if we calculated `left` relative to content area, we need to ADD parent padding
    // to get the CSS position relative to padding box
    const cssLeft = left + parentPaddingLeft;
    const cssTop = top + parentPaddingTop;
    
    // Apply calculated position
    widget.style.left = `${Math.max(0, cssLeft)}px`;
    widget.style.top = `${Math.max(0, cssTop)}px`;
}

// Build widget mapping dynamically from OTUI_WIDGETS and style loader
function buildWidgetMapping() {
    const mapping = {};
    
    // First, use the style loader's mapping if available
    if (window.OTUIStyleLoader && window.OTUIStyleLoader.getStyleForWidget) {
        // Get all widget types from OTUI_WIDGETS
        if (typeof OTUI_WIDGETS !== 'undefined') {
            Object.keys(OTUI_WIDGETS).forEach(uiType => {
                // Remove UI prefix for OTUI name
                const otuiName = uiType.startsWith('UI') ? uiType.substring(2) : uiType;
                mapping[otuiName] = uiType;
                mapping[uiType] = uiType; // Also support full name
            });
        }
    }
    
    // Add common mappings
    const commonMappings = {
        'Window': 'UIWindow',
        'CleanStaticMainWindow': 'CleanStaticMainWindow',
        'Label': 'UILabel',
        'Panel': 'UIPanel',
        'Widget': 'UIWidget',
        'ScrollablePanel': 'UIScrollArea',
        'ScrollArea': 'UIScrollArea',
        'VerticalScrollBar': 'UIScrollBar',
        'HorizontalScrollBar': 'UIScrollBar',
        'ScrollBar': 'UIScrollBar',
        'MiniWindow': 'UIMiniWindow',
        'Button': 'UIButton',
        'TextEdit': 'UITextEdit',
        'CheckBox': 'UICheckBox',
        'Checkbox': 'UICheckBox',
        'RadioButton': 'UIRadioButton',
        'ProgressBar': 'UIProgressBar',
        'Item': 'UIItem',
        'Image': 'UIImage',
        'Sprite': 'UISprite',
        'Separator': 'UISeparator',
        'HorizontalSeparator': 'UIHorizontalSeparator',
        'VerticalSeparator': 'UIVerticalSeparator',
        'HorizontalLayout': 'UIHorizontalLayout',
        'VerticalLayout': 'UIVerticalLayout',
        'TabBar': 'UITabBar',
        'Tab': 'UITab',
        'GridLayout': 'UIGridLayout',
        'ComboBox': 'UIComboBox',
        'HealthBar': 'UIHealthBar',
        'ManaBar': 'UIManaBar',
        'ExperienceBar': 'UIExperienceBar'
    };
    
    // Merge common mappings
    Object.assign(mapping, commonMappings);
    
    // Add mappings from loaded styles
    if (window.OTUIStyleLoader && window.OTUIStyleLoader.loadedStyles) {
        const styles = window.OTUIStyleLoader.loadedStyles();
        Object.keys(styles).forEach(styleName => {
            if (!mapping[styleName]) {
                // Try to infer widget type from style name
                let widgetType = styleName;
                if (!styleName.startsWith('UI')) {
                    widgetType = `UI${styleName}`;
                }
                // Only add if it exists in OTUI_WIDGETS
                if (typeof OTUI_WIDGETS !== 'undefined' && OTUI_WIDGETS[widgetType]) {
                    mapping[styleName] = widgetType;
                }
            }
        });
    }
    
    return mapping;
}

// Get widget type from OTUI name (supports dynamic discovery)
function getWidgetTypeFromOTUI(otuiName) {
    const mapping = buildWidgetMapping();
    
    // Direct lookup
    if (mapping[otuiName]) {
        return mapping[otuiName];
    }
    
    // Try with UI prefix
    const withUIPrefix = `UI${otuiName}`;
    if (typeof OTUI_WIDGETS !== 'undefined' && OTUI_WIDGETS[withUIPrefix]) {
        return withUIPrefix;
    }
    
    // Try exact match
    if (typeof OTUI_WIDGETS !== 'undefined' && OTUI_WIDGETS[otuiName]) {
        return otuiName;
    }
    
    // Use style loader's mapping if available
    if (window.OTUIStyleLoader && window.OTUIStyleLoader.getStyleForWidget) {
        // Try reverse lookup through style loader
        const style = window.OTUIStyleLoader.getStyleForWidget(otuiName);
        if (style) {
            return otuiName.startsWith('UI') ? otuiName : `UI${otuiName}`;
        }
    }
    
    // Last resort: return with UI prefix
    return otuiName.startsWith('UI') ? otuiName : `UI${otuiName}`;
}

function parseOTUICode(code) {
    const lines = code.split('\n');
    const widgets = [];
    const stack = []; // Stack to track parent widgets
    
    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const trimmedLine = originalLine.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) continue;
        
        // Calculate indentation (number of spaces or tabs at start)
        const indentMatch = originalLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const indentLevel = Math.floor(indent / 2); // OTUI typically uses 2-space indentation
        
        // Pop stack until we find parent with matching or lower indent
        while (stack.length > 0 && stack[stack.length - 1].indentLevel >= indentLevel) {
            stack.pop();
        }
        
        // Check if this is a widget declaration (starts with capital letter, optionally with inheritance)
        // Examples: "Window", "Button < UIButton", "Panel < FlatPanel"
        const widgetMatch = trimmedLine.match(/^([A-Z][a-zA-Z0-9_]*)(?:\s*<\s*([A-Za-z][A-Za-z0-9_]*))?$/);
        if (widgetMatch) {
            const widgetTypeName = widgetMatch[1];
            const parentType = widgetMatch[2]; // Inheritance info (for future use)
            const uiType = getWidgetTypeFromOTUI(widgetTypeName);
            
            // Check if widget type exists (allow dynamic widgets)
            if (typeof OTUI_WIDGETS !== 'undefined' && !OTUI_WIDGETS[uiType]) {
                // Try to create a dynamic widget entry if it doesn't exist
                console.warn(`Widget type not found: ${widgetTypeName} (mapped to ${uiType}). Attempting to create dynamically...`);
                
                // Infer if it's a container based on name
                const isContainer = widgetTypeName.includes('Panel') || widgetTypeName.includes('Window') || 
                                   widgetTypeName.includes('Area') || widgetTypeName.includes('Layout') ||
                                   widgetTypeName.includes('TabBar') || widgetTypeName.includes('MainWindow') ||
                                   widgetTypeName.includes('Container') || widgetTypeName.includes('Scroll');
                
                // Create dynamic widget entry
                if (typeof OTUI_WIDGETS !== 'undefined') {
                    OTUI_WIDGETS[uiType] = {
                        category: isContainer ? "Layout" : "Display",
                        isContainer: isContainer,
                        props: {},
                        events: {}
                    };
                    console.log(`✓ Created dynamic widget: ${uiType}`);
                } else {
                    console.error(`Cannot create widget: OTUI_WIDGETS not defined`);
                    continue;
                }
            }
            
            const widget = {
                type: uiType,
                indentLevel: indentLevel,
                properties: {},
                children: [],
                parent: stack.length > 0 ? stack[stack.length - 1] : null
            };
            
            if (stack.length > 0) {
                stack[stack.length - 1].children.push(widget);
            } else {
                widgets.push(widget);
            }
            
            stack.push(widget);
            continue;
        }
        
        // If no widget in stack, skip this line
        if (stack.length === 0) {
            continue;
        }
        
        const currentWidget = stack[stack.length - 1];
        
        // Check for property with colon (key: value)
        // Examples: "image-source: /images/ui/button.png", "padding: 5", "!text: Hello"
        // Match property with colon - allow dots for anchors.right, anchors.left, anchors.verticalCenter, etc.
        // Use case-insensitive matching to handle anchors.verticalCenter, anchors.horizontalCenter, etc.
        const propMatchColon = trimmedLine.match(/^([!a-zA-Z.-]+):\s*(.+)$/);
        if (propMatchColon) {
            const key = propMatchColon[1];
            let value = propMatchColon[2].trim();
            
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            // Handle special properties
            if (key === 'size') {
                const sizeParts = value.split(/\s+/);
                if (sizeParts.length >= 2) {
                    currentWidget.properties['width'] = sizeParts[0];
                    currentWidget.properties['height'] = sizeParts[1];
                }
            } else if (key === 'text-offset') {
                const offsetParts = value.split(/\s+/);
                if (offsetParts.length >= 2) {
                    currentWidget.properties['text-offset-x'] = offsetParts[0];
                    currentWidget.properties['text-offset-y'] = offsetParts[1];
                }
            } else if (key === 'image-rect' || key === 'image-clip') {
                // Store image-rect/image-clip as-is (will be handled by style loader)
                currentWidget.properties[key] = value;
            } else if (key.startsWith('anchors.')) {
                // Handle anchors: anchors.top, anchors.bottom, etc.
                currentWidget.properties[key] = value;
            } else if (key.startsWith('!')) {
                // Properties starting with ! are special (like !text)
                const actualKey = key.substring(1);
                currentWidget.properties[actualKey] = value;
            } else {
                currentWidget.properties[key] = value;
            }
            continue;
        }
        
        // Check for property without colon (key value) - space-separated
        // Examples: "size 100 50", "image-clip 0 0 32 32", "anchors.right parent.right"
        // Allow dots for anchors.right, anchors.left, anchors.verticalCenter, etc.
        // Use case-insensitive matching to handle anchors.verticalCenter, anchors.horizontalCenter, etc.
        const propMatchSpace = trimmedLine.match(/^([a-zA-Z.-]+)\s+(.+)$/);
        if (propMatchSpace) {
            const key = propMatchSpace[1];
            const value = propMatchSpace[2].trim();
            
            // Handle special properties
            if (key === 'size') {
                const sizeParts = value.split(/\s+/);
                if (sizeParts.length >= 2) {
                    currentWidget.properties['width'] = sizeParts[0];
                    currentWidget.properties['height'] = sizeParts[1];
                }
            } else if (key === 'text-offset') {
                const offsetParts = value.split(/\s+/);
                if (offsetParts.length >= 2) {
                    currentWidget.properties['text-offset-x'] = offsetParts[0];
                    currentWidget.properties['text-offset-y'] = offsetParts[1];
                }
                } else if (key === 'image-rect' || key === 'image-clip') {
                    currentWidget.properties[key] = value;
                } else if (key.startsWith('anchors.')) {
                    // Handle anchors in space-separated format
                    currentWidget.properties[key] = value;
                } else if (key.startsWith('margin-')) {
                    // Handle margins in space-separated format
                    currentWidget.properties[key] = value;
                } else {
                    currentWidget.properties[key] = value;
                }
            continue;
        }
        
        // Check for boolean properties (just the key name means true)
        // Examples: "opacity", "focusable", "enabled"
        const boolPropMatch = trimmedLine.match(/^([a-z-]+)$/);
        if (boolPropMatch && indent > 0) {
            const key = boolPropMatch[1];
            // Only set if not already set (avoid overwriting)
            if (currentWidget.properties[key] === undefined) {
                currentWidget.properties[key] = 'true';
            }
            continue;
        }
    }
    
    return widgets;
}

function createWidgetsFromOTUI(widgets, parentElement = null, startX = 50, startY = 50) {
    const content = parentElement || document.getElementById('editorContent');
    if (!content) {
        console.error('Editor content not found');
        return [];
    }
    
    const createdWidgets = [];
    let currentY = startY;
    const spacing = 20;
    
    function createWidgetRecursive(widgetData, parent, x, y) {
        // Create the widget
        const widget = createWidget(widgetData.type);
        if (!widget) {
            console.warn(`Failed to create widget: ${widgetData.type}`);
            return null;
        }
        
        // Set initial position (will be adjusted by anchors if present)
        // Only set initial position if no anchors are specified (for root-level widgets)
        // For nested widgets, anchors will override this
        const hasAnchors = Object.keys(widgetData.properties).some(key => key.startsWith('anchors.'));
        if (!hasAnchors || !parent || parent.id === 'editorContent') {
            widget.style.left = `${x}px`;
            widget.style.top = `${y}px`;
        } else {
            // Set to 0 initially - anchors will position it correctly
            widget.style.left = '0px';
            widget.style.top = '0px';
        }
        
        // Helper function to convert hyphenated keys to camelCase for dataset
        function toCamelCase(str) {
            return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        }
        
        // Store original key mappings for code generation
        if (!widget.dataset._keyMap) {
            widget.dataset._keyMap = JSON.stringify({});
        }
        const keyMap = JSON.parse(widget.dataset._keyMap);
        
        // Preserve original anchors and margins for code generation
        // This ensures imported anchors are never recalculated/changed
        const originalAnchors = [];
        const originalMargins = {};
        
        // Debug: Log all properties to verify anchors are present
        console.log(`Processing widget ${widgetData.type}, properties:`, Object.keys(widgetData.properties));
        console.log(`Processing widget ${widgetData.type}, all properties with values:`, widgetData.properties);
        
        // Apply properties
        Object.entries(widgetData.properties).forEach(([key, value]) => {
            // Handle size properties
            if (key === 'width') {
                widget.style.width = `${value}px`;
            } else if (key === 'height') {
                widget.style.height = `${value}px`;
            } else if (key === 'text' || key === 'title') {
                // Set text/title content
                const camelKey = toCamelCase(key);
                widget.dataset[camelKey] = value;
                keyMap[camelKey] = key; // Store original key name
                
                const contentEl = widget.querySelector('.widget-content');
                if (contentEl) {
                    contentEl.textContent = value;
                }
            } else if (key.startsWith('anchors.')) {
                // Preserve original anchors
                originalAnchors.push(`${key}: ${value}`);
                // Also store in dataset for reference
                const camelKey = toCamelCase(key);
                widget.dataset[camelKey] = value;
                keyMap[camelKey] = key;
            } else if (key.startsWith('margin-')) {
                // Preserve original margins
                const marginType = key.replace('margin-', '');
                originalMargins[marginType] = parseInt(value) || 0;
                // Also store in dataset
                const camelKey = toCamelCase(key);
                widget.dataset[camelKey] = value;
                keyMap[camelKey] = key;
            } else {
                // Store in dataset for code generation
                // Convert hyphenated keys to camelCase (dataset requirement)
                const camelKey = toCamelCase(key);
                try {
                    widget.dataset[camelKey] = value;
                    keyMap[camelKey] = key; // Store original key name mapping
                } catch (e) {
                    // Fallback: store in a custom attribute if dataset fails
                    console.warn(`Could not store property '${key}' in dataset, using attribute instead:`, e);
                    widget.setAttribute(`data-prop-${key.replace(/[^a-z0-9-]/gi, '-')}`, value);
                    // Store in keyMap with special prefix
                    keyMap[`attr-${key}`] = key;
                }
            }
        });
        
        // Store original anchors and margins in dataset so code generation uses them
        // CRITICAL: Always store anchors array (even if empty) to distinguish from manually created widgets
        // This ensures ALL imported anchors (left, right, top, bottom, centerIn, fill, etc.) are preserved
        widget.dataset._originalAnchors = JSON.stringify(originalAnchors);
        if (Object.keys(originalMargins).length > 0) {
            widget.dataset._originalMargins = JSON.stringify(originalMargins);
        }
        
        // Debug: Log preserved anchors to verify all are captured
        console.log(`Widget ${widgetData.type} - Preserved ${originalAnchors.length} anchors:`, originalAnchors);
        console.log(`Widget ${widgetData.type} - Preserved margins:`, originalMargins);
        
        // Save key mapping
        widget.dataset._keyMap = JSON.stringify(keyMap);
        
        // Set ID if specified
        if (widgetData.properties.id) {
            widget.id = widgetData.properties.id;
        }
        
        // Add to parent first (needed for anchor calculations)
        if (parent && parent.classList && parent.classList.contains('container')) {
            parent.appendChild(widget);
        } else {
            content.appendChild(widget);
        }
        
        // Apply anchors to position widget correctly (must be after appending to parent)
        if (parent && parent.classList && parent.classList.contains('container')) {
            // Wait for DOM to be ready, then apply anchors
            requestAnimationFrame(() => {
                applyAnchorsToWidget(widget, widgetData, parent);
            });
        }
        
        createdWidgets.push(widget);
        
        // Apply OTUI styles after widget is in DOM and positioned
        if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
            requestAnimationFrame(() => {
                window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, widgetData.type);
                void widget.offsetHeight; // Force reflow
                
                // Re-apply anchors after styles are applied (in case size changed)
                if (parent && parent.classList && parent.classList.contains('container')) {
                    applyAnchorsToWidget(widget, widgetData, parent);
                }
            });
        }
        
        // Create children
        let childY = 10; // Start children at top of container
        widgetData.children.forEach((childData) => {
            const childWidget = createWidgetRecursive(childData, widget, 10, childY);
            if (childWidget) {
                childY += (parseInt(childWidget.style.height) || 50) + spacing;
            }
        });
        
        return widget;
    }
    
    // Create all root widgets
    widgets.forEach((widgetData, index) => {
        const x = startX + (index * 250); // Space widgets horizontally
        const widget = createWidgetRecursive(widgetData, null, x, currentY);
        if (widget) {
            currentY += (parseInt(widget.style.height) || 100) + spacing;
        }
    });
    
    return createdWidgets;
}

// Export functions
window.parseOTUICode = parseOTUICode;
window.createWidgetsFromOTUI = createWidgetsFromOTUI;

