// Server-side OTUI Code Generator (no DOM dependencies)
// Extracted from OBJS/codegen.js - pure generation logic only

function formatTranslationValue(value) {
    if (!value) return '';
    const trimmed = value.trim();
    if (/^tr\s*\(/i.test(trimmed)) {
        return trimmed;
    }
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return `tr(${trimmed})`;
    }
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
    return `tr('${escaped}')`;
}

function clampNumber(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

function calculateAnchorsFromLayout(widgetData) {
    if (!widgetData || widgetData.isRoot) return null;
    const layout = widgetData.layout;
    if (!layout) return null;
    
    const parentWidth = clampNumber(layout.parentWidth);
    const parentHeight = clampNumber(layout.parentHeight);
    if (parentWidth <= 0 || parentHeight <= 0) return null;
    
    const parentPaddingLeft = clampNumber(layout.parentPaddingLeft);
    const parentPaddingRight = clampNumber(layout.parentPaddingRight);
    const parentPaddingTop = clampNumber(layout.parentPaddingTop);
    const parentPaddingBottom = clampNumber(layout.parentPaddingBottom);
    
    const contentWidth = Math.max(0, parentWidth - parentPaddingLeft - parentPaddingRight);
    const contentHeight = Math.max(0, parentHeight - parentPaddingTop - parentPaddingBottom);
    if (contentWidth === 0 || contentHeight === 0) return null;
    
    const widgetWidth = clampNumber(layout.width, clampNumber(widgetData.width, 0));
    const widgetHeight = clampNumber(layout.height, clampNumber(widgetData.height, 0));
    
    const left = clampNumber(layout.left);
    const top = clampNumber(layout.top);
    
    // Convert CSS (padding-box) to OTUI (content-box)
    const contentRelativeLeft = left - parentPaddingLeft;
    const contentRelativeTop = top - parentPaddingTop;
    
    const widgetCenterX = contentRelativeLeft + widgetWidth / 2;
    const widgetCenterY = contentRelativeTop + widgetHeight / 2;
    const parentCenterX = contentWidth / 2;
    const parentCenterY = contentHeight / 2;
    
    const anchors = [];
    const margins = {};
    
    const centerThreshold = 10;
    const isCenteredX = Math.abs(widgetCenterX - parentCenterX) < centerThreshold;
    const isCenteredY = Math.abs(widgetCenterY - parentCenterY) < centerThreshold;
    
    const distFromLeft = Math.max(0, contentRelativeLeft);
    const distFromRight = Math.max(0, contentWidth - contentRelativeLeft - widgetWidth);
    const distFromTop = Math.max(0, contentRelativeTop);
    const distFromBottom = Math.max(0, contentHeight - contentRelativeTop - widgetHeight);
    
    if (isCenteredX) {
        anchors.push('anchors.horizontalCenter: parent.horizontalCenter');
        const offset = widgetCenterX - parentCenterX;
        if (Math.abs(offset) > 0.5) {
            const marginValue = Math.round(Math.abs(offset));
            if (offset > 0) {
                margins.right = marginValue;
            } else {
                margins.left = marginValue;
            }
        }
    } else if (distFromLeft <= distFromRight) {
        anchors.push('anchors.left: parent.left');
        if (Math.round(distFromLeft) !== 0) {
            margins.left = Math.round(distFromLeft);
        }
    } else {
        anchors.push('anchors.right: parent.right');
        if (Math.round(distFromRight) !== 0) {
            margins.right = Math.round(distFromRight);
        }
    }
    
    if (isCenteredY) {
        anchors.push('anchors.verticalCenter: parent.verticalCenter');
        const offset = widgetCenterY - parentCenterY;
        if (Math.abs(offset) > 0.5) {
            const marginValue = Math.round(Math.abs(offset));
            if (offset > 0) {
                margins.bottom = marginValue;
            } else {
                margins.top = marginValue;
            }
        }
    } else if (distFromTop <= distFromBottom) {
        anchors.push('anchors.top: parent.top');
        if (Math.round(distFromTop) !== 0) {
            margins.top = Math.round(distFromTop);
        }
    } else {
        anchors.push('anchors.bottom: parent.bottom');
        if (Math.round(distFromBottom) !== 0) {
            margins.bottom = Math.round(distFromBottom);
        }
    }
    
    return { anchors, margins };
}

function generateOTUICode(widgetTree, widgetDefinitions = {}, importedTemplates = [], userTemplatesFromStorage = []) {
    // Collect all templates from the widget tree (user-created templates)
    const userTemplatesFromTree = new Map(); // Map<templateName, {name, baseType, properties, children}>
    
    // First pass: collect all templates from widget tree (for fallback if not passed from storage)
    function collectTemplates(widgetData) {
        if (!widgetData) return;
        
        // Check if this widget is a template
        if (widgetData.isTemplate && widgetData.templateName && widgetData.templateBaseType) {
            const templateName = widgetData.templateName;
            // Only add if not already collected
            if (!userTemplatesFromTree.has(templateName)) {
                userTemplatesFromTree.set(templateName, {
                    name: templateName,
                    baseType: widgetData.templateBaseType,
                    widgetData: widgetData // Store full widget data for template definition
                });
            }
        }
        
        // Recursively collect from children
        if (widgetData.children && Array.isArray(widgetData.children)) {
            widgetData.children.forEach(child => collectTemplates(child));
        }
    }
    
    // Collect templates from all root widgets
    const roots = Array.isArray(widgetTree) ? widgetTree : [widgetTree];
    roots.forEach(root => collectTemplates(root));
    
    // Generate template definitions code
    let templateCode = '';
    
    // Add imported templates first (from OTUI files)
    if (importedTemplates.length > 0) {
        importedTemplates.forEach(templateDef => {
            if (templateDef && Array.isArray(templateDef.lines) && templateDef.lines.length > 0) {
                const block = templateDef.lines.join('\n').trimEnd();
                templateCode += block + '\n\n';
            }
        });
    }
    
    // Add user-created templates (from template library)
    // Track which templates we've already added to prevent duplicates
    const addedTemplates = new Set();
    
    // First, use templates from storage (has original saved data)
    if (userTemplatesFromStorage && Array.isArray(userTemplatesFromStorage) && userTemplatesFromStorage.length > 0) {
        userTemplatesFromStorage.forEach(template => {
            const templateName = template.name;
            // Skip if already added (prevent duplicates)
            if (addedTemplates.has(templateName)) {
                return;
            }
            addedTemplates.add(templateName);
            
            const baseTypeName = template.baseType.startsWith('UI') 
                ? template.baseType.substring(2) 
                : template.baseType;
            templateCode += `${templateName} < ${baseTypeName}\n`;
            
            // Use the original template data (saved when template was created)
            // template structure: { name, baseType, data } where data is the widgetData
            const templateData = template.data || template;
            const emittedProps = new Set();
            
            // Use originalPropertyList from saved template data if available
            if (templateData.dataset && templateData.dataset._originalPropertyList) {
                try {
                    const originalPropertyList = JSON.parse(templateData.dataset._originalPropertyList);
                    if (Array.isArray(originalPropertyList)) {
                        originalPropertyList.forEach(entry => {
                            if (!entry || !entry.key) return;
                            const key = entry.key;
                            const value = entry.value;
                            
                            // Skip instance-specific properties and internal flags
                            const internalProps = ['id', 'type', 'explicit-width-applied', 'explicit-height-applied', 
                                'explicitWidthApplied', 'explicitHeightApplied', 'image-applied', 'imageApplied',
                                'style-applied', 'styleApplied', 'user-width-override', 'user-height-override',
                                'userWidthOverride', 'userHeightOverride', '_applied-min-size', '_appliedMinSize'];
                            
                            if (key === 'id' || key.startsWith('anchors.') || key.startsWith('margin-') || 
                                key.startsWith('@') || key.startsWith('_') || key === 'size' ||
                                key === 'width' || key === 'height' || internalProps.includes(key)) {
                                return;
                            }
                            
                            if (value !== undefined && value !== null && value !== '' && !emittedProps.has(key)) {
                                templateCode += `  ${key}: ${value}\n`;
                                emittedProps.add(key);
                            }
                        });
                    }
                } catch (e) {
                    // Fall through to properties
                }
            }
            
            // Fallback to properties from template data dataset
            if (templateData.dataset) {
                Object.entries(templateData.dataset).forEach(([key, value]) => {
                    // Skip internal properties and instance-specific ones
                    const internalProps = ['id', 'type', 'explicit-width-applied', 'explicit-height-applied', 
                        'explicitWidthApplied', 'explicitHeightApplied', 'image-applied', 'imageApplied',
                        'style-applied', 'styleApplied', 'user-width-override', 'user-height-override',
                        'userWidthOverride', 'userHeightOverride', '_applied-min-size', '_appliedMinSize'];
                    
                    if (key.startsWith('_') || key === 'id' || key.startsWith('anchors.') || 
                        key.startsWith('margin-') || key.startsWith('@') || key === 'size' ||
                        key === 'width' || key === 'height' || internalProps.includes(key) || emittedProps.has(key)) {
                        return;
                    }
                    if (value !== undefined && value !== null && value !== '') {
                        // Convert camelCase to hyphen-case for OTUI
                        const hyphenKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                        templateCode += `  ${hyphenKey}: ${value}\n`;
                        emittedProps.add(key);
                    }
                });
            }
            
            // CRITICAL: Include children in template definition (they're part of the template)
            // templateData structure: { name, baseType, data } where data is the widgetData
            const widgetData = templateData.data || templateData;
            if (widgetData.children && Array.isArray(widgetData.children) && widgetData.children.length > 0) {
                widgetData.children.forEach(child => {
                    const childCode = recurse(child, '  '); // Indent children in template
                    if (childCode) {
                        templateCode += childCode;
                    }
                });
            }
            
            templateCode += '\n';
        });
    }
    
    // Fallback: Also add templates collected from widget tree (if not passed from storage)
    if (userTemplatesFromTree.size > 0) {
        userTemplatesFromTree.forEach((template, templateName) => {
            // Skip if already added (prevent duplicates)
            if (addedTemplates.has(templateName)) {
                return;
            }
            addedTemplates.add(templateName);
            
            const baseTypeName = template.baseType.startsWith('UI') 
                ? template.baseType.substring(2) 
                : template.baseType;
            templateCode += `${templateName} < ${baseTypeName}\n`;
            
            // Generate template definition properties from the template widget
            // Use originalPropertyList if available to preserve exact property order
            const widgetData = template.widgetData;
            const emittedProps = new Set();
            
            // Try to use originalPropertyList first (preserves exact order and values)
            if (widgetData.originalPropertyList && Array.isArray(widgetData.originalPropertyList)) {
                widgetData.originalPropertyList.forEach(entry => {
                    if (!entry || !entry.key) return;
                    const key = entry.key;
                    const value = entry.value;
                    
                    // Skip instance-specific properties and internal flags
                    const internalProps = ['id', 'type', 'explicit-width-applied', 'explicit-height-applied', 
                        'explicitWidthApplied', 'explicitHeightApplied', 'image-applied', 'imageApplied',
                        'style-applied', 'styleApplied', 'user-width-override', 'user-height-override',
                        'userWidthOverride', 'userHeightOverride', '_applied-min-size', '_appliedMinSize'];
                    
                    if (key === 'id' || key.startsWith('anchors.') || key.startsWith('margin-') || 
                        key.startsWith('@') || key.startsWith('_') || key === 'size' ||
                        key === 'width' || key === 'height' || internalProps.includes(key)) {
                        return;
                    }
                    
                    if (value !== undefined && value !== null && value !== '' && !emittedProps.has(key)) {
                        templateCode += `  ${key}: ${value}\n`;
                        emittedProps.add(key);
                    }
                });
            }
            
            // Also add any properties not in originalPropertyList (fallback)
            if (widgetData.properties) {
                Object.entries(widgetData.properties).forEach(([key, value]) => {
                    // Skip instance-specific properties and internal flags
                    const internalProps = ['id', 'type', 'explicit-width-applied', 'explicit-height-applied', 
                        'explicitWidthApplied', 'explicitHeightApplied', 'image-applied', 'imageApplied',
                        'style-applied', 'styleApplied', 'user-width-override', 'user-height-override',
                        'userWidthOverride', 'userHeightOverride', '_applied-min-size', '_appliedMinSize'];
                    
                    if (key === 'id' || key.startsWith('anchors.') || key.startsWith('margin-') || 
                        key.startsWith('@') || key.startsWith('_') || key === 'size' ||
                        key === 'width' || key === 'height' || internalProps.includes(key) || emittedProps.has(key)) {
                        return;
                    }
                    if (value !== undefined && value !== null && value !== '') {
                        templateCode += `  ${key}: ${value}\n`;
                        emittedProps.add(key);
                    }
                });
            }
            
            // CRITICAL: Include children in template definition (they're part of the template)
            if (widgetData.children && Array.isArray(widgetData.children) && widgetData.children.length > 0) {
                widgetData.children.forEach(child => {
                    const childCode = recurse(child, '  '); // Indent children in template
                    if (childCode) {
                        templateCode += childCode;
                    }
                });
            }
            
            templateCode += '\n';
        });
    }
    
    function recurse(widgetData, indent = '') {
        if (!widgetData) return '';
        
        let code = '';
        // CRITICAL: Check if this is a template first (takes precedence)
        const isTemplate = widgetData.isTemplate === true;
        const templateName = widgetData.templateName;
        const templateBaseType = widgetData.templateBaseType;
        
        let widgetType;
        let type, id;
        
        if (isTemplate && templateName && templateBaseType) {
            // This is a template INSTANCE - just use the template name (definition is already at top)
            // Template definition was already generated at the top, so just use the name here
            widgetType = templateName; // Just the name, not "TemplateName < BaseType"
            type = templateName;
            id = widgetData.id;
        } else {
            // Regular widget or custom widget with inheritance
            // CRITICAL: Use originalTypeName if available (preserves OTUI names like "VerticalScrollBar")
            // Otherwise fall back to type, then baseType
            const originalTypeName = widgetData.originalTypeName;
            type = originalTypeName || widgetData.type;
            id = widgetData.id;
            
            if (!type || !id) {
                return '';
            }
            
            const widgetBaseType = widgetData.baseType;
            
            // If baseType exists and differs from type, this is a custom widget with inheritance
            // OR a mapped widget (e.g., VerticalScrollBar -> UIScrollBar)
            if (widgetBaseType && widgetBaseType !== type) {
                // Check if this is a mapped widget (e.g., VerticalScrollBar mapped to UIScrollBar)
                // In this case, we want to output the original name (VerticalScrollBar), not the mapped type
                // Only use "Name < BaseType" format for actual custom widgets with inheritance
                const baseTypeName = widgetBaseType.startsWith('UI') ? widgetBaseType.substring(2) : widgetBaseType;
                const typeName = type.startsWith('UI') ? type.substring(2) : type;
                
                // If the type name matches the base type name (after removing UI prefix),
                // this is likely a mapped widget, not a custom widget - just output the original name
                if (typeName === baseTypeName) {
                    widgetType = typeName;
                } else {
                    // This is a custom widget with inheritance (e.g., "CharmItem < UICheckBox")
                    widgetType = `${typeName} < ${baseTypeName}`;
                }
            } else {
                widgetType = type.startsWith('UI') ? type.substring(2) : type;
            }
        }
        
        if (!id) {
            return '';
        }
        
        const isRoot = widgetData.isRoot || false;
        const needsId = isRoot || widgetData.hasEvents || !widgetData.isAutoGeneratedId;
        
        code += `${indent}${widgetType}\n`;
        if (needsId) {
            code += `${indent}  id: ${id}\n`;
        }
        
        let sizeAlreadyDefined = false;
        const emittedProperties = new Set();
        let originalPropertyList = widgetData.originalPropertyList || null;
        let usingOriginalPropertyList = false;
        let originalPropertyListIncludesMargins = false;
        
        if (originalPropertyList && Array.isArray(originalPropertyList) && originalPropertyList.length > 0) {
            usingOriginalPropertyList = true;
        }
        
        if (usingOriginalPropertyList) {
            // Internal properties that should never appear in OTUI code
            const internalProperties = new Set([
                'id', 'explicitWidthApplied', 'explicitHeightApplied', '_appliedMinSize',
                'userWidthOverride', 'userHeightOverride', 'imageApplied', 'styleApplied'
            ]);
            
            // CRITICAL: Output properties in EXACT original order, including anchors and event handlers
            // This preserves the original OTUI code structure
            originalPropertyList.forEach(entry => {
                if (!entry || !entry.key) return;
                const key = entry.key;
                let value = entry.value;
                
                if (key === 'size' || key === 'width' || key === 'height') {
                    sizeAlreadyDefined = true;
                }
                
                // Skip id (handled separately) and internal properties
                if (key === 'id' || internalProperties.has(key) || key.startsWith('_')) {
                    return;
                }
                
                // Include anchors and event handlers in their original positions
                // Anchors and margins will be output here in original order
                if (key.startsWith('anchors.') || key.startsWith('@')) {
                    // Output anchors and event handlers in their original positions
                    if (value === undefined || value === null || value === '') return;
                    if (emittedProperties.has(key)) return;
                    code += `${indent}  ${key}: ${value}\n`;
                    emittedProperties.add(key);
                    return;
                }
                
                if (key.startsWith('margin-') || key === 'margin') {
                    originalPropertyListIncludesMargins = true;
                }
                
                if (value === undefined || value === null) return;
                if (emittedProperties.has(key)) return;
                if (key.startsWith('!')) {
                    value = formatTranslationValue(value);
                }
                code += `${indent}  ${key}: ${value}\n`;
                emittedProperties.add(key);
            });
        } else {
            // Generate properties from widgetData
            const properties = widgetData.properties || {};
            // Internal properties that should never appear in OTUI code
            const internalProperties = new Set([
                'id', 'explicitWidthApplied', 'explicitHeightApplied', '_appliedMinSize',
                'userWidthOverride', 'userHeightOverride', 'imageApplied', 'styleApplied'
            ]);
            
            Object.entries(properties).forEach(([key, value]) => {
                if (key === 'id' || key.startsWith('anchors.') || key.startsWith('@')) {
                    return;
                }
                // Skip internal properties
                if (internalProperties.has(key) || key.startsWith('_')) {
                    return;
                }
                if (key === 'size' || key === 'width' || key === 'height') {
                    sizeAlreadyDefined = true;
                }
                if (value === undefined || value === null || value === '') return;
                if (emittedProperties.has(key)) return;
                
                let formattedValue = value;
                if (key.startsWith('!')) {
                    formattedValue = formatTranslationValue(value);
                }
                code += `${indent}  ${key}: ${formattedValue}\n`;
                emittedProperties.add(key);
            });
        }
        
        // Size property
        const isImportedWidget = widgetData.originalAnchors !== undefined;
        const importedSizeDefined = widgetData.originalSizeDefined === true;
        const shouldOutputSize = (!isImportedWidget || importedSizeDefined) && !sizeAlreadyDefined;
        if (shouldOutputSize) {
            const width = widgetData.width || widgetData.properties?.width || 400;
            const height = widgetData.height || widgetData.properties?.height || 300;
            code += `${indent}  size: ${width} ${height}\n`;
        }
        
        // Output anchors and margins (only if not already in originalPropertyList)
        // If using originalPropertyList, anchors and margins are already output in their original positions
        if (!isRoot && !usingOriginalPropertyList) {
            if (widgetData.originalAnchors !== undefined) {
                try {
                    const anchors = Array.isArray(widgetData.originalAnchors) 
                        ? widgetData.originalAnchors 
                        : JSON.parse(widgetData.originalAnchors);
                    anchors.forEach(anchor => {
                        code += `${indent}  ${anchor}\n`;
                    });
                } catch (e) {
                    // Ignore parse errors
                }
                
                // CRITICAL: Always use original margins if they exist (from imported OTUI)
                // This preserves exact margin values from the original code, even if 0
                // Only skip if margins are already in originalPropertyList (to avoid duplication)
                if (widgetData.originalMargins && !originalPropertyListIncludesMargins) {
                    try {
                        const margins = typeof widgetData.originalMargins === 'object'
                            ? widgetData.originalMargins
                            : JSON.parse(widgetData.originalMargins);
                        // Output all margins that were explicitly set in original OTUI
                        // This preserves negative margins (e.g., margin-top: -10) and zero margins
                        if (margins.left !== undefined) {
                            code += `${indent}  margin-left: ${margins.left}\n`;
                        }
                        if (margins.top !== undefined) {
                            code += `${indent}  margin-top: ${margins.top}\n`;
                        }
                        if (margins.right !== undefined) {
                            code += `${indent}  margin-right: ${margins.right}\n`;
                        }
                        if (margins.bottom !== undefined) {
                            code += `${indent}  margin-bottom: ${margins.bottom}\n`;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            } else {
                const generated = calculateAnchorsFromLayout(widgetData);
                if (generated && Array.isArray(generated.anchors)) {
                    generated.anchors.forEach(anchor => {
                        code += `${indent}  ${anchor}\n`;
                    });
                    const margins = generated.margins || {};
                    if (margins.left) {
                        code += `${indent}  margin-left: ${margins.left}\n`;
                    }
                    if (margins.top) {
                        code += `${indent}  margin-top: ${margins.top}\n`;
                    }
                    if (margins.right) {
                        code += `${indent}  margin-right: ${margins.right}\n`;
                    }
                    if (margins.bottom) {
                        code += `${indent}  margin-bottom: ${margins.bottom}\n`;
                    }
                }
            }
        }
        
        // Output event handlers if not already in originalPropertyList
        if (!usingOriginalPropertyList && widgetData.specialProps) {
            try {
                const specialProps = typeof widgetData.specialProps === 'object'
                    ? widgetData.specialProps
                    : JSON.parse(widgetData.specialProps);
                Object.entries(specialProps).forEach(([key, value]) => {
                    if (key.startsWith('@') && value) {
                        code += `${indent}  ${key}: ${value}\n`;
                    }
                });
            } catch (e) {
                // Ignore parse errors
            }
        }
        
        code += '\n';
        
        // Process children
        // CRITICAL: If this is a template instance, DON'T include children here
        // Children are already in the template definition, instances inherit them
        const isTemplateInstance = isTemplate && templateName && templateBaseType;
        if (!isTemplateInstance) {
            const children = widgetData.children || [];
            children.forEach(child => {
                code += recurse(child, indent + '  ');
            });
        }
        
        return code;
    }
    
    let code = '';
    // Reuse roots variable already declared above (for template collection)
    // const roots is already declared at line 146
    
    if (roots.length === 0) {
        return `MainWindow < UIWindow
  id: main
  !text: tr('My Module')
  size: 400 300`;
    } else {
        roots.forEach(root => {
            const widgetCode = recurse(root);
            if (widgetCode) {
                code += widgetCode;
            }
        });
        let finalCode = code.trim();
        const trimmedTemplate = templateCode.trim();
        if (trimmedTemplate.length > 0) {
            if (finalCode.length > 0) {
                finalCode = `${trimmedTemplate}\n\n${finalCode}`;
            } else {
                finalCode = trimmedTemplate;
            }
        }
        return finalCode;
    }
}

module.exports = {
    generateOTUICode,
    formatTranslationValue
};

