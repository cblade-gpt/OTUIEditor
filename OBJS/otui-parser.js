// OBJS/otui-parser.js - Parse OTUI code and create widgets on canvas
// Based on OTCv8 source: uitranslator.cpp, uianchorlayout.cpp, uiwidgetbasestyle.cpp
// Supports dynamically discovered widgets from loaded OTUI styles

// Helper function to get padding rect (content area) - matches OTCv8's getPaddingRect()
function getPaddingRect(element) {
    const style = window.getComputedStyle(element);
    const paddingLeft = parseInt(style.paddingLeft) || 0;
    const paddingTop = parseInt(style.paddingTop) || 0;
    const paddingRight = parseInt(style.paddingRight) || 0;
    const paddingBottom = parseInt(style.paddingBottom) || 0;
    
    const width = element.offsetWidth || parseInt(element.style.width) || 0;
    const height = element.offsetHeight || parseInt(element.style.height) || 0;
    
    return {
        left: paddingLeft,
        top: paddingTop,
        right: width - paddingRight,
        bottom: height - paddingBottom,
        width: width - paddingLeft - paddingRight,
        height: height - paddingTop - paddingBottom,
        centerX: (width - paddingLeft - paddingRight) / 2 + paddingLeft,
        centerY: (height - paddingTop - paddingBottom) / 2 + paddingTop
    };
}

// Helper function to translate anchor edge - matches OTCv8's translateAnchorEdge()
function translateAnchorEdge(anchorEdge) {
    const normalized = anchorEdge.toLowerCase().replace(/\s+/g, '');
    if (normalized === 'left') return 'left';
    if (normalized === 'right') return 'right';
    if (normalized === 'top') return 'top';
    if (normalized === 'bottom') return 'bottom';
    if (normalized === 'horizontalcenter' || normalized === 'horizontal-center') return 'horizontalCenter';
    if (normalized === 'verticalcenter' || normalized === 'vertical-center') return 'verticalCenter';
    return null;
}

// Helper function to get hooked widget - matches OTCv8's UIAnchor::getHookedWidget()
function getHookedWidget(widget, parent, hookedWidgetId) {
    if (!parent) return null;
    
    if (hookedWidgetId === 'parent') {
        return parent;
    } else if (hookedWidgetId === 'next') {
        // getChildAfter equivalent
        const siblings = Array.from(parent.children).filter(child => 
            child.classList && child.classList.contains('widget')
        );
        const currentIndex = siblings.indexOf(widget);
        return currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    } else if (hookedWidgetId === 'prev') {
        // getChildBefore equivalent
        const siblings = Array.from(parent.children).filter(child => 
            child.classList && child.classList.contains('widget')
        );
        const currentIndex = siblings.indexOf(widget);
        return currentIndex > 0 ? siblings[currentIndex - 1] : null;
    } else {
        // getChildById equivalent
        return Array.from(parent.children).find(child => 
            child.classList && child.classList.contains('widget') && child.id === hookedWidgetId
        ) || null;
    }
}

// Helper function to get hooked point - matches OTCv8's UIAnchor::getHookedPoint()
function getHookedPoint(hookedWidget, parent, hookedEdge) {
    let hookedWidgetRect;
    
    if (hookedWidget === parent) {
        // CRITICAL: When anchoring to parent, use padding rect (content area)
        // This matches OTCv8: if(hookedWidget == parentWidget) hookedWidgetRect = parentWidget->getPaddingRect();
        // OTCv8's getPaddingRect() returns content area coordinates (after padding)
        // But CSS position:absolute uses padding-relative coordinates
        // So we need to convert: CSS coordinate = content coordinate (which is already padding-relative for left/top)
        const paddingRect = getPaddingRect(parent);
        // For parent, paddingRect.left/top are already in CSS padding-relative coordinates (they equal paddingLeft/paddingTop)
        // paddingRect.right/bottom are content-relative, so we need to convert them to CSS padding-relative
        // CSS right edge = parent width (padding box right edge)
        // CSS bottom edge = parent height (padding box bottom edge)
        const parentWidth = parent.offsetWidth || parseInt(parent.style.width) || 0;
        const parentHeight = parent.offsetHeight || parseInt(parent.style.height) || 0;
        hookedWidgetRect = {
            left: paddingRect.left,  // Already CSS padding-relative (equals paddingLeft)
            top: paddingRect.top,    // Already CSS padding-relative (equals paddingTop)
            right: paddingRect.right, // Content-relative right edge, but we need CSS padding-relative
            bottom: paddingRect.bottom, // Content-relative bottom edge, but we need CSS padding-relative
            width: paddingRect.width,
            height: paddingRect.height,
            horizontalCenter: paddingRect.centerX, // Already CSS padding-relative
            verticalCenter: paddingRect.centerY    // Already CSS padding-relative
        };
        // Actually, wait - let me check: paddingRect.right = width - paddingRight
        // In CSS coordinates, the right edge of content area = width - paddingRight
        // But CSS position uses padding-relative, so right edge of content = width - paddingRight (which is what we have)
        // So paddingRect.right is already correct for CSS coordinates!
        // Same for bottom: paddingRect.bottom = height - paddingBottom, which is correct for CSS
    } else {
        // For other widgets, use their actual rect (already in CSS padding-relative coordinates)
        const left = parseInt(hookedWidget.style.left) || 0;
        const top = parseInt(hookedWidget.style.top) || 0;
        const width = hookedWidget.offsetWidth || parseInt(hookedWidget.style.width) || 0;
        const height = hookedWidget.offsetHeight || parseInt(hookedWidget.style.height) || 0;
        
        hookedWidgetRect = {
            left: left,
            top: top,
            right: left + width,
            bottom: top + height,
            width: width,
            height: height,
            horizontalCenter: left + width / 2,
            verticalCenter: top + height / 2
        };
    }
    
    // Get point based on hooked edge - matches OTCv8's switch statement
    switch (hookedEdge) {
        case 'left':
            return hookedWidgetRect.left;
        case 'right':
            return hookedWidgetRect.right;
        case 'top':
            return hookedWidgetRect.top;
        case 'bottom':
            return hookedWidgetRect.bottom;
        case 'horizontalCenter':
            return hookedWidgetRect.horizontalCenter;
        case 'verticalCenter':
            return hookedWidgetRect.verticalCenter;
        default:
            return 0;
    }
}

