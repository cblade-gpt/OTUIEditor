// OBJS/preview.js - Preview functionality and OTCv8 styling
function updatePreview() {
    const win = document.getElementById('previewWindow');
    if (!win) return;
    
    const content = document.getElementById('editorContent');
    if (!content) return;
    
    // Create preview container with OTCv8 game background (pure black like game)
    const previewContainer = document.createElement('div');
    previewContainer.id = 'previewContent';
    previewContainer.style.cssText = `
        position: relative;
        min-width: 800px;
        min-height: 600px;
        padding: 0;
        background: #000000;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        overflow: hidden;
    `;
    
    // Clone widgets recursively, preserving hierarchy
    function cloneWidgetRecursive(originalWidget, targetParent) {
        // Create new widget element
        const widget = document.createElement('div');
        
        // IMPORTANT: Set widget class and container class if applicable
        // Always ensure 'widget' class is present
        widget.className = originalWidget.className || 'widget';
        if (!widget.classList.contains('widget')) {
            widget.classList.add('widget');
        }
        // Copy all classes from original widget
        if (originalWidget.classList.contains('container')) {
            widget.classList.add('container');
        }
        // Copy widget type class (e.g., UIWindow, UIButton, etc.)
        const type = originalWidget.dataset.type;
        if (type) {
            widget.classList.add(type);
        }
        
        // Copy dataset attributes
        Object.keys(originalWidget.dataset).forEach(key => {
            widget.dataset[key] = originalWidget.dataset[key];
        });
        
        // Copy ID
        widget.id = originalWidget.id;
        
        // Type already defined above, just check if it exists
        if (!type) return widget;
        
        // Preserve size and position from original
        const originalWidth = originalWidget.offsetWidth;
        const originalHeight = originalWidget.offsetHeight;
        const originalLeft = parseInt(originalWidget.style.left) || 0;
        const originalTop = parseInt(originalWidget.style.top) || 0;
        
        // Set basic properties
        widget.style.width = originalWidth + 'px';
        widget.style.height = originalHeight + 'px';
        widget.style.left = originalLeft + 'px';
        widget.style.top = originalTop + 'px';
        
        // Get child widgets from original before cloning content
        // Look for direct children that are widgets (have .widget class or dataset.type)
        const childWidgets = [];
        [...originalWidget.children].forEach(child => {
            // Check if it's a widget by class or by having dataset.type
            if (child.classList.contains('widget') || child.dataset.type) {
                childWidgets.push(child);
            }
        });
        
        // Copy text content if it exists
        const originalContent = originalWidget.querySelector('.widget-content');
        if (originalContent) {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'widget-content';
            contentDiv.textContent = originalContent.textContent;
            widget.appendChild(contentDiv);
        }
        
        // Apply OTCv8 styling (this will set position, etc.)
        // Try to use loaded OTUI styles first
        let stylesApplied = false;
        if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
            stylesApplied = window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, type);
        }
        // Only apply hardcoded styles as fallback if no loaded styles were found
        if (!stylesApplied) {
            applyOTCV8Styles(widget, type);
        }
        
        // Ensure size is preserved after styling
        widget.style.width = originalWidth + 'px';
        widget.style.height = originalHeight + 'px';
        widget.style.left = originalLeft + 'px';
        widget.style.top = originalTop + 'px';
        
        // Add widget to target parent
        targetParent.appendChild(widget);
        
        // Recursively clone children into this widget
        childWidgets.forEach(child => {
            cloneWidgetRecursive(child, widget);
        });
        
        return widget;
    }
    
    // Clone root-level widgets
    const rootWidgets = content.querySelectorAll(':scope > .widget');
    if (rootWidgets.length === 0) {
        // Show message if no widgets
        previewContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 2rem; font-family: Tahoma, Arial, sans-serif;">No widgets to preview</div>';
    } else {
        rootWidgets.forEach(widget => {
            cloneWidgetRecursive(widget, previewContainer);
        });
    }
    
    win.innerHTML = '';
    win.appendChild(previewContainer);
}

