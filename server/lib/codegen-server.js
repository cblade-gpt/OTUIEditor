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

function generateOTUICode(widgetTree, widgetDefinitions = {}, importedTemplates = []) {
    let templateCode = '';
    if (importedTemplates.length > 0) {
        importedTemplates.forEach(templateDef => {
            if (templateDef && Array.isArray(templateDef.lines) && templateDef.lines.length > 0) {
                const block = templateDef.lines.join('\n').trimEnd();
                templateCode += block + '\n\n';
            }
        });
    }
    
    function recurse(widgetData, indent = '') {
        if (!widgetData) return '';
        
        let code = '';
        const type = widgetData.type;
        const id = widgetData.id;
        
        if (!type || !id) {
            return '';
        }
        
        const widgetBaseType = widgetData.baseType;
        let widgetType;
        
        if (widgetBaseType && widgetBaseType !== type) {
            const baseTypeName = widgetBaseType.startsWith('UI') ? widgetBaseType.substring(2) : widgetBaseType;
            widgetType = `${type} < ${baseTypeName}`;
        } else {
            widgetType = type.startsWith('UI') ? type.substring(2) : type;
        }
        
        const isRoot = widgetData.isRoot || false;
        const needsId = isRoot || widgetData.hasEvents || !widgetData.isAutoGeneratedId;
        
        code += `${indent}${widgetType}\n`;
        if (needsId) {
            code += `${indent}  id: ${id}\n`;
        }
        
        let sizeAlreadyDefined = false;
        let originalPropertyList = widgetData.originalPropertyList || null;
        let usingOriginalPropertyList = false;
        let originalPropertyListIncludesMargins = false;
        
        if (originalPropertyList && Array.isArray(originalPropertyList) && originalPropertyList.length > 0) {
            usingOriginalPropertyList = true;
        }
        
        if (usingOriginalPropertyList) {
            originalPropertyList.forEach(entry => {
                if (!entry || !entry.key) return;
                const key = entry.key;
                let value = entry.value;
                
                if (key === 'size' || key === 'width' || key === 'height') {
                    sizeAlreadyDefined = true;
                }
                if (key === 'id' || key.startsWith('anchors.') || key.startsWith('@')) {
                    return;
                }
                if (key.startsWith('margin-') || key === 'margin') {
                    originalPropertyListIncludesMargins = true;
                }
                if (value === undefined || value === null) return;
                if (key.startsWith('!')) {
                    value = formatTranslationValue(value);
                }
                code += `${indent}  ${key}: ${value}\n`;
            });
        } else {
            // Generate properties from widgetData
            const properties = widgetData.properties || {};
            Object.entries(properties).forEach(([key, value]) => {
                if (key === 'id' || key.startsWith('anchors.') || key.startsWith('@')) {
                    return;
                }
                if (key === 'size' || key === 'width' || key === 'height') {
                    sizeAlreadyDefined = true;
                }
                if (value === undefined || value === null || value === '') return;
                
                let formattedValue = value;
                if (key.startsWith('!')) {
                    formattedValue = formatTranslationValue(value);
                }
                code += `${indent}  ${key}: ${formattedValue}\n`;
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
        
        // Output anchors and margins
        if (!isRoot) {
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
                
                if (widgetData.originalMargins && !originalPropertyListIncludesMargins) {
                    try {
                        const margins = typeof widgetData.originalMargins === 'object'
                            ? widgetData.originalMargins
                            : JSON.parse(widgetData.originalMargins);
                        if (margins.left !== undefined && margins.left !== 0) {
                            code += `${indent}  margin-left: ${margins.left}\n`;
                        }
                        if (margins.top !== undefined && margins.top !== 0) {
                            code += `${indent}  margin-top: ${margins.top}\n`;
                        }
                        if (margins.right !== undefined && margins.right !== 0) {
                            code += `${indent}  margin-right: ${margins.right}\n`;
                        }
                        if (margins.bottom !== undefined && margins.bottom !== 0) {
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
        
        code += '\n';
        
        // Process children
        const children = widgetData.children || [];
        children.forEach(child => {
            code += recurse(child, indent + '  ');
        });
        
        return code;
    }
    
    let code = '';
    const roots = Array.isArray(widgetTree) ? widgetTree : [widgetTree];
    
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