// Track which widgets have had their anchors applied (to prevent infinite recursion)
const anchorUpdateMap = new WeakMap();

// Helper function to apply anchors to position a widget - matches OTCv8's UIAnchorLayout::updateWidget()
function applyAnchorsToWidget(widget, widgetData, parent, first = null) {
    if (!parent || parent.id === 'editorContent') {
        // Root level widget - no anchors to apply
        return false;
    }
    
    // Prevent infinite recursion (matches OTCv8's check)
    if (first === widget) {
        console.error(`Widget ${widget.id || widgetData.type} is recursively anchored to itself`);
        return false;
    }
    
    if (!first) {
        first = widget;
    }
    
    // Check if this widget has already been updated in this pass
    const updateKey = `${parent.id || 'root'}_${widget.id || 'widget'}`;
    if (anchorUpdateMap.get(widget) === updateKey) {
        return false; // Already updated
    }
    anchorUpdateMap.set(widget, updateKey);
    
    const widgetWidth = parseInt(widget.style.width) || widget.offsetWidth || 100;
    const widgetHeight = parseInt(widget.style.height) || widget.offsetHeight || 100;
    
    // Get anchor properties
    const anchors = {};
    const margins = { left: 0, top: 0, right: 0, bottom: 0 };
    
    // Parse anchor properties from widgetData
    Object.keys(widgetData.properties).forEach(key => {
        if (key.startsWith('anchors.')) {
            const anchorTypeRaw = key.replace('anchors.', '');
            const anchorType = translateAnchorEdge(anchorTypeRaw);
            if (anchorType) {
                anchors[anchorType] = widgetData.properties[key];
            } else if (anchorTypeRaw.toLowerCase() === 'centerin' || anchorTypeRaw.toLowerCase() === 'center-in') {
                anchors.centerIn = widgetData.properties[key];
            } else if (anchorTypeRaw.toLowerCase() === 'fill') {
                anchors.fill = widgetData.properties[key];
            }
        } else if (key.startsWith('margin-')) {
            const marginType = key.replace('margin-', '');
            margins[marginType] = parseInt(widgetData.properties[key]) || 0;
        }
    });
    
    // Start with current rect (matches OTCv8: Rect newRect = widget->getRect())
    let newLeft = parseInt(widget.style.left) || 0;
    let newTop = parseInt(widget.style.top) || 0;
    let verticalMoved = false;
    let horizontalMoved = false;
    
    // Handle centerIn and fill shortcuts
    if (anchors.centerIn !== undefined) {
        const hookedWidgetId = anchors.centerIn.toString().toLowerCase();
        const hookedWidget = getHookedWidget(widget, parent, hookedWidgetId);
        if (hookedWidget) {
            const centerX = getHookedPoint(hookedWidget, parent, 'horizontalCenter');
            const centerY = getHookedPoint(hookedWidget, parent, 'verticalCenter');
            newLeft = centerX - widgetWidth / 2 + margins.left - margins.right;
            newTop = centerY - widgetHeight / 2 + margins.top - margins.bottom;
            horizontalMoved = true;
            verticalMoved = true;
        }
    } else if (anchors.fill !== undefined) {
        const hookedWidgetId = anchors.fill.toString().toLowerCase();
        const hookedWidget = getHookedWidget(widget, parent, hookedWidgetId);
        if (hookedWidget) {
            const leftPoint = getHookedPoint(hookedWidget, parent, 'left');
            const rightPoint = getHookedPoint(hookedWidget, parent, 'right');
            const topPoint = getHookedPoint(hookedWidget, parent, 'top');
            const bottomPoint = getHookedPoint(hookedWidget, parent, 'bottom');
            newLeft = leftPoint + margins.left;
            newTop = topPoint + margins.top;
            widget.style.width = `${Math.max(0, rightPoint - leftPoint - margins.left - margins.right)}px`;
            widget.style.height = `${Math.max(0, bottomPoint - topPoint - margins.top - margins.bottom)}px`;
            horizontalMoved = true;
            verticalMoved = true;
        }
    } else {
        // Process individual anchors - matches OTCv8's anchor processing loop
        for (const [anchoredEdge, anchorValue] of Object.entries(anchors)) {
            if (anchoredEdge === 'centerIn' || anchoredEdge === 'fill') continue;
            
            // Parse anchor value: "hookedWidgetId.hookedEdge" (e.g., "parent.left", "prev.bottom")
            const anchorValueStr = anchorValue.toString();
            if (anchorValueStr === 'none') continue;
            
            const parts = anchorValueStr.split('.');
            if (parts.length !== 2) {
                console.warn(`Invalid anchor format: ${anchorValueStr}, expected "hookedWidgetId.hookedEdge"`);
                continue;
            }
            
            const hookedWidgetId = parts[0].toLowerCase();
            const hookedEdgeRaw = parts[1];
            const hookedEdge = translateAnchorEdge(hookedEdgeRaw);
            
            if (!hookedEdge) {
                console.warn(`Invalid hooked edge: ${hookedEdgeRaw}`);
                continue;
            }
            
            // Get hooked widget
            const hookedWidget = getHookedWidget(widget, parent, hookedWidgetId);
            if (!hookedWidget) {
                continue; // Skip invalid anchors (matches OTCv8 behavior)
            }
            
            // CRITICAL: Recursively update hooked widget first (matches OTCv8 line 198-199)
            if (hookedWidget !== parent) {
                const hookedWidgetData = hookedWidget.dataset._widgetData ? JSON.parse(hookedWidget.dataset._widgetData) : null;
                if (hookedWidgetData && !anchorUpdateMap.get(hookedWidget)) {
                    applyAnchorsToWidget(hookedWidget, hookedWidgetData, parent, first);
                }
            }
            
            // Get hooked point
            const point = getHookedPoint(hookedWidget, parent, hookedEdge);
            
            // Apply anchor based on anchored edge - matches OTCv8's switch statement exactly
            switch (anchoredEdge) {
                case 'horizontalCenter':
                    newLeft = point - widgetWidth / 2 + margins.left - margins.right;
                    horizontalMoved = true;
                    break;
                case 'left':
                    if (!horizontalMoved) {
                        newLeft = point + margins.left;
                        horizontalMoved = true;
                    } else {
                        newLeft = point + margins.left;
                    }
                    break;
                case 'right':
                    if (!horizontalMoved) {
                        newLeft = point - widgetWidth - margins.right;
                        horizontalMoved = true;
                    } else {
                        newLeft = point - widgetWidth - margins.right;
                    }
                    break;
                case 'verticalCenter':
                    newTop = point - widgetHeight / 2 + margins.top - margins.bottom;
                    verticalMoved = true;
                    break;
                case 'top':
                    if (!verticalMoved) {
                        newTop = point + margins.top;
                        verticalMoved = true;
                    } else {
                        newTop = point + margins.top;
                    }
                    break;
                case 'bottom':
                    if (!verticalMoved) {
                        newTop = point - widgetHeight - margins.bottom;
                        verticalMoved = true;
                    } else {
                        newTop = point - widgetHeight - margins.bottom;
                    }
                    break;
            }
        }
    }
    
    // Apply calculated position (already in CSS padding-relative coordinates)
    widget.style.left = `${Math.max(0, newLeft)}px`;
    widget.style.top = `${Math.max(0, newTop)}px`;
    
    return true;
}