function applyOTCV8Styles(widget, type) {
    // Set base styles for OTCv8 preview (preserve position/size)
    const width = widget.style.width;
    const height = widget.style.height;
    const left = widget.style.left;
    const top = widget.style.top;
    
    // Reset styles but preserve essential layout
    widget.style.position = 'absolute';
    widget.style.cursor = 'default';
    widget.style.userSelect = 'none';
    widget.style.boxSizing = 'border-box';
    widget.style.margin = '0';
    widget.style.padding = '0';
    widget.style.width = width;
    widget.style.height = height;
    widget.style.left = left;
    widget.style.top = top;
    widget.style.zIndex = 'auto';
    
    // Apply type-specific OTCv8 styling
    switch(type) {
        case 'UIWindow':
            widget.style.background = '#1e1e1e';
            widget.style.borderTop = '2px solid #4a4a4a';
            widget.style.borderLeft = '2px solid #4a4a4a';
            widget.style.borderRight = '2px solid #1a1a1a';
            widget.style.borderBottom = '2px solid #1a1a1a';
            widget.style.boxShadow = 'inset 1px 1px 0 rgba(255,255,255,0.1), inset -1px -1px 0 rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.5)';
            break;
            
        case 'UIPanel':
            const opacity = parseFloat(widget.dataset.opacity) || 1;
            if (widget.dataset.color === 'alpha' || opacity < 1) {
                widget.style.background = `rgba(20, 20, 20, ${opacity * 0.85})`;
            } else {
                widget.style.background = '#181818';
            }
            widget.style.borderTop = '1px solid #0f0f0f';
            widget.style.borderLeft = '1px solid #0f0f0f';
            widget.style.borderRight = '1px solid #353535';
            widget.style.borderBottom = '1px solid #353535';
            break;
            
        case 'UIButton':
            widget.style.background = '#2a2a2a';
            widget.style.borderTop = '1px solid #4a4a4a';
            widget.style.borderLeft = '1px solid #4a4a4a';
            widget.style.borderRight = '1px solid #1a1a1a';
            widget.style.borderBottom = '1px solid #1a1a1a';
            widget.style.cursor = 'pointer';
            widget.style.boxShadow = 'inset 1px 1px 0 rgba(255,255,255,0.1), inset -1px -1px 0 rgba(0,0,0,0.5)';
            break;
            
        case 'UILabel':
            widget.style.background = 'transparent';
            widget.style.border = 'none';
            widget.style.color = '#d4d4d4';
            widget.style.fontFamily = '"Tahoma", "Arial", sans-serif';
            widget.style.fontSize = '11px';
            widget.style.fontWeight = 'normal';
            widget.style.textShadow = '1px 1px 1px rgba(0,0,0,0.8)';
            break;
            
        case 'UICheckBox':
            widget.style.background = '#1a1a1a';
            widget.style.borderTop = '1px solid #3a3a3a';
            widget.style.borderLeft = '1px solid #3a3a3a';
            widget.style.borderRight = '1px solid #0a0a0a';
            widget.style.borderBottom = '1px solid #0a0a0a';
            widget.style.width = '13px';
            widget.style.height = '13px';
            widget.style.minWidth = '13px';
            widget.style.minHeight = '13px';
            if (widget.dataset.checked === 'true' || widget.dataset.checked === 'false') {
                widget.style.background = widget.dataset.checked === 'true' ? '#3a3a3a' : '#1a1a1a';
                if (widget.dataset.checked === 'true') {
                    const check = document.createElement('div');
                    check.style.cssText = 'position: absolute; top: 2px; left: 4px; width: 3px; height: 6px; border: 2px solid #fff; border-top: none; border-left: none; transform: rotate(45deg); z-index: 10;';
                    widget.appendChild(check);
                }
            }
            break;
            
        case 'UIRadioButton':
            widget.style.background = '#1a1a1a';
            widget.style.borderTop = '1px solid #3a3a3a';
            widget.style.borderLeft = '1px solid #3a3a3a';
            widget.style.borderRight = '1px solid #0a0a0a';
            widget.style.borderBottom = '1px solid #0a0a0a';
            widget.style.borderRadius = '50%';
            widget.style.width = '13px';
            widget.style.height = '13px';
            widget.style.minWidth = '13px';
            widget.style.minHeight = '13px';
            if (widget.dataset.checked === 'true' || widget.dataset.checked === 'false') {
                if (widget.dataset.checked === 'true') {
                    const dot = document.createElement('div');
                    dot.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 5px; height: 5px; background: #fff; border-radius: 50%; z-index: 10;';
                    widget.appendChild(dot);
                }
            }
            break;
            
        case 'UITextEdit':
            widget.style.background = '#0f0f0f';
            widget.style.borderTop = '1px solid #2a2a2a';
            widget.style.borderLeft = '1px solid #2a2a2a';
            widget.style.borderRight = '1px solid #4a4a4a';
            widget.style.borderBottom = '1px solid #4a4a4a';
            widget.style.color = '#e0e0e0';
            widget.style.fontFamily = '"Courier New", monospace';
            widget.style.fontSize = '11px';
            break;
            
        case 'UIProgressBar':
            const percent = parseInt(widget.dataset.percent) || 0;
            widget.style.background = '#0f0f0f';
            widget.style.borderTop = '1px solid #2a2a2a';
            widget.style.borderLeft = '1px solid #2a2a2a';
            widget.style.borderRight = '1px solid #4a4a4a';
            widget.style.borderBottom = '1px solid #4a4a4a';
            widget.style.position = 'relative';
            widget.style.overflow = 'hidden';
            widget.style.height = '16px';
            widget.style.minHeight = '16px';
            
            // Remove content text
            const contentEl = widget.querySelector('.widget-content');
            if (contentEl) {
                contentEl.style.display = 'none';
            }
            
            // Create progress bar fill
            const bar = document.createElement('div');
            bar.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: ${Math.max(0, Math.min(100, percent))}%;
                background: linear-gradient(180deg, #4a7fa8 0%, #2a5f88 50%, #1a4f78 100%);
                border-right: 1px solid rgba(255,255,255,0.2);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
            `;
            widget.appendChild(bar);
            
            // Add percentage text overlay
            const percentText = document.createElement('div');
            percentText.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); pointer-events: none; z-index: 10;';
            percentText.textContent = `${percent}%`;
            widget.appendChild(percentText);
            break;
            
        case 'UIHealthBar':
            const hpPercent = Math.max(0, Math.min(100, parseInt(widget.dataset.percent) || 100));
            widget.style.background = '#0f0f0f';
            widget.style.borderTop = '1px solid #2a2a2a';
            widget.style.borderLeft = '1px solid #2a2a2a';
            widget.style.borderRight = '1px solid #4a4a4a';
            widget.style.borderBottom = '1px solid #4a4a4a';
            widget.style.position = 'relative';
            widget.style.overflow = 'hidden';
            widget.style.height = '12px';
            widget.style.minHeight = '12px';
            
            if (widget.querySelector('.widget-content')) {
                widget.querySelector('.widget-content').style.display = 'none';
            }
            
            const hpBar = document.createElement('div');
            const hpColor = widget.dataset.color === 'red' 
                ? 'linear-gradient(180deg, #d44040 0%, #a02020 50%, #801010 100%)'
                : 'linear-gradient(180deg, #40d440 0%, #20a020 50%, #108010 100%)';
            hpBar.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: ${hpPercent}%;
                background: ${hpColor};
                border-right: 1px solid rgba(255,255,255,0.15);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
            `;
            widget.appendChild(hpBar);
            break;
            
        case 'UIManaBar':
            const manaPercent = Math.max(0, Math.min(100, parseInt(widget.dataset.percent) || 100));
            widget.style.background = '#0f0f0f';
            widget.style.borderTop = '1px solid #2a2a2a';
            widget.style.borderLeft = '1px solid #2a2a2a';
            widget.style.borderRight = '1px solid #4a4a4a';
            widget.style.borderBottom = '1px solid #4a4a4a';
            widget.style.position = 'relative';
            widget.style.overflow = 'hidden';
            widget.style.height = '12px';
            widget.style.minHeight = '12px';
            
            if (widget.querySelector('.widget-content')) {
                widget.querySelector('.widget-content').style.display = 'none';
            }
            
            const manaBar = document.createElement('div');
            const manaColor = widget.dataset.color === 'blue'
                ? 'linear-gradient(180deg, #4080d4 0%, #2050a4 50%, #103094 100%)'
                : 'linear-gradient(180deg, #40d440 0%, #20a020 50%, #108010 100%)';
            manaBar.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: ${manaPercent}%;
                background: ${manaColor};
                border-right: 1px solid rgba(255,255,255,0.15);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
            `;
            widget.appendChild(manaBar);
            break;
            
        case 'UIExperienceBar':
            const xpPercent = Math.max(0, Math.min(100, parseInt(widget.dataset.percent) || 0));
            widget.style.background = '#0f0f0f';
            widget.style.borderTop = '1px solid #2a2a2a';
            widget.style.borderLeft = '1px solid #2a2a2a';
            widget.style.borderRight = '1px solid #4a4a4a';
            widget.style.borderBottom = '1px solid #4a4a4a';
            widget.style.position = 'relative';
            widget.style.overflow = 'hidden';
            widget.style.height = '12px';
            widget.style.minHeight = '12px';
            
            if (widget.querySelector('.widget-content')) {
                widget.querySelector('.widget-content').style.display = 'none';
            }
            
            const xpBar = document.createElement('div');
            xpBar.style.cssText = `
                position: absolute;
                left: 0;
                top: 0;
                height: 100%;
                width: ${xpPercent}%;
                background: linear-gradient(180deg, #80d440 0%, #50a420 50%, #309410 100%);
                border-right: 1px solid rgba(255,255,255,0.15);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
            `;
            widget.appendChild(xpBar);
            break;
            
        case 'UIItem':
            widget.style.background = '#1a1a1a';
            widget.style.borderTop = '1px solid #4a4a4a';
            widget.style.borderLeft = '1px solid #4a4a4a';
            widget.style.borderRight = '1px solid #0a0a0a';
            widget.style.borderBottom = '1px solid #0a0a0a';
            widget.style.display = 'flex';
            widget.style.alignItems = 'center';
            widget.style.justifyContent = 'center';
            if (!widget.style.width || widget.style.width === 'auto') {
                widget.style.width = '32px';
                widget.style.height = '32px';
                widget.style.minWidth = '32px';
                widget.style.minHeight = '32px';
            }
            widget.style.fontSize = '9px';
            widget.style.color = '#aaa';
            widget.style.boxShadow = 'inset 1px 1px 0 rgba(0,0,0,0.5)';
            break;
            
        case 'UISprite':
            widget.style.background = 'transparent';
            widget.style.border = 'none';
            break;
            
        case 'UIImage':
            widget.style.background = 'transparent';
            widget.style.border = 'none';
            widget.style.backgroundImage = `url(${widget.dataset.source || ''})`;
            widget.style.backgroundSize = 'contain';
            widget.style.backgroundRepeat = 'no-repeat';
            widget.style.backgroundPosition = 'center';
            break;
            
        default:
            widget.style.background = '#1e1e1e';
            widget.style.borderTop = '1px solid #3a3a3a';
            widget.style.borderLeft = '1px solid #3a3a3a';
            widget.style.borderRight = '1px solid #2a2a2a';
            widget.style.borderBottom = '1px solid #2a2a2a';
    }
    
    // Style widget content text
    const contentEl = widget.querySelector('.widget-content');
    if (contentEl && type !== 'UIProgressBar' && type !== 'UIHealthBar' && type !== 'UIManaBar' && type !== 'UIExperienceBar') {
        const alignSetting = widget.dataset.textAlign || widget.dataset.align || 'center';
        const justifyContentValue = alignSetting === 'left' ? 'flex-start' : alignSetting === 'right' ? 'flex-end' : 'center';
        contentEl.style.cssText = `
            padding: ${type === 'UILabel' ? '2px' : '6px 8px'};
            color: ${type === 'UILabel' ? '#d4d4d4' : '#e0e0e0'};
            font-size: ${type === 'UILabel' ? '11px' : '11px'};
            font-family: ${type === 'UITextEdit' ? '"Courier New", monospace' : '"Tahoma", "Arial", sans-serif'};
            text-align: ${alignSetting};
            white-space: ${type === 'UITextEdit' ? 'nowrap' : 'normal'};
            overflow: ${type === 'UITextEdit' ? 'hidden' : 'visible'};
            text-overflow: ${type === 'UITextEdit' ? 'ellipsis' : 'clip'};
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: ${justifyContentValue};
        `;
        if (type === 'UILabel') {
            contentEl.style.textShadow = '1px 1px 1px rgba(0,0,0,0.8)';
        }
    }
}

function showPreview() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    
    updatePreview();
    modal.style.display = 'flex';
    
    // Auto-size preview window to fit content
    setTimeout(() => {
        const previewWindow = document.getElementById('previewWindow');
        const previewContent = previewWindow?.querySelector('#previewContent');
        if (previewContent) {
            // Calculate content bounds from all widgets
            const widgets = previewContent.querySelectorAll('.widget');
            if (widgets.length === 0) {
                previewWindow.style.width = '800px';
                previewWindow.style.height = '600px';
                return;
            }
            
            let maxRight = 0;
            let maxBottom = 0;
            let minLeft = Infinity;
            let minTop = Infinity;
            
            widgets.forEach(w => {
                const left = parseInt(w.style.left) || 0;
                const top = parseInt(w.style.top) || 0;
                const right = left + (w.offsetWidth || 0);
                const bottom = top + (w.offsetHeight || 0);
                
                minLeft = Math.min(minLeft, left);
                minTop = Math.min(minTop, top);
                maxRight = Math.max(maxRight, right);
                maxBottom = Math.max(maxBottom, bottom);
            });
            
            // Add padding around content
            const padding = 40;
            const contentWidth = Math.max(800, maxRight - minLeft + padding * 2);
            const contentHeight = Math.max(600, maxBottom - minTop + padding * 2);
            
            // Set preview window size
            previewWindow.style.width = `${contentWidth}px`;
            previewWindow.style.height = `${contentHeight}px`;
            previewContent.style.width = `${contentWidth}px`;
            previewContent.style.height = `${contentHeight}px`;
            
            // DON'T adjust widget positions - they should be at their exact canvas positions
            // The padding is just for the window size, not for repositioning widgets
            // Widgets should appear exactly where they are in the canvas
        }
    }, 100);
}

