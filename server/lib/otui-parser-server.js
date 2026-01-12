/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */

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

function getWidgetTypeFromOTUI(otuiName, widgetDefinitions = {}) {
    // Explicit OTUI name mappings (OTUI -> UIWidget)
    // These are common OTUI widget names that don't follow the "UI" prefix pattern
    const explicitMappings = {
        'VerticalScrollBar': 'UIScrollBar',
        'HorizontalScrollBar': 'UIScrollBar',
        'ScrollBar': 'UIScrollBar',
        'MainWindow': 'UIWindow',
        'GameLabel': 'UILabel',
        'FlatPanel': 'UIPanel',
        'ButtonBox': 'UIButtonBox',
        'TextList': 'UITextList',
        'ComboBox': 'UIComboBox',
        'HorizontalSeparator': 'UIHorizontalSeparator',
        'VerticalSeparator': 'UIVerticalSeparator',
        'ScrollablePanel': 'UIScrollArea'
    };
    
    // Check explicit mapping first
    if (explicitMappings[otuiName]) {
        const mappedType = explicitMappings[otuiName];
        // Verify the mapped type exists in widgetDefinitions
        if (widgetDefinitions[mappedType]) {
            return mappedType;
        }
        return mappedType; // Return even if not in definitions (will be handled later)
    }
    
    // Check direct mapping in widgetDefinitions
    if (widgetDefinitions[otuiName]) {
        return otuiName;
    }
    
    // Try with UI prefix
    const uiName = otuiName.startsWith('UI') ? otuiName : `UI${otuiName}`;
    if (widgetDefinitions[uiName]) {
        return uiName;
    }
    
    // Last resort: return with UI prefix
    return uiName;
}

function parseOTUICode(code, widgetDefinitions = {}) {
    const lines = code.split('\n');
    const widgets = [];
    const templates = {};
    const templateDefinitions = [];
    const templateCaptureStack = [];
    const stack = [];
    let inTemplateDefinition = false;
    let templateIndent = -1;
    
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
        
        if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
            captureCurrentLine();
            continue;
        }
        
        const indentMatch = originalLine.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const indentLevel = Math.floor(indent / 2);
        
        while (stack.length > 0 && stack[stack.length - 1].indentLevel >= indentLevel) {
            const popped = stack.pop();
            if (popped && popped.isTemplate) {
                inTemplateDefinition = false;
                templateIndent = -1;
                templateCaptureStack.pop();
            }
        }
        
        const widgetMatch = trimmedLine.match(/^([A-Z][a-zA-Z0-9_]*)(?:\s*<\s*([A-Za-z][A-Za-z0-9_]*))?$/);
        if (widgetMatch) {
            const widgetTypeName = widgetMatch[1];
            const parentTypeName = widgetMatch[2];
            
            if (parentTypeName) {
                // This is a template definition (e.g., "HotkeyListLabel < UILabel")
                // Close any previous template definitions
                while (templateCaptureStack.length > 0) {
                    templateCaptureStack.pop();
                }
                inTemplateDefinition = false;
                templateIndent = -1;
                
                inTemplateDefinition = true;
                templateIndent = indent;
                
                const baseType = getWidgetTypeFromOTUI(parentTypeName, widgetDefinitions);
                const uiType = widgetTypeName;
                
                const templateCaptureEntry = {
                    name: widgetTypeName,
                    baseType: parentTypeName,
                    lines: []
                };
                templateDefinitions.push(templateCaptureEntry);
                templateCaptureStack.push(templateCaptureEntry);
                
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
                
                stack.push(templates[uiType]);
                captureCurrentLine();
                continue;
            } else {
                // This is a widget instance (not a template)
                // If we're capturing a template and this is at root level (indent 0), close the template
                if (inTemplateDefinition && indent === 0) {
                    inTemplateDefinition = false;
                    templateIndent = -1;
                    while (templateCaptureStack.length > 0) {
                        templateCaptureStack.pop();
                    }
                }
                
                if (inTemplateDefinition) {
                    const uiType = getWidgetTypeFromOTUI(widgetTypeName, widgetDefinitions);
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
                    continue;
                } else {
                    captureCurrentLine();
                    const uiType = getWidgetTypeFromOTUI(widgetTypeName, widgetDefinitions);
                    
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
                    
                    if (indentLevel === 0) {
                        widgets.push(widget);
                    } else if (stack.length > 0) {
                        stack[stack.length - 1].children.push(widget);
                    } else {
                        widgets.push(widget);
                    }
                    
                    stack.push(widget);
                    continue;
                }
            }
        }
        
        captureCurrentLine();
        
        if (stack.length === 0) continue;
        
        const currentWidget = stack[stack.length - 1];
        
        const propMatchColon = trimmedLine.match(/^([!@a-zA-Z.-]+):\s*(.*)$/);
        if (propMatchColon) {
            const key = propMatchColon[1];
            let value = propMatchColon[2].trim();
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
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
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('anchors.')) {
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('!')) {
                const actualKey = key.substring(1);
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
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, propMatchColon[2].trim(), trimmedLine, relativeIndent);
                }
            }
            continue;
        }
        
        const propMatchSpace = trimmedLine.match(/^([@a-zA-Z.-]+)\s+(.+)$/);
        if (propMatchSpace) {
            const key = propMatchSpace[1];
            const value = propMatchSpace[2].trim();
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            
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
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('anchors.')) {
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else if (key.startsWith('margin-')) {
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            } else {
                if (currentWidget.properties[key] === undefined) {
                    currentWidget.properties[key] = value;
                    recordOriginalProperty(currentWidget, key, value, trimmedLine, relativeIndent);
                }
            }
            continue;
        }
        
        const boolPropMatch = trimmedLine.match(/^([a-z-]+)$/);
        if (boolPropMatch && indent > 0) {
            const key = boolPropMatch[1];
            const relativeIndent = Math.max(0, indentLevel - currentWidget.indentLevel - 1);
            if (currentWidget.properties[key] === undefined) {
                currentWidget.properties[key] = 'true';
                recordOriginalProperty(currentWidget, key, 'true', trimmedLine, relativeIndent);
            }
            continue;
        }
    }
    
    // Remove parent references to avoid circular structures in JSON
    function removeParentReferences(widget) {
        if (!widget || typeof widget !== 'object') return widget;
        
        // Create a clean copy without parent reference
        const clean = { ...widget };
        delete clean.parent;
        
        // Recursively clean children
        if (Array.isArray(clean.children)) {
            clean.children = clean.children.map(child => removeParentReferences(child));
        }
        
        return clean;
    }
    
    // Clean all widgets and templates
    const cleanedWidgets = widgets.map(w => removeParentReferences(w));
    const cleanedTemplates = {};
    Object.keys(templates).forEach(key => {
        cleanedTemplates[key] = removeParentReferences(templates[key]);
    });
    
    return {
        widgets: cleanedWidgets,
        templates: templateDefinitions,
        templateMap: cleanedTemplates
    };
}

module.exports = {
    parseOTUICode,
    translateAnchorEdge,
    getWidgetTypeFromOTUI
};

