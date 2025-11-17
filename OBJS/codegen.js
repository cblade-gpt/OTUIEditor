// OBJS/codegen.js - OTUI and Lua code generation

// Helper function to get original property name from camelCase dataset key
function getOriginalPropertyName(widget, camelKey) {
    if (!widget.dataset._keyMap) {
        // No mapping stored, assume camelKey is already the original (for backwards compatibility)
        return camelKey;
    }
    try {
        const keyMap = JSON.parse(widget.dataset._keyMap);
        return keyMap[camelKey] || camelKey;
    } catch (e) {
        return camelKey;
    }
}

// Helper function to convert camelCase to hyphenated (for dataset lookup)
function toCamelCase(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

// Helper function to get value from dataset (handles camelCase conversion)
function getDatasetValue(widget, key) {
    const camelKey = toCamelCase(key);
    return widget.dataset[camelKey];
}

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

function generateOTUICode() {
    const importedTemplates = (typeof window !== 'undefined' && Array.isArray(window._importedTemplates))
        ? window._importedTemplates
        : [];
    let templateCode = '';
    if (importedTemplates.length > 0) {
        importedTemplates.forEach(templateDef => {
            if (templateDef && Array.isArray(templateDef.lines) && templateDef.lines.length > 0) {
                const block = templateDef.lines.join('\n').trimEnd();
                templateCode += block + '\n\n';
            }
        });
    }
    
    function recurse(widget, indent = '') {
        if (!widget) return '';
        
        let code = '';
        const type = widget.dataset.type;
        const id = widget.id;
        
        if (!type || !id) {
            console.warn('Widget missing type or id:', widget);
            return '';
        }
        
        // Check if widget has a base type (custom widget with inheritance)
        const widgetBaseType = widget.dataset.baseType;
        
        // Try to get widget definition - use base type if available, otherwise use type
        let def = OTUI_WIDGETS[type];
        let actualType = type;
        
        // If widget not found and has base type, try using base type
        if (!def && widgetBaseType) {
            def = OTUI_WIDGETS[widgetBaseType];
            if (def) {
                actualType = widgetBaseType; // Use base type for definition lookup
            }
        }
        
        // If still not found, try with UI prefix
        if (!def && !type.startsWith('UI')) {
            const uiType = `UI${type}`;
            def = OTUI_WIDGETS[uiType];
            if (def) {
                actualType = uiType;
            }
        }
        
        // If still not found, create a fallback definition for custom widgets
        if (!def) {
            // This is a custom widget - create a minimal definition
            // Check if it's likely a container based on name
            const isContainer = type.includes('Panel') || type.includes('Window') || 
                               type.includes('Area') || type.includes('Layout') ||
                               type.includes('Container') || type.includes('Scroll') ||
                               type.includes('Loot') || type.includes('Category');
            
            def = {
                category: isContainer ? "Layout" : "Display",
                isContainer: isContainer,
                props: {},
                events: {}
            };
            
            // Also add it to OTUI_WIDGETS for future reference
            if (typeof OTUI_WIDGETS !== 'undefined') {
                OTUI_WIDGETS[type] = def;
            }
        }
        
        const isRoot = widget.parentElement && widget.parentElement.id === 'editorContent';
        const moduleName = document.getElementById('moduleName')?.value || 'main';
        const moduleTitle = document.getElementById('moduleTitle')?.value || 'My Module';

        // Remove "UI" prefix from widget types (e.g., UIButton -> Button, UIPanel -> Panel)
        // But preserve original type name if it's a custom widget
        let widgetType;
        if (widgetBaseType && widgetBaseType !== type) {
            // Custom widget with inheritance - output inheritance syntax
            // type is already the original name (e.g., "CharmItem")
            // widgetBaseType is the base type (e.g., "UICheckBox")
            const baseTypeName = widgetBaseType.startsWith('UI') ? widgetBaseType.substring(2) : widgetBaseType;
            widgetType = `${type} < ${baseTypeName}`;
        } else {
            // Regular widget - remove UI prefix
            widgetType = type.startsWith('UI') ? type.substring(2) : type;
        }
        
        // Check if widget has events (needs ID for Lua reference)
        const hasEvents = def.events && Object.keys(def.events).length > 0;
        
        // Check if ID is auto-generated (pattern: type_1, type_2, etc.)
        const isAutoGeneratedId = /^[a-z]+_\d+$/i.test(id);
        
        // Determine if we need to include ID:
        // 1. Root widget ALWAYS needs ID (for Lua reference)
        // 2. Widgets with events need ID (for Lua reference)
        // 3. Widgets with custom (non-auto-generated) IDs should keep them
        const isRootWidget = isRoot;
        const needsId = isRootWidget || hasEvents || !isAutoGeneratedId;
        
        // Use the widget's actual type and ID - no special handling for UIWindow
        // The first widget becomes the root with its actual type and ID
        code += `${indent}${widgetType}\n`;
        if (needsId) {
            // Root widget uses its actual ID, not moduleName
            code += `${indent}  id: ${id}\n`;
        }

        // Track properties we've already output to avoid duplicates
        const suppressedCommonProps = new Set();

        // Include title/text if set, or if it's a root widget with a title property
        const title = getDatasetValue(widget, 'title');
        const text = getDatasetValue(widget, 'text');
        if (title) {
            code += `${indent}  !text: ${formatTranslationValue(title)}\n`;
            suppressedCommonProps.add('text');
        } else if (isRoot && text) {
            code += `${indent}  !text: ${formatTranslationValue(text)}\n`;
            suppressedCommonProps.add('text');
        }

        // Common OTUI styling properties that should be included in code generation
        // Note: margins are handled by calculateAnchors (visual positioning)
        const commonProperties = ['visible', 'enabled', 'focusable', 'opacity', 'color', 'background',
            'font', 'text', 'text-align', 'text-offset-x', 'text-offset-y', 'image-source', 'image-color'];
        
        // Generate widget-specific properties
        if (def.props) {
            Object.entries(def.props).forEach(([k, v]) => {
            const val = widget.dataset[k];
            const defaultValue = v;
            
            // Use widget value if set, otherwise use default, but skip if both are empty/undefined
            let finalValue = val !== undefined && val !== null && val !== '' ? val : defaultValue;
            
            // Skip if value is still empty/undefined or matches default
            if (finalValue === undefined || finalValue === null || finalValue === '') {
                return;
            }
            
            // Skip if value matches default (don't include unnecessary properties)
            if (finalValue === defaultValue && (defaultValue === '' || defaultValue === 0 || defaultValue === false)) {
                return;
            }
            
            // Format value based on type
            let formattedValue;
            if (typeof finalValue === 'boolean' || finalValue === 'true' || finalValue === 'false') {
                formattedValue = (finalValue === true || finalValue === 'true') ? 'true' : 'false';
            } else if (!isNaN(finalValue) && finalValue !== '') {
                // Number - use as-is (OTUI handles numbers natively)
                formattedValue = finalValue;
            } else {
                // String - wrap in quotes if needed, but OTUI usually doesn't need quotes for strings
                formattedValue = finalValue;
            }
            
                code += `${indent}  ${k}: ${formattedValue}\n`;
            });
        }
        
        // Generate common properties if they differ from defaults
        let textOffsetHandled = false; // Track if text-offset was already output
        commonProperties.forEach(k => {
            if (suppressedCommonProps.has(k)) {
                return;
            }
            // Skip text-offset-x/y if we've already handled text-offset
            if (textOffsetHandled && (k === 'text-offset-x' || k === 'text-offset-y')) {
                return;
            }
            
            const val = getDatasetValue(widget, k);
            // For image-source, text-align, image-color - check even if empty (might be explicitly set)
            const isSpecialProperty = (k === 'image-source' || k === 'text-align' || k === 'image-color');
            
            if (val !== undefined && val !== null && (val !== '' || isSpecialProperty)) {
                // Check if it's different from default
                let shouldInclude = true;
                const defaultValues = {
                    'visible': 'true',
                    'enabled': 'true',
                    'focusable': 'false',
                    'opacity': '1',
                    'color': '',
                    'background': '',
                    'font': '',
                    'text': '',
                    'text-align': '',
                    'text-offset-x': '0',
                    'text-offset-y': '0',
                    'image-source': '',
                    'image-color': ''
                };
                
                // For image-source, text-align, image-color - always include if they have a non-empty value
                if (isSpecialProperty && val && val !== '') {
                    shouldInclude = true;
                } else if (!isSpecialProperty && (val === defaultValues[k] || val === '')) {
                    shouldInclude = false;
                } else if (isSpecialProperty && val === '') {
                    // Don't include if explicitly empty
                    shouldInclude = false;
                }
                
                    if (shouldInclude) {
                        let formattedValue;
                        // Get original property name (handles camelCase conversion)
                        let propertyName = getOriginalPropertyName(widget, toCamelCase(k));
                    
                    // Handle text-offset (combine x and y)
                    if (k === 'text-offset-x' || k === 'text-offset-y') {
                        const offsetX = getDatasetValue(widget, 'text-offset-x') || '0';
                        const offsetY = getDatasetValue(widget, 'text-offset-y') || '0';
                        // Always output text-offset if either value is set (even if 0, user might have explicitly set it)
                        // But check if at least one is non-zero or both are explicitly set
                        const xSet = getDatasetValue(widget, 'text-offset-x') !== undefined;
                        const ySet = getDatasetValue(widget, 'text-offset-y') !== undefined;
                        if (xSet || ySet || offsetX !== '0' || offsetY !== '0') {
                            propertyName = 'text-offset';
                            formattedValue = `${offsetX} ${offsetY}`;
                            code += `${indent}  ${propertyName}: ${formattedValue}\n`;
                            textOffsetHandled = true; // Mark as handled
                        }
                        return; // Skip individual x/y output
                    }
                    
                    if (propertyName.startsWith('!')) {
                        formattedValue = formatTranslationValue(val);
                    } else if (k === 'visible' || k === 'enabled' || k === 'focusable') {
                        formattedValue = (val === 'true' || val === true) ? 'true' : 'false';
                    } else if (k === 'opacity') {
                        formattedValue = val; // Number
                    } else {
                        // For image-source and other strings, use as-is
                        formattedValue = val;
                    }
                    code += `${indent}  ${propertyName}: ${formattedValue}\n`;
                }
            }
        });

        // Size property - include for all widgets (width and height)
        // Always include size property for proper widget dimensions
        const isImportedWidget = widget.dataset._originalAnchors !== undefined;
        const importedSizeDefined = widget.dataset._originalSizeDefined === 'true';
        const shouldOutputSize = !isImportedWidget || importedSizeDefined;
        if (shouldOutputSize) {
            const widgetWidth = widget.offsetWidth || parseInt(widget.style.width) || 400;
            const widgetHeight = widget.offsetHeight || parseInt(widget.style.height) || 300;
            code += `${indent}  size: ${widgetWidth} ${widgetHeight}\n`;
        }
        
        // Output preserved special properties (e.g., @onClick)
        if (widget.dataset._specialProps) {
            try {
                const specialProps = JSON.parse(widget.dataset._specialProps);
                Object.entries(specialProps).forEach(([propKey, propValue]) => {
                    code += `${indent}  ${propKey}: ${propValue}\n`;
                });
            } catch (e) {
                console.warn('Failed to parse special props:', e);
            }
        }

        if (!isRoot) {
            // CRITICAL: Use original anchors/margins from import if available
            // This ensures imported OTUI code maintains its exact anchors/margins
            const originalAnchors = widget.dataset._originalAnchors;
            const originalMargins = widget.dataset._originalMargins;
            
            // CRITICAL: Anchors are REQUIRED - you cannot have margins without anchors
            // If original anchors exist from import, always use them
            // Check if _originalAnchors exists (even if empty array) to know this is an imported widget
            if (originalAnchors !== undefined) {
                // Use preserved original anchors from import - these are the exact anchors from OTUI
                try {
                    const anchors = JSON.parse(originalAnchors);
                    // Debug: Log what anchors we're about to output
                    console.log(`Codegen for ${widget.id || widget.dataset.type} - Found ${anchors.length} anchors:`, anchors);
                    // CRITICAL: Output ALL anchors (left, right, top, bottom, centerIn, fill, etc.)
                    // Don't filter - output exactly as they were in the imported OTUI code
                    anchors.forEach(anchor => {
                        code += `${indent}  ${anchor}\n`;
                    });
                } catch (e) {
                    console.warn('Failed to parse original anchors:', e, 'Raw value:', originalAnchors);
                }
                
                // Output margins as additional offsets (anchors define position, margins are offsets)
                if (originalMargins) {
                    try {
                        const margins = JSON.parse(originalMargins);
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
                        console.warn('Failed to parse original margins:', e);
                    }
                }
            } else {
                // No original anchors/margins preserved - calculate from current position
                // This is for widgets created manually in the editor
                const anchorInfo = calculateAnchors(widget);
                if (anchorInfo) {
                    anchorInfo.anchors.forEach(anchor => {
                        code += `${indent}  ${anchor}\n`;
                    });
                    
                    if (anchorInfo.margins.left !== undefined && anchorInfo.margins.left !== 0) {
                        code += `${indent}  margin-left: ${Math.round(anchorInfo.margins.left)}\n`;
                    }
                    if (anchorInfo.margins.top !== undefined && anchorInfo.margins.top !== 0) {
                        code += `${indent}  margin-top: ${Math.round(anchorInfo.margins.top)}\n`;
                    }
                    if (anchorInfo.margins.right !== undefined && anchorInfo.margins.right !== 0) {
                        code += `${indent}  margin-right: ${Math.round(anchorInfo.margins.right)}\n`;
                    }
                    if (anchorInfo.margins.bottom !== undefined && anchorInfo.margins.bottom !== 0) {
                        code += `${indent}  margin-bottom: ${Math.round(anchorInfo.margins.bottom)}\n`;
                    }
                }
            }
        }

        code += '\n';

        const children = [...widget.children].filter(c => c.classList.contains('widget'));
        children.forEach(child => {
            code += recurse(child, indent + '  ');
        });

        return code;
    }

    let code = '';
    const editorContent = document.getElementById('editorContent');
    
    if (!editorContent) {
        console.error('editorContent element not found');
        return '';
    }
    
    const roots = [...editorContent.querySelectorAll(':scope > .widget')];
    
    console.log('Found root widgets:', roots.length, roots.map(r => ({ type: r.dataset.type, id: r.id })));
    
    if (roots.length === 0) {
        // No widgets at all - generate a basic valid OTUI structure
        const moduleName = document.getElementById('moduleName')?.value || 'main';
        const moduleTitle = document.getElementById('moduleTitle')?.value || 'My Module';
        
        return `MainWindow < UIWindow
  id: ${moduleName}
  !text: tr('${moduleTitle}')
  size: 400 300`;
    } else {
        // Generate code for all root widgets - first widget becomes the root with its actual type and ID
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

function generateLuaCode() {
    const moduleName = document.getElementById('moduleName')?.value || 'main';
    const moduleTitle = document.getElementById('moduleTitle')?.value || 'My Module';
    const uiFileName = `${moduleName}.otui`;
    
    // Helper function to sanitize Lua identifiers (ensure valid variable/function names)
    const sanitizeLuaIdentifier = (str) => {
        if (!str) return 'widget';
        // Replace invalid characters with underscore, ensure it starts with a letter
        let sanitized = str.replace(/[^a-zA-Z0-9_]/g, '_');
        // Ensure it starts with a letter or underscore
        if (/^[0-9]/.test(sanitized)) {
            sanitized = '_' + sanitized;
        }
        // Ensure it's not empty
        if (!sanitized || sanitized.length === 0) {
            sanitized = 'widget';
        }
        return sanitized;
    };
    
    // Get the root widget ID (first widget in editor, use its actual ID)
    const roots = [...document.querySelectorAll('#editorContent > .widget')];
    const rootWidget = roots[0]; // First widget becomes the root
    const rootWidgetId = rootWidget ? sanitizeLuaIdentifier(rootWidget.id) : sanitizeLuaIdentifier(moduleName);
    
    // Collect all widgets that have events
    const widgetRefs = new Map();
    
    function collectWidgets(widget) {
        const type = widget.dataset.type;
        const id = widget.id;
        const def = OTUI_WIDGETS[type];
        if (!def) return;
        
        const isRoot = widget.parentElement && widget.parentElement.id === 'editorContent';
        const hasEvents = Object.keys(def.events).length > 0;
        
        // Collect root widget (always needed for Lua reference) and widgets with events
        if (isRoot || hasEvents) {
            // Sanitize the ID to ensure it's a valid Lua identifier
            const sanitizedId = sanitizeLuaIdentifier(id);
            widgetRefs.set(sanitizedId, {
                id: sanitizedId,
                originalId: id, // Keep original ID for OTUI file lookup
                type: type,
                def: def,
                widget: widget,
                isRoot: isRoot
            });
        }
        
        // Process children recursively
        const children = [...widget.children].filter(c => c.classList.contains('widget'));
        children.forEach(child => {
            collectWidgets(child);
        });
    }
    
    // Collect all widgets
    roots.forEach(root => {
        collectWidgets(root);
    });
    
    // Start generating Lua code following OTCv8 module structure
    let code = `-- Generated by OTUI Builder 0.1.0 Beta\n`;
    code += `-- OTCv8 Compatible Module\n`;
    code += `-- Module: ${moduleTitle}\n\n`;
    
    // Module-level widget variables
    code += `local ${rootWidgetId} = nil\n`;
    
    // Declare all widget variables at module level (root widget and widgets with events)
    widgetRefs.forEach((widgetData, id) => {
        if (!widgetData.isRoot) {
            code += `local ${id} = nil\n`;
        }
    });
    code += `\n`;
    
    // Generate event handler functions (defined before init)
    if (widgetRefs.size > 0) {
        code += `-- Event handler functions\n`;
        widgetRefs.forEach((widgetData, id) => {
            const { type, def } = widgetData;
            
            if (Object.keys(def.events).length > 0) {
                Object.entries(def.events).forEach(([event, sig]) => {
                    // Extract parameters from signature
                    const params = sig.replace(/^function\s*\(|\)\s*$|function\s*/g, '')
                        .split(',')
                        .map(p => p.trim())
                        .filter(p => p);
                    
                    // Generate handler function name
                    const handlerName = `${id}_${event}`;
                    
                    code += `local function ${handlerName}(${params.join(', ')})\n`;
                    code += `  -- TODO: Implement ${event} handler for ${type} '${id}'\n`;
                    if (params.length > 0) {
                        code += `  -- Parameters: ${params.join(', ')}\n`;
                    }
                    code += `end\n\n`;
                });
            }
        });
    }
    
    // Generate init() function following OTCv8 pattern
    code += `-- Initialize module\n`;
    code += `function init()\n`;
    code += `  -- Load the UI file (module context automatically finds it)\n`;
    code += `  ${rootWidgetId} = g_ui.loadUI('${moduleName}', rootWidget)\n`;
    code += `  if not ${rootWidgetId} then\n`;
    code += `    g_logger.error("${moduleTitle}: Failed to load UI from '${moduleName}.otui'")\n`;
    code += `    return false\n`;
    code += `  end\n\n`;
    
    // Get all child widgets using recursiveGetChildById from the loaded root widget
    if (widgetRefs.size > 0) {
        // Separate root widget from child widgets
        const rootWidgetRef = Array.from(widgetRefs.values()).find(w => w.isRoot);
        const childWidgetRefs = Array.from(widgetRefs.values()).filter(w => !w.isRoot);
        
        // Get child widget references
        if (childWidgetRefs.length > 0) {
            code += `  -- Get widget references\n`;
            childWidgetRefs.forEach((widgetData) => {
                const { id, originalId } = widgetData;
                // Use originalId for lookup (from OTUI file), but sanitized id for variable name
                const lookupId = originalId || id;
                code += `  ${id} = ${rootWidgetId}:recursiveGetChildById('${lookupId}')\n`;
                code += `  if not ${id} then\n`;
                code += `    g_logger.warning("${moduleTitle}: Widget '${lookupId}' not found in UI")\n`;
                code += `  end\n`;
            });
            code += `\n`;
        }
        
        // Connect event handlers using OTCv8's connect() function
        code += `  -- Connect event handlers\n`;
        widgetRefs.forEach((widgetData) => {
            const { id, type, def, isRoot } = widgetData;
            const widgetVar = isRoot ? rootWidgetId : id;
            
            if (Object.keys(def.events).length > 0) {
                code += `  if ${widgetVar} then\n`;
                code += `    connect(${widgetVar}, {\n`;
                
                const eventEntries = Object.entries(def.events);
                eventEntries.forEach(([event, sig], index) => {
                    const handlerName = `${id}_${event}`;
                    const isLast = index === eventEntries.length - 1;
                    code += `      ${event} = ${handlerName}${isLast ? '' : ','}\n`;
                });
                
                code += `    })\n`;
                code += `  end\n`;
            }
        });
        code += `\n`;
    }
    
    code += `  return true\n`;
    code += `end\n\n`;
    
    // Generate helper functions to show/hide/toggle the root widget
    code += `-- Show the root widget\n`;
    code += `function show()\n`;
    code += `  if ${rootWidgetId} then\n`;
    code += `    ${rootWidgetId}:show()\n`;
    if (rootWidget && rootWidget.dataset.type === 'UIWindow') {
        code += `    ${rootWidgetId}:raise()\n`;
        code += `    ${rootWidgetId}:focus()\n`;
    }
    code += `  end\n`;
    code += `end\n\n`;
    
    code += `-- Hide the root widget\n`;
    code += `function hide()\n`;
    code += `  if ${rootWidgetId} then\n`;
    code += `    ${rootWidgetId}:hide()\n`;
    code += `  end\n`;
    code += `end\n\n`;
    
    code += `-- Toggle root widget visibility\n`;
    code += `function toggle()\n`;
    code += `  if ${rootWidgetId} then\n`;
    code += `    if ${rootWidgetId}:isVisible() then\n`;
    code += `      hide()\n`;
    code += `    else\n`;
    code += `      show()\n`;
    code += `    end\n`;
    code += `  end\n`;
    code += `end\n\n`;
    
    // Generate terminate() function
    code += `-- Cleanup module\n`;
    code += `function terminate()\n`;
    if (widgetRefs.size > 0) {
        code += `  -- Disconnect event handlers\n`;
        widgetRefs.forEach((widgetData) => {
            const { id, def, isRoot } = widgetData;
            const widgetVar = isRoot ? rootWidgetId : id;
            
            if (Object.keys(def.events).length > 0) {
                code += `  if ${widgetVar} then\n`;
                code += `    disconnect(${widgetVar})\n`;
                code += `  end\n`;
            }
        });
        code += `\n`;
        code += `  -- Cleanup widget references\n`;
        code += `  if ${rootWidgetId} then\n`;
        code += `    ${rootWidgetId}:destroy()\n`;
        code += `  end\n`;
        code += `  ${rootWidgetId} = nil\n`;
        widgetRefs.forEach((widgetData, id) => {
            if (!widgetData.isRoot) {
                code += `  ${id} = nil\n`;
            }
        });
    } else {
        code += `  if ${rootWidgetId} then\n`;
        code += `    ${rootWidgetId}:destroy()\n`;
        code += `  end\n`;
        code += `  ${rootWidgetId} = nil\n`;
    }
    code += `end\n`;
    
    return code.trim();
}

function generateOTMODCode() {
    const moduleName = document.getElementById('moduleName')?.value || 'main';
    const moduleTitle = document.getElementById('moduleTitle')?.value || 'My Module';
    const moduleDescription = document.getElementById('moduleDescription')?.value || '';
    const moduleAuthor = document.getElementById('moduleAuthor')?.value || '';
    const moduleWebsite = document.getElementById('moduleWebsite')?.value || '';
    const moduleSandboxed = document.getElementById('moduleSandboxed')?.checked !== false; // Default true
    const moduleAutoload = document.getElementById('moduleAutoload')?.checked !== false; // Default true
    
    // OTML format requires proper indentation and Module tag
    let code = 'Module\n';
    
    // Name (required)
    code += `  name: ${moduleName}\n`;
    
    // Description (optional, use title as fallback)
    code += `  description: ${moduleDescription || moduleTitle}\n`;
    
    // Author (optional, only include if provided)
    if (moduleAuthor) {
        code += `  author: ${moduleAuthor}\n`;
    }
    
    // Website (optional, only include if provided)
    if (moduleWebsite) {
        code += `  website: ${moduleWebsite}\n`;
    }
    
    // Sandboxed (default: true)
    code += `  sandboxed: ${moduleSandboxed ? 'true' : 'false'}\n`;
    
    // Autoload (default: true)
    code += `  autoload: ${moduleAutoload ? 'true' : 'false'}\n`;
    
    // Scripts array (list format)
    code += `  scripts:\n`;
    code += `    - ${moduleName}.lua\n`;
    
    // Event handlers
    code += `  @onLoad: init()\n`;
    code += `  @onUnload: terminate()\n`;
    
    return code.trim();
}

function updateCodeDisplay() {
    // Generate code
    const otuiCode = generateOTUICode();
    const luaCode = generateLuaCode();
    const otmodCode = generateOTMODCode();
    
    // Debug logging
    console.log('=== CODE GENERATION DEBUG ===');
    console.log('OTUI Code length:', otuiCode.length);
    console.log('OTUI Code preview:', otuiCode.substring(0, 200));
    console.log('Full OTUI Code:', otuiCode);
    
    // Update code elements in modal
    const otuiEl = document.querySelector('#codeModal #otuiCode code');
    const luaEl = document.querySelector('#codeModal #luaCode code');
    const otmodEl = document.querySelector('#codeModal #otmodCode code');
    
    console.log('OTUI element found:', !!otuiEl);
    console.log('LUA element found:', !!luaEl);
    console.log('OTMOD element found:', !!otmodEl);
    
    if (otuiEl) {
        otuiEl.textContent = otuiCode;
        console.log('OTUI code set, element content length:', otuiEl.textContent.length);
    } else {
        console.error('OTUI code element not found!');
    }
    
    if (luaEl) {
        luaEl.textContent = luaCode;
    }
    
    if (otmodEl) {
        otmodEl.textContent = otmodCode;
    }
    
    // Re-highlight if modal is visible
    const codeModal = document.getElementById('codeModal');
    if (codeModal && codeModal.style.display !== 'none') {
        if (typeof Prism !== 'undefined') {
            // Highlight all code blocks in the modal
            codeModal.querySelectorAll('code').forEach(codeEl => {
                Prism.highlightElement(codeEl);
            });
        }
    }
}

function showCodeModal() {
    const modal = document.getElementById('codeModal');
    if (!modal) return;
    
    // Update code before showing
    updateCodeDisplay();
    
    // Show modal
    modal.style.display = 'flex';
    
    // Reset and show active tab
    const allTabs = modal.querySelectorAll('.code-tab');
    const allBlocks = modal.querySelectorAll('.code-block');
    
    // Hide all blocks first
    allBlocks.forEach(block => {
        block.style.display = 'none';
        block.classList.remove('active');
    });
    
    // Find active tab or default to OTUI
    let activeTab = modal.querySelector('.code-tab.active');
    if (!activeTab) {
        activeTab = modal.querySelector('.code-tab[data-tab="otui"]');
        if (activeTab) {
            allTabs.forEach(t => t.classList.remove('active'));
            activeTab.classList.add('active');
        }
    }
    
    // Show corresponding code block
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        const codeBlock = modal.querySelector(`#${tabName}Code`);
        if (codeBlock) {
            codeBlock.style.display = 'block';
            codeBlock.classList.add('active');
        }
    }
    
    // Highlight code after a short delay to ensure DOM is ready
    setTimeout(() => {
        if (typeof Prism !== 'undefined') {
            const visibleBlock = modal.querySelector('.code-block.active');
            if (visibleBlock) {
                const codeElement = visibleBlock.querySelector('code');
                if (codeElement) {
                    Prism.highlightElement(codeElement);
                }
            }
        }
    }, 150);
}