// Build widget mapping dynamically from OTUI_WIDGETS and style loader
function buildWidgetMapping() {
    const mapping = {};
    
    // Add all widgets from OTUI_WIDGETS
    if (typeof OTUI_WIDGETS !== 'undefined') {
        Object.keys(OTUI_WIDGETS).forEach(type => {
            const otuiName = type.startsWith('UI') ? type.substring(2) : type;
            mapping[otuiName] = type;
            mapping[type] = type; // Also map full name
        });
    }
    
    return mapping;
}

let widgetMapping = null;

function getWidgetTypeFromOTUI(otuiName) {
    if (!widgetMapping) {
        widgetMapping = buildWidgetMapping();
    }
    
    // Check direct mapping
    if (widgetMapping[otuiName]) {
        return widgetMapping[otuiName];
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
    const widgets = []; // Only actual widget instances to display
    const templates = {}; // Template definitions (with <) - stored but not displayed
    const templateDefinitions = []; // Preserve original template blocks (for regeneration)
    const templateCaptureStack = []; // Track template blocks currently being parsed
    const stack = []; // Stack to track parent widgets/templates
    let inTemplateDefinition = false; // Track if we're inside a template definition
    let templateIndent = -1; // Track indentation level of current template
    
    function recordOriginalProperty(targetWidget, key, value, rawLine, relativeIndent = 0) {
        if (!targetWidget || !key) return;
        if (!targetWidget.propertyList) {
            targetWidget.propertyList = [];
        }
        targetWidget.propertyList.push({
            key,
            value,
            raw: rawLine,
            indent: Math.max(0, relativeIndent)
        });
    }
    
    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const trimmedLine = originalLine.trim();
        let captureHandled = false;
        const captureCurrentLine = () => {
            if (!captureHandled && templateCaptureStack.length > 0) {
                const currentTemplateCapture = templateCaptureStack[templateCaptureStack.length - 1];
                if (currentTemplateCapture && currentTemplateCapture.lines) {
                    currentTemplateCapture.lines.push(originalLine);
                }
                captureHandled = true;
            }
        };
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
            captureCurrentLine();
            continue;
        }
        
        // Calculate indentation (number of spaces or tabs at start)
        const indentMatch = originalLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        // OTUI typically uses 2-space indentation
        // Calculate indent level: 0 spaces = level 0, 2 spaces = level 1, 4 spaces = level 2, etc.
        const indentLevel = Math.floor(indent / 2);
        
        // Pop stack until we find parent with matching or lower indent
        // This handles both template definitions and regular widgets
        while (stack.length > 0 && stack[stack.length - 1].indentLevel >= indentLevel) {
            const popped = stack.pop();
            // If we pop a template definition, we're exiting it
            if (popped && popped.isTemplate) {
                inTemplateDefinition = false;
                templateIndent = -1;
                templateCaptureStack.pop();
            }
        }
        
        // Check if this is a widget declaration (starts with capital letter, optionally with inheritance)
        // Examples: "Window", "Button < UIButton", "Panel < FlatPanel", "CharmItem < UICheckBox"
        const widgetMatch = trimmedLine.match(/^([A-Z][a-zA-Z0-9_]*)(?:\s*<\s*([A-Za-z][A-Za-z0-9_]*))?$/);
        if (widgetMatch) {
            const widgetTypeName = widgetMatch[1];
            const parentTypeName = widgetMatch[2]; // Inheritance: parent widget type (e.g., "UICheckBox")
            
            // CRITICAL: If line contains '<', it's a TEMPLATE DEFINITION (style), not a widget instance
            // Templates should be stored but NOT displayed on canvas (matches OTCv8: importStyleFromOTML)
            if (parentTypeName) {
                // This is a template definition (e.g., "CharmItem < UICheckBox")
                // Store it in templates, but don't add to widgets array for display
                inTemplateDefinition = true;
                templateIndent = indent;
                
                // Map parent type to UI type
                const baseType = getWidgetTypeFromOTUI(parentTypeName);
                const uiType = widgetTypeName; // Use original name for template
                
                // Create or update template definition in OTUI_WIDGETS
                if (typeof OTUI_WIDGETS !== 'undefined') {
                    let baseWidgetDef = null;
                    if (baseType && OTUI_WIDGETS[baseType]) {
                        baseWidgetDef = OTUI_WIDGETS[baseType];
                    }
                    
                    // Infer if it's a container based on name or base type
                    let isContainer = false;
                    if (baseWidgetDef) {
                        isContainer = baseWidgetDef.isContainer || false;
                    } else {
                        isContainer = widgetTypeName.includes('Panel') || widgetTypeName.includes('Window') || 
                                      widgetTypeName.includes('Area') || widgetTypeName.includes('Layout') ||
                                      widgetTypeName.includes('TabBar') || widgetTypeName.includes('MainWindow') ||
                                      widgetTypeName.includes('Container') || widgetTypeName.includes('Scroll') ||
                                      widgetTypeName.includes('Loot') || widgetTypeName.includes('Category');
                    }
                    
                    // Store template definition
                    OTUI_WIDGETS[uiType] = {
                        category: baseWidgetDef ? baseWidgetDef.category : (isContainer ? "Layout" : "Display"),
                        isContainer: isContainer,
                        props: baseWidgetDef ? { ...baseWidgetDef.props } : {},
                        events: baseWidgetDef ? { ...baseWidgetDef.events } : {},
                        importOnly: true, // Templates are not in palette
                        isTemplate: true // Mark as template definition
                    };
                    
                    const templateCaptureEntry = {
                        name: widgetTypeName,
                        baseType: parentTypeName,
                        lines: []
                    };
                    templateDefinitions.push(templateCaptureEntry);
                    templateCaptureStack.push(templateCaptureEntry);
                    
                    // Store template data for later use (when template is instantiated)
                    templates[uiType] = {
                        type: uiType,
                        originalTypeName: widgetTypeName,
                        parentType: parentTypeName,
                        baseType: baseType,
                        indentLevel: indentLevel,
                        properties: {},
                        children: [],
                        propertyList: [],
                        originalKeys: {},
                        isTemplate: true
                    };
                    
                    console.log(`✓ Template definition: ${uiType} < ${baseType} (stored, not displayed)`);
                    
                    // Add to stack so children are associated with this template
                    stack.push(templates[uiType]);
                    captureCurrentLine(); // Capture template declaration line
                }
                continue; // Don't add to widgets array - templates are not displayed
            } else {
                // This is an actual widget instance (no '<') - should be displayed
                // Check if we're inside a template definition
                if (inTemplateDefinition) {
                    // This widget is part of the template definition - store it in template, not widgets
                    const uiType = getWidgetTypeFromOTUI(widgetTypeName);
                    const widget = {
                        type: uiType,
                        originalTypeName: widgetTypeName,
                        parentType: null,
                        indentLevel: indentLevel,
                        properties: {},
                        children: [],
                        sizeDefined: false,
                        propertyList: [],
                        originalKeys: {},
                        parent: stack.length > 0 ? stack[stack.length - 1] : null,
                        isTemplate: false
                    };
                    
                    if (stack.length > 0) {
                        stack[stack.length - 1].children.push(widget);
                    }
                    
                    stack.push(widget);
                    captureCurrentLine();
                    continue; // Don't add to widgets array - it's part of template definition
                } else {
                    captureCurrentLine();
                    // This is a root-level widget instance - should be displayed
                    const uiType = getWidgetTypeFromOTUI(widgetTypeName);
                    
                    // Check if widget type exists (allow dynamic widgets)
                    if (typeof OTUI_WIDGETS !== 'undefined' && !OTUI_WIDGETS[uiType]) {
                        console.warn(`Widget type not found: ${widgetTypeName} (mapped to ${uiType}). Attempting to create dynamically...`);
                        
                        // Infer if it's a container
                        const isContainer = widgetTypeName.includes('Panel') || widgetTypeName.includes('Window') || 
                                          widgetTypeName.includes('Area') || widgetTypeName.includes('Layout') ||
                                          widgetTypeName.includes('TabBar') || widgetTypeName.includes('MainWindow') ||
                                          widgetTypeName.includes('Container') || widgetTypeName.includes('Scroll');
                        
                        OTUI_WIDGETS[uiType] = {
                            category: isContainer ? "Layout" : "Display",
                            isContainer: isContainer,
                            props: {},
                            events: {},
                            importOnly: false
                        };
                        console.log(`✓ Created dynamic widget: ${uiType}`);
                    }
                    
                    const widget = {
                        type: uiType,
                        originalTypeName: widgetTypeName,
                        parentType: null,
                        indentLevel: indentLevel,
                        properties: {},
                        children: [],
                        sizeDefined: false,
                        propertyList: [],
                        originalKeys: {},
                        parent: stack.length > 0 ? stack[stack.length - 1] : null,
                        isTemplate: false
                    };
                    
                    // CRITICAL: Only add to widgets array if it's truly a root widget (indentLevel === 0)
                    // If stack is empty but indentLevel > 0, this is an error - widget should have a parent
                    if (indentLevel === 0) {
                        // Root-level widget (no indentation)
                        widgets.push(widget);
                    } else if (stack.length > 0) {
                        // Child widget - add to parent's children
                        stack[stack.length - 1].children.push(widget);
                    } else {
                        // Error case: widget has indentation but no parent in stack
                        // This shouldn't happen, but if it does, treat as root widget
                        console.warn(`Widget ${widgetTypeName} at indent ${indent} has no parent in stack - treating as root widget`);
                        widgets.push(widget);
                    }
                    
                    stack.push(widget);
                    continue;
                }
            }
        }
        
        // Capture non-widget lines within template blocks
        captureCurrentLine();
        
        // If no widget/template in stack, skip this line
        if (stack.length === 0) continue;
        
        const currentWidget = stack[stack.length - 1];
        
        // Check for property with colon (key: value)
        // Examples: "image-source: /images/ui/button.png", "padding: 5", "!text: Hello"
        // Allow dots for anchors.right, anchors.left, anchors.verticalCenter, etc.
        // Use case-insensitive matching to handle anchors.verticalCenter, anchors.horizontalCenter, etc.
        const propMatchColon = trimmedLine.match(/^([!@a-zA-Z.-]+):\s*(.*)$/);
        if (propMatchColon) {
            const key = propMatchColon[1];
            let value = propMatchColon[2].trim();
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            
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
                    currentWidget.sizeDefined = true;
                }
                recordOriginalProperty(currentWidget, 'size', propMatchColon[2].trim(), trimmedLine, relativeIndent);
            } else if (key === 'text-offset') {
                const offsetParts = value.split(/\s+/);
                if (offsetParts.length >= 2) {
                    currentWidget.properties['text-offset-x'] = offsetParts[0];
                    currentWidget.properties['text-offset-y'] = offsetParts[1];
                }
                recordOriginalProperty(currentWidget, 'text-offset', propMatchColon[2].trim(), trimmedLine, relativeIndent);
            } else if (key === 'image-rect' || key === 'image-clip') {
                // Store image-rect/image-clip as-is (will be handled by style loader)
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('anchors.')) {
                // Handle anchors: anchors.top, anchors.bottom, etc.
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('!')) {
                // Properties starting with ! are special (like !text)
                const actualKey = key.substring(1);
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[actualKey] === undefined) {
                    currentWidget.properties[actualKey] = value;
                    currentWidget.originalKeys = currentWidget.originalKeys || {};
                    currentWidget.originalKeys[actualKey] = key;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('@')) {
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else {
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            }
            continue;
        }
        
        // Check for property without colon (key value) - space-separated
        // Examples: "size 100 50", "image-clip 0 0 32 32", "anchors.right parent.right"
        // Allow dots for anchors.right, anchors.left, anchors.verticalCenter, etc.
        // Use case-insensitive matching to handle anchors.verticalCenter, anchors.horizontalCenter, etc.
        const propMatchSpace = trimmedLine.match(/^([@a-zA-Z.-]+)\s+(.+)$/);
        if (propMatchSpace) {
            const key = propMatchSpace[1];
            const value = propMatchSpace[2].trim();
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            
            // Handle special properties
            if (key === 'size') {
                const sizeParts = value.split(/\s+/);
                if (sizeParts.length >= 2) {
                    currentWidget.properties['width'] = sizeParts[0];
                    currentWidget.properties['height'] = sizeParts[1];
                    currentWidget.sizeDefined = true;
                }
                recordOriginalProperty(currentWidget, 'size', value, trimmedLine, relativeIndent);
            } else if (key === 'text-offset') {
                const offsetParts = value.split(/\s+/);
                if (offsetParts.length >= 2) {
                    currentWidget.properties['text-offset-x'] = offsetParts[0];
                    currentWidget.properties['text-offset-y'] = offsetParts[1];
                }
                recordOriginalProperty(currentWidget, 'text-offset', value, trimmedLine, relativeIndent);
            } else if (key === 'image-rect' || key === 'image-clip') {
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('anchors.')) {
                // Handle anchors in space-separated format
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('margin-')) {
                // Handle margins in space-separated format
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else {
                // Store all other properties as-is
                // Only set if not already set (prevent duplicates)
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            }
            continue;
        }
        
        // Check for boolean properties (just the key name means true)
        // Examples: "opacity", "focusable", "enabled"
        const boolPropMatch = trimmedLine.match(/^([a-z-]+)$/);
        if (boolPropMatch && indent > 0) {
            const key = boolPropMatch[1];
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            // Only set if not already set (avoid overwriting)
            if (currentWidget.properties[key] === undefined) {
                currentWidget.properties[key] = 'true';
                recordOriginalProperty(currentWidget, key, 'true', trimmedLine, relativeIndent);
            }
            continue;
        }
    }
    
    const result = {
        widgets,
        templates: templateDefinitions,
        templateMap: templates
    };
    
    if (typeof window !== 'undefined') {
        window._importedTemplates = templateDefinitions;
        window._otuiTemplateMap = templates;
    }
    
    return result;
}

function createWidgetsFromOTUI(widgets, parentElement = null, startX = 50, startY = 50) {
    const content = parentElement || document.getElementById('editorContent');
    if (!content) {
        console.error('Editor content not found');
        return [];
    }
    
    const templateMap = (typeof window !== 'undefined' && window._otuiTemplateMap) || {};
    
    function cloneWidgetData(node) {
        if (!node) return null;
        return {
            type: node.type,
            originalTypeName: node.originalTypeName,
            parentType: node.parentType,
            indentLevel: node.indentLevel,
            properties: { ...node.properties },
            originalKeys: { ...(node.originalKeys || {}) },
            propertyList: node.propertyList ? node.propertyList.map(entry => ({ ...entry })) : [],
            children: Array.isArray(node.children) ? node.children.map(child => cloneWidgetData(child)) : [],
            isTemplate: false
        };
    }
    
    const createdWidgets = [];
    let currentY = startY;
    const spacing = 20;
    
    function createWidgetRecursive(widgetData, parent, x, y) {
        const templateName = widgetData.originalTypeName || widgetData.type;
        const templateDef = templateMap[templateName];
        if (templateDef) {
            if (!widgetData.parentType && templateDef.parentType) {
                widgetData.parentType = templateDef.parentType;
            }
            const templateClone = cloneWidgetData(templateDef);
            if (templateClone) {
                widgetData.properties = { ...templateClone.properties, ...widgetData.properties };
                const templateChildren = templateClone.children || [];
                widgetData.children = [
                    ...templateChildren,
                    ...(widgetData.children || [])
                ];
            }
        }
        
        // For custom widgets with inheritance (e.g., "CharmItem < UICheckBox"),
        // we need to create the widget using the BASE TYPE, not the custom type name
        // The custom type name is only for code generation
        let widgetTypeToCreate = widgetData.type;
        let isCustomWidget = false;
        
        if (widgetData.originalTypeName && widgetData.parentType) {
            // This is a custom widget with inheritance
            // Create using the base type (e.g., UICheckBox), not the custom name (CharmItem)
            const parentTypeMapped = getWidgetTypeFromOTUI(widgetData.parentType);
            widgetTypeToCreate = parentTypeMapped || widgetData.type;
            isCustomWidget = true;
        }
        
        // Create the widget using the base type (e.g., UICheckBox for CharmItem < UICheckBox)
        const widget = createWidget(widgetTypeToCreate);
        if (!widget) {
            console.warn(`Failed to create widget: ${widgetTypeToCreate} (for ${widgetData.type})`);
            return null;
        }
        
        
        // If this is a custom widget with inheritance, store the original type name for code generation
        // The widget will behave like the base type but output the original name in code
        if (isCustomWidget) {
            // Store the original custom type name (e.g., "CharmItem") for code generation
            widget.dataset.type = widgetData.type; // Original name (e.g., "CharmItem")
            widget.dataset.baseType = widgetTypeToCreate; // Base type used to create (e.g., "UICheckBox")
        }
        
        // Set initial position (will be adjusted by anchors if present)
        // For root-level widgets (no parent or parent is editorContent), set absolute position
        // For nested widgets (children), always use anchors - don't set absolute position
        const hasAnchors = Object.keys(widgetData.properties).some(key => key.startsWith('anchors.'));
        const isRootWidget = !parent || parent.id === 'editorContent';
        
        if (isRootWidget) {
            // Root widget - set absolute position
            widget.style.left = `${x}px`;
            widget.style.top = `${y}px`;
        } else {
            // Child widget - always use anchors, set to 0 initially
            // Anchors will position it correctly relative to parent
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
        
        // CRITICAL: Preserve ALL original properties (anchors, margins, padding) for code generation
        // This ensures imported OTUI code maintains its exact properties - NEVER recalculate
        const originalAnchors = [];
        const originalMargins = {};
        const originalPadding = {};
        
        // CRITICAL: Collect ONLY properties that are EXPLICITLY specified in widgetData.properties
        // Do NOT add default properties - only preserve what was actually in the OTUI code
        // This ensures we capture all anchor types (left, right, top, bottom, horizontalCenter, verticalCenter, centerIn, fill)
        // but ONLY if they were explicitly specified in the widget instance
        // Use a Set to track anchor types to prevent duplicates
        // CRITICAL: Use case-insensitive matching for anchor types (centerIn, center-in, centerin all map to centerIn)
        const anchorTypesSeen = new Set();
        Object.keys(widgetData.properties).forEach(key => {
            if (key.startsWith('anchors.')) {
                const value = widgetData.properties[key];
                // Extract anchor type (e.g., "left" from "anchors.left")
                const anchorTypeRaw = key.replace('anchors.', '');
                // Normalize anchor type for duplicate detection (case-insensitive)
                const anchorTypeNormalized = anchorTypeRaw.toLowerCase().replace(/-/g, '');
                // Prevent duplicates - if we've already seen this anchor type, skip it
                // (This handles cases where the same anchor might appear twice in properties)
                if (!anchorTypesSeen.has(anchorTypeNormalized)) {
                    anchorTypesSeen.add(anchorTypeNormalized);
                    // Store in format: "anchors.left: parent.left" for code generation
                    // CRITICAL: Preserve the original case of the anchor type (centerIn, not centerin)
                    // But normalize common variations: center-in -> centerIn, centerin -> centerIn
                    let normalizedKey = key;
                    if (anchorTypeRaw.toLowerCase() === 'center-in' || anchorTypeRaw.toLowerCase() === 'centerin') {
                        normalizedKey = 'anchors.centerIn';
                    } else if (anchorTypeRaw.toLowerCase() === 'horizontal-center' || anchorTypeRaw.toLowerCase() === 'horizontalcenter') {
                        normalizedKey = 'anchors.horizontalCenter';
                    } else if (anchorTypeRaw.toLowerCase() === 'vertical-center' || anchorTypeRaw.toLowerCase() === 'verticalcenter') {
                        normalizedKey = 'anchors.verticalCenter';
                    }
                    // Only store anchors that were explicitly in the OTUI code for this widget instance
                    originalAnchors.push(`${normalizedKey}: ${value}`);
                } else {
                    console.warn(`Duplicate anchor ${key} found for widget ${widgetData.type} (${widgetData.properties.id || 'no-id'}), using first occurrence`);
                }
            } else if (key.startsWith('margin-')) {
                const marginType = key.replace('margin-', '');
                const marginValue = widgetData.properties[key];
                // Store ALL margins, even if 0 (to preserve exact imported values)
                if (marginValue !== undefined && marginValue !== null && marginValue !== '') {
                    originalMargins[marginType] = parseInt(marginValue) || 0;
                }
            } else if (key.startsWith('padding-')) {
                const paddingType = key.replace('padding-', '');
                const paddingValue = widgetData.properties[key];
                // Store ALL padding values, even if 0 (to preserve exact imported values)
                if (paddingValue !== undefined && paddingValue !== null && paddingValue !== '') {
                    originalPadding[paddingType] = parseInt(paddingValue) || 0;
                }
            } else if (key === 'padding') {
                // Handle single padding value (applies to all sides)
                const paddingValue = widgetData.properties[key];
                if (paddingValue !== undefined && paddingValue !== null && paddingValue !== '') {
                    // Store as a special key to indicate it's a single value
                    originalPadding['_single'] = paddingValue;
                }
            }
        });
        
        // Debug: Log all properties to verify anchors are present
        console.log(`Processing widget ${widgetData.type} (${widgetData.properties.id || 'no-id'}), properties:`, Object.keys(widgetData.properties));
        console.log(`Widget ${widgetData.type} (${widgetData.properties.id || 'no-id'}) - Collected ${originalAnchors.length} anchors from OTUI code:`, originalAnchors);
        
        // CRITICAL: Store original size from imported OTUI code to prevent style overrides
        let importedWidth = null;
        let importedHeight = null;
        if (widgetData.properties.width) {
            importedWidth = parseInt(widgetData.properties.width);
        }
        if (widgetData.properties.height) {
            importedHeight = parseInt(widgetData.properties.height);
        }
        
        // Apply properties
        const specialProps = {};
        Object.entries(widgetData.properties).forEach(([key, value]) => {
            // Skip size (handled separately)
            if (key === 'width') {
                const sizeValue = parseInt(value);
                if (!isNaN(sizeValue)) {
                    widget.style.width = `${sizeValue}px`;
                    importedWidth = sizeValue;
                    widget.dataset._importedWidth = sizeValue;
                }
                return;
            } else if (key === 'height') {
                const sizeValue = parseInt(value);
                if (!isNaN(sizeValue)) {
                    widget.style.height = `${sizeValue}px`;
                    importedHeight = sizeValue;
                    widget.dataset._importedHeight = sizeValue;
                }
                return;
            }
            
            // Skip anchors, margins, and padding (handled separately)
            if (key.startsWith('anchors.') || key.startsWith('margin-') || key.startsWith('padding-') || key === 'padding') {
                return;
            }

            // Store event/data bindings separately (e.g., @onClick)
            if (key.startsWith('@')) {
                specialProps[key] = value;
                return;
            }
            
            // Store in dataset for code generation
            // Convert hyphenated keys to camelCase (dataset requirement)
            const camelKey = toCamelCase(key);
            const originalKeyName = (widgetData.originalKeys && widgetData.originalKeys[key]) || key;
            try {
                widget.dataset[camelKey] = value;
                keyMap[camelKey] = originalKeyName; // Store original key name mapping
            } catch (e) {
                // Fallback: store in a custom attribute if dataset fails
                console.warn(`Could not store property '${key}' in dataset, using attribute instead:`, e);
                widget.setAttribute(`data-prop-${key.replace(/[^a-z0-9-]/gi, '-')}`, value);
                // Store in keyMap with special prefix
                keyMap[`attr-${key}`] = key;
            }
        });
        
        // Store original anchors and margins in dataset so code generation uses them
        // CRITICAL: Always store anchors array (even if empty) to distinguish from manually created widgets
        // This ensures ALL imported anchors (left, right, top, bottom, centerIn, fill, horizontalCenter, verticalCenter) are preserved
        // BUT ONLY anchors that were explicitly specified in the OTUI code for this widget instance
        // Sort anchors to ensure consistent output order (alphabetically by anchor type)
        originalAnchors.sort();
        widget.dataset._originalAnchors = JSON.stringify(originalAnchors);
        
        // Always store margins object (even if empty) to ensure consistency
        widget.dataset._originalMargins = JSON.stringify(originalMargins);
        
        // Always store padding object (even if empty) to ensure consistency
        widget.dataset._originalPadding = JSON.stringify(originalPadding);
        widget.dataset._originalSizeDefined = widgetData.sizeDefined ? 'true' : 'false';
        if (widgetData.propertyList && widgetData.propertyList.length > 0) {
            widget.dataset._originalPropertyList = JSON.stringify(widgetData.propertyList);
        } else if (widget.dataset._originalPropertyList) {
            delete widget.dataset._originalPropertyList;
        }

        if (Object.keys(specialProps).length > 0) {
            widget.dataset._specialProps = JSON.stringify(specialProps);
        }
        
        // Store widget data for recursive anchor updates
        // Create a clean copy without circular references (remove parent property)
        const cleanWidgetData = {
            type: widgetData.type,
            originalTypeName: widgetData.originalTypeName,
            parentType: widgetData.parentType,
            indentLevel: widgetData.indentLevel,
            properties: { ...widgetData.properties },
            originalKeys: { ...(widgetData.originalKeys || {}) },
            propertyList: widgetData.propertyList ? widgetData.propertyList.map(entry => ({ ...entry })) : [],
            sizeDefined: widgetData.sizeDefined || false,
            children: widgetData.children.map(child => ({
                type: child.type,
                originalTypeName: child.originalTypeName,
                parentType: child.parentType,
                indentLevel: child.indentLevel,
                properties: { ...child.properties },
                originalKeys: { ...(child.originalKeys || {}) },
                propertyList: child.propertyList ? child.propertyList.map(entry => ({ ...entry })) : [],
                sizeDefined: child.sizeDefined || false,
                children: [] // Don't store nested children to avoid deep circular refs
            }))
        };
        widget.dataset._widgetData = JSON.stringify(cleanWidgetData);
        
        // Debug: Log preserved anchors to verify all are captured
        // This should ONLY show anchors that were explicitly in the OTUI code for this widget
        if (originalAnchors.length > 0) {
            console.log(`✓ Widget ${widgetData.type} (${widget.id || widgetData.properties.id || 'no-id'}) - Preserved ${originalAnchors.length} anchors from OTUI:`, originalAnchors);
        } else {
            console.log(`⚠ Widget ${widgetData.type} (${widget.id || widgetData.properties.id || 'no-id'}) - No anchors specified in OTUI code`);
        }
        if (Object.keys(originalMargins).length > 0) {
            console.log(`  Margins:`, originalMargins);
        }
        
        // Save key mapping
        widget.dataset._keyMap = JSON.stringify(keyMap);
        if (typeof window !== 'undefined' && window.setWidgetDisplayText) {
            window.setWidgetDisplayText(widget);
        }
        
        // Set ID if specified
        if (widgetData.properties.id) {
            widget.id = widgetData.properties.id;
        }
        
        // Add to parent first (needed for anchor calculations)
        const content = document.getElementById('editorContent');
        if (parent && parent.classList && parent.classList.contains('widget')) {
            parent.appendChild(widget);
        } else {
            content.appendChild(widget);
        }
        
        createdWidgets.push(widget);
        
        // Apply OTUI styles FIRST (before anchors) to ensure padding is set correctly
        // This is critical because anchor calculations depend on parent padding
        if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
            // Apply styles synchronously if possible, or in next frame
            window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, widgetData.type);
            void widget.offsetHeight; // Force reflow
            
            // CRITICAL: Restore imported size if it was overridden by styles
            // This ensures imported OTUI code maintains its exact sizes
            if (importedWidth !== null && widget.dataset._importedWidth) {
                const preservedWidth = parseInt(widget.dataset._importedWidth);
                if (parseInt(widget.style.width) !== preservedWidth) {
                    widget.style.width = `${preservedWidth}px`;
                }
            }
            if (importedHeight !== null && widget.dataset._importedHeight) {
                const preservedHeight = parseInt(widget.dataset._importedHeight);
                if (parseInt(widget.style.height) !== preservedHeight) {
                    widget.style.height = `${preservedHeight}px`;
                }
            }
        }
        
        // Apply anchors AFTER styles are applied (so parent padding is correct)
        // This ensures anchor calculations use the correct parent padding
        if (parent && parent.classList && parent.classList.contains('widget')) {
            // Wait for DOM to be ready and parent styles to be applied
            requestAnimationFrame(() => {
                // Clear anchor update map for this widget
                anchorUpdateMap.delete(widget);
                applyAnchorsToWidget(widget, widgetData, parent);
            });
        }
        
        // Create children - children are always positioned using anchors relative to parent
        // Don't use absolute positioning for children
        widgetData.children.forEach((childData) => {
            // Pass 0, 0 for children - they will be positioned by anchors
            const childWidget = createWidgetRecursive(childData, widget, 0, 0);
            // Children are added to parent, no need to track Y position
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
    
    requestAnimationFrame(() => {
        anchorUpdateMap.clear();
        createdWidgets.forEach(widget => {
            const parentElement = widget.parentElement;
            if (!parentElement || !parentElement.classList || !parentElement.classList.contains('widget')) {
                return;
            }
            const widgetData = widget.dataset._widgetData ? JSON.parse(widget.dataset._widgetData) : null;
            if (!widgetData) return;
            anchorUpdateMap.delete(widget);
            applyAnchorsToWidget(widget, widgetData, parentElement);
        });
    });
    
    return createdWidgets;
}

// Export functions
window.parseOTUICode = parseOTUICode;
window.createWidgetsFromOTUI = createWidgetsFromOTUI;
