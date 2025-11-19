// OBJS/core.js
let selectedWidget = null;
let dragWidget = null;
let zoomLevel = 1;
let snapToGrid = true;
let showGrid = true;
let clipboardWidget = null;
let arrowNudgeInterval = null;
let arrowNudgeKey = null;
let arrowNudgeStartTime = 0;
let arrowNudgeMoved = false;

function formatDisplayText(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    const trMatch = str.match(/^tr\s*\(\s*(["'])([\s\S]*?)\1(?:\s*,.*)?\)\s*$/i);
    if (trMatch) {
        return trMatch[2];
    }
    const quotedMatch = str.match(/^["']([\s\S]*?)["']$/);
    if (quotedMatch) {
        return quotedMatch[1];
    }
    return str;
}

function setWidgetDisplayText(widget) {
    if (!widget) return;
    const contentEl = widget.querySelector('.widget-content');
    if (!contentEl) return;
    let displayText = '';
    if (widget.dataset.text && widget.dataset.text.trim() !== '') {
        displayText = formatDisplayText(widget.dataset.text);
    } else if (widget.dataset.title && widget.dataset.title.trim() !== '') {
        displayText = formatDisplayText(widget.dataset.title);
    } else if (widget.dataset.placeholder && widget.dataset.placeholder.trim() !== '') {
        displayText = formatDisplayText(widget.dataset.placeholder);
    } else if (widget.dataset.percent && widget.dataset.percent.trim() !== '') {
        displayText = `${formatDisplayText(widget.dataset.percent)}%`;
    } else if (widget.dataset.value && widget.dataset.value.trim() !== '') {
        displayText = `Value: ${formatDisplayText(widget.dataset.value)}`;
    } else if (widget.dataset.itemId && widget.dataset.itemId.trim() !== '') {
        displayText = `Item ${formatDisplayText(widget.dataset.itemId)}`;
    } else if (widget.dataset.source) {
        displayText = 'Image';
    } else if (widget.dataset.spriteId && widget.dataset.spriteId.trim() !== '') {
        displayText = `Sprite ${formatDisplayText(widget.dataset.spriteId)}`;
    }
    contentEl.textContent = displayText;
}

window.setWidgetDisplayText = setWidgetDisplayText;

function assetsReady(action) {
    if (window.ensureAssetsLoaded) {
        return window.ensureAssetsLoaded(action);
    }
    const stylesReady = !!window._stylesLoaded;
    const imagesReady = !!window._imagesLoaded;
    if (stylesReady && imagesReady) return true;
    const missing = !stylesReady ? 'styles' : 'images';
    if (window.showToast) {
        window.showToast(`Please load OTUI ${missing} before ${action}. Use Settings > Styles.`);
    } else {
        console.warn(`Missing OTUI ${missing}. Cannot proceed with ${action}.`);
    }
    return false;
}

// Move function definitions to the top for explicit ordering
function startDrag(widget, e) {
    if (!assetsReady('dragging widgets')) {
        return;
    }
    e.stopPropagation(); // Prevent parent widgets from receiving the event
    
    dragWidget = widget;
    const originalParent = widget.parentElement;
    const isNested = originalParent && originalParent.id !== 'editorContent';
    
    // Get initial positions relative to parent
    const parentRect = originalParent.getBoundingClientRect();
    
    // Calculate initial offset from parent's top-left
    const startLeft = parseInt(widget.style.left) || 0;
    const startTop = parseInt(widget.style.top) || 0;
    
    // Calculate initial mouse position relative to parent
    const startMouseX = (e.clientX - parentRect.left) / zoomLevel;
    const startMouseY = (e.clientY - parentRect.top) / zoomLevel;
    
    // Track which container we're hovering over
    let hoveredContainer = null;
    const hoverCleanup = () => {
        if (hoveredContainer) {
            hoveredContainer.classList.remove('drag-over');
            hoveredContainer = null;
        }
    };
    
    // Drag threshold (pixels) to prevent accidental movement on click
    const DRAG_THRESHOLD = 3;
    let isDragging = false;

    const move = e => {
        // Find container widget under mouse cursor
        const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
        let newHoveredContainer = null;
        
        // Look for a container widget (but not the widget being dragged or its children)
        for (let el of elementsUnderMouse) {
            if (el === widget || widget.contains(el)) continue;
            if (el.classList.contains('widget') && el.classList.contains('container')) {
                newHoveredContainer = el;
                break;
            }
        }
        
        // Update hover state
        if (hoveredContainer !== newHoveredContainer) {
            if (hoveredContainer) {
                hoveredContainer.classList.remove('drag-over');
            }
            hoveredContainer = newHoveredContainer;
            if (hoveredContainer) {
                hoveredContainer.classList.add('drag-over');
            }
        }
        
        // Get current parent position (in case parent moved)
        const currentParentRect = originalParent.getBoundingClientRect();
        
        // Calculate mouse position relative to original parent's padding box
        const currentMouseX = (e.clientX - currentParentRect.left) / zoomLevel;
        const currentMouseY = (e.clientY - currentParentRect.top) / zoomLevel;
        
        // Calculate deltas
        const deltaX = currentMouseX - startMouseX;
        const deltaY = currentMouseY - startMouseY;
        
        // Only start dragging after threshold
        if (!isDragging) {
            if (Math.abs(deltaX) < DRAG_THRESHOLD && Math.abs(deltaY) < DRAG_THRESHOLD) {
                return;
            }
            isDragging = true;
            widget.classList.add('dragging');
        }
        
        // Calculate new position (relative to padding box, which is what CSS left/top use)
        let x = startLeft + deltaX;
        let y = startTop + deltaY;
        
        // Only constrain bounds if nested inside a container widget
        if (isNested && originalParent.classList.contains('container')) {
            // Get parent padding to calculate content area
            const parentStyle = window.getComputedStyle(originalParent);
            const parentPaddingLeft = parseInt(parentStyle.paddingLeft) || 0;
            const parentPaddingTop = parseInt(parentStyle.paddingTop) || 0;
            const parentPaddingRight = parseInt(parentStyle.paddingRight) || 0;
            const parentPaddingBottom = parseInt(parentStyle.paddingBottom) || 0;
            
            // Content area dimensions (excluding padding)
            const contentWidth = originalParent.offsetWidth - parentPaddingLeft - parentPaddingRight;
            const contentHeight = originalParent.offsetHeight - parentPaddingTop - parentPaddingBottom;
            
            // Max position is content area size minus widget size, plus padding (to get CSS position)
            const maxX = Math.max(0, contentWidth - widget.offsetWidth) + parentPaddingLeft;
            const maxY = Math.max(0, contentHeight - widget.offsetHeight) + parentPaddingTop;
            
            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));
        }
        
        if (snapToGrid) { 
            x = Math.round(x / 1) * 1; 
            y = Math.round(y / 1) * 1; 
        }
        
        widget.style.left = x + 'px';
        widget.style.top = y + 'px';
    };

    const up = (e) => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        
        widget.classList.remove('dragging');
        
        if (!isDragging) {
            hoverCleanup();
            dragWidget = null;
            return;
        }
        
        // Determine target container
        const content = document.getElementById('editorContent');
        let targetParent = content;
        
        if (hoveredContainer && hoveredContainer !== widget && !widget.contains(hoveredContainer)) {
            // Widget was dropped into a container
            targetParent = hoveredContainer;
        } else {
            // Check if mouse is over a container
            const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
            for (let el of elementsUnderMouse) {
                if (el === widget || widget.contains(el)) continue;
                if (el.classList.contains('widget') && el.classList.contains('container')) {
                    targetParent = el;
                    break;
                }
            }
        }
        
        // If widget is being moved to a different parent, update hierarchy
        if (targetParent !== originalParent) {
            // Calculate position relative to new parent
            let newX, newY;
            
            if (targetParent === content) {
                // Moving to root - convert to absolute coordinates
                const widgetRect = widget.getBoundingClientRect();
                const contentRect = content.getBoundingClientRect();
                newX = (widgetRect.left - contentRect.left) / zoomLevel;
                newY = (widgetRect.top - contentRect.top) / zoomLevel;
            } else {
                // Moving into container - convert to relative coordinates
                // getBoundingClientRect() gives position relative to viewport
                // We need position relative to parent's padding box (which is what CSS left/top use)
                const widgetRect = widget.getBoundingClientRect();
                const containerRect = targetParent.getBoundingClientRect();
                
                // Get parent padding to account for content area offset
                const parentStyle = window.getComputedStyle(targetParent);
                const parentPaddingLeft = parseInt(parentStyle.paddingLeft) || 0;
                const parentPaddingTop = parseInt(parentStyle.paddingTop) || 0;
                
                // Calculate position relative to padding box (what CSS left/top use)
                newX = (widgetRect.left - containerRect.left) / zoomLevel;
                newY = (widgetRect.top - containerRect.top) / zoomLevel;
                
                // Constrain within container bounds (accounting for padding)
                const contentWidth = targetParent.offsetWidth - parentPaddingLeft - parseInt(parentStyle.paddingRight || 0);
                const contentHeight = targetParent.offsetHeight - parentPaddingTop - parseInt(parentStyle.paddingBottom || 0);
                const maxX = Math.max(0, contentWidth - widget.offsetWidth);
                const maxY = Math.max(0, contentHeight - widget.offsetHeight);
                newX = Math.max(0, Math.min(newX, maxX + parentPaddingLeft));
                newY = Math.max(0, Math.min(newY, maxY + parentPaddingTop));
            }
            
            if (snapToGrid) {
                newX = Math.round(newX / 1) * 1;
                newY = Math.round(newY / 1) * 1;
            }
            
            // Remove from old parent and add to new parent
            widget.remove();
            targetParent.appendChild(widget);
            widget.style.left = `${newX}px`;
            widget.style.top = `${newY}px`;
        }
        
        hoverCleanup();
        dragWidget = null;
        
        // CRITICAL: Clear preserved anchors/margins when widget is moved
        // This ensures code generation recalculates anchors based on new position
        if (widget.dataset._originalAnchors !== undefined) {
            delete widget.dataset._originalAnchors;
            delete widget.dataset._originalMargins;
        }
        if (widget.dataset._originalPropertyList !== undefined) {
            delete widget.dataset._originalPropertyList;
        }
        if (widget.dataset._originalPropertyList !== undefined) {
            delete widget.dataset._originalPropertyList;
        }
        
        saveState();
        updateAll();
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
}

function startResize(widget, dir, e) {
    if (!assetsReady('resizing widgets')) {
        return;
    }
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = widget.offsetWidth, startH = widget.offsetHeight;
    const startL = parseInt(widget.style.left) || 0;
    const startT = parseInt(widget.style.top) || 0;
    
    // Check if this is a separator with locked dimensions
    const widgetType = widget.dataset.type;
    const isHorizontalSeparator = widgetType === 'UIHorizontalSeparator';
    const isVerticalSeparator = widgetType === 'UIVerticalSeparator';
    const isSeparator = isHorizontalSeparator || isVerticalSeparator;
    
    // Get locked dimensions from style (min/max constraints)
    const lockedHeight = isHorizontalSeparator ? parseInt(widget.style.minHeight) || parseInt(widget.style.height) : null;
    const lockedWidth = isVerticalSeparator ? parseInt(widget.style.minWidth) || parseInt(widget.style.width) : null;

    const move = e => {
        let w = startW, h = startH, l = startL, t = startT;
        
        // For separators, prevent resizing the locked dimension
        if (isSeparator) {
            if (isHorizontalSeparator) {
                // HorizontalSeparator: only allow horizontal resizing (width), lock height
                if (dir.includes('e')) w += (e.clientX - startX) / zoomLevel;
                if (dir.includes('w')) { l += (e.clientX - startX) / zoomLevel; w -= (e.clientX - startX) / zoomLevel; }
                // Ignore vertical resize (s/n) - height is locked
                h = lockedHeight || startH; // Keep locked height
            } else if (isVerticalSeparator) {
                // VerticalSeparator: only allow vertical resizing (height), lock width
                if (dir.includes('s')) h += (e.clientY - startY) / zoomLevel;
                if (dir.includes('n')) { t += (e.clientY - startY) / zoomLevel; h -= (e.clientY - startY) / zoomLevel; }
                // Ignore horizontal resize (e/w) - width is locked
                w = lockedWidth || startW; // Keep locked width
            }
        } else {
            // Regular widgets: allow resizing in all directions
            if (dir.includes('e')) w += (e.clientX - startX) / zoomLevel;
            if (dir.includes('s')) h += (e.clientY - startY) / zoomLevel;
            if (dir.includes('w')) { l += (e.clientX - startX) / zoomLevel; w -= (e.clientX - startX) / zoomLevel; }
            if (dir.includes('n')) { t += (e.clientY - startY) / zoomLevel; h -= (e.clientY - startY) / zoomLevel; }
        }
        
        // Apply minimum sizes (but respect locked dimensions for separators)
        // NO minimum size restrictions for regular widgets - allow free resizing (even 1px)
        if (!isSeparator) {
            w = snapToGrid ? Math.round(w / 20) * 20 : w;
            h = snapToGrid ? Math.round(h / 20) * 20 : h;
        } else {
            // For separators, only enforce minimum on resizable dimension
            if (isHorizontalSeparator) {
                w = Math.max(20, snapToGrid ? Math.round(w / 20) * 20 : w);
            } else if (isVerticalSeparator) {
                h = Math.max(20, snapToGrid ? Math.round(h / 20) * 20 : h);
            }
        }
        
        widget.style.width = w + 'px';
        widget.style.height = h + 'px';
        widget.style.left = l + 'px';
        widget.style.top = t + 'px';
    };

    const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        
        // CRITICAL: Clear preserved anchors/margins when widget is resized
        // This ensures code generation recalculates anchors based on new size/position
        if (widget.dataset._originalAnchors !== undefined) {
            delete widget.dataset._originalAnchors;
            delete widget.dataset._originalMargins;
        }
        
        saveState();
        updateAll();
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
}

function setZoom(level) {
    zoomLevel = Math.max(0.5, Math.min(3, level));
    document.getElementById('editorContent').style.transform = `scale(${zoomLevel})`;
    document.getElementById('zoomLevel').textContent = `${Math.round(zoomLevel * 100)}%`;
}

function isTypingInInput(target) {
    if (!target) return false;
    const editableSelector = 'input, textarea, select, [contenteditable="true"]';
    return target.closest(editableSelector) !== null;
}

function clampPositionToParent(widget, proposedLeft, proposedTop) {
    const parent = widget.parentElement;
    if (!parent || parent.id === 'editorContent' || !parent.classList.contains('container')) {
        return {
            left: Math.max(0, proposedLeft),
            top: Math.max(0, proposedTop)
        };
    }
    
    const parentStyle = window.getComputedStyle(parent);
    const padLeft = parseInt(parentStyle.paddingLeft) || 0;
    const padTop = parseInt(parentStyle.paddingTop) || 0;
    const padRight = parseInt(parentStyle.paddingRight) || 0;
    const padBottom = parseInt(parentStyle.paddingBottom) || 0;
    const contentWidth = parent.offsetWidth - padLeft - padRight;
    const contentHeight = parent.offsetHeight - padTop - padBottom;
    const maxLeft = Math.max(0, contentWidth - widget.offsetWidth) + padLeft;
    const maxTop = Math.max(0, contentHeight - widget.offsetHeight) + padTop;
    const minLeft = padLeft ? padLeft : 0;
    const minTop = padTop ? padTop : 0;
    
    return {
        left: Math.max(minLeft, Math.min(proposedLeft, maxLeft)),
        top: Math.max(minTop, Math.min(proposedTop, maxTop))
    };
}

function createWidget(type) {
    if (!assetsReady('creating widgets')) {
        return null;
    }
    const def = OTUI_WIDGETS[type];
    if (!def) return null;

    const widget = document.createElement('div');
    widget.className = `widget ${type}`;
    if (def.isContainer) widget.classList.add('container');
    widget.dataset.type = type;
    widget.id = generateId(type);
    widget.style.cssText = `width: 140px; height: 90px; left: 100px; top: 100px; position: absolute;`;

    Object.entries(def.props).forEach(([k, v]) => {
        widget.dataset[k] = v;
    });

    // Determine display content based on widget type
    // Only show text if explicitly set by user (text, title, placeholder)
    // Don't show default labels like "FlashWindow", "Image", etc.
    let displayContent = '';
    if (widget.dataset.text) {
        displayContent = formatDisplayText(widget.dataset.text);
    } else if (widget.dataset.title) {
        displayContent = formatDisplayText(widget.dataset.title);
    } else if (widget.dataset.placeholder) {
        displayContent = formatDisplayText(widget.dataset.placeholder);
    }
    // Removed default labels: Item, percent, value, Image, Sprite, widget type name

    widget.innerHTML = `
        <div class="widget-content">${displayContent}</div>
        ${['nw','n','ne','w','e','sw','s','se'].map(d => `<div class="resize-handle ${d}"></div>`).join('')}
    `;
    setWidgetDisplayText(widget);

    widget.onclick = e => { 
        e.stopPropagation(); 
        // Only select if clicking directly on the widget, not on a child widget
        const target = e.target;
        // Check if we clicked on a child widget - if so, don't select parent
        const clickedWidget = target.closest('.widget');
        if (clickedWidget === widget || (target.classList.contains('widget-content') && target.parentElement === widget)) {
            selectWidget(widget); 
        }
    };
    widget.onmousedown = e => {
        if (e.button === 0) {
            const target = e.target;
            
            // CRITICAL FIX: Check if we're clicking on a child widget
            // If the target or any of its parents (up to this widget) is a widget, and it's not this widget, don't drag
            let checkElement = target;
            while (checkElement && checkElement !== widget) {
                if (checkElement.classList && checkElement.classList.contains('widget')) {
                    // We clicked on a child widget - don't drag the parent!
                    return;
                }
                checkElement = checkElement.parentElement;
            }
            
            // Only drag if clicking on widget itself, its content, or resize handles
            // NOT if clicking on child widgets
            if (target === widget || 
                (target.classList.contains('widget-content') && target.parentElement === widget) ||
                target.classList.contains('resize-handle')) {
                e.stopPropagation(); // Prevent parent widgets from starting drag
                startDrag(widget, e);
            }
        }
    };
    widget.querySelectorAll('.resize-handle').forEach(h => {
        h.onmousedown = e => { e.stopPropagation(); startResize(widget, h.className.split(' ')[1], e); };
    });

    // Special handling for windows with titles: position title at top center
    const isWindow = type === 'UIWindow' || type === 'CleanStaticMainWindow';
    if (isWindow && widget.dataset.title) {
        const contentEl = widget.querySelector('.widget-content');
        if (contentEl) {
            contentEl.style.alignItems = 'flex-start';
            contentEl.style.justifyContent = 'center';
            contentEl.style.paddingTop = '8px';
            contentEl.style.textAlign = 'center';
        }
    }
    
    // Apply OTUI styles immediately after widget is fully created
    // This ensures ALL widgets (buttons, labels, panels, windows, etc.) use the correct images and styling from OTUI files
    // This makes the editor visually match the actual client appearance
    if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
        // Apply styles immediately - widgets should look like they do in the client
        // Use requestAnimationFrame to ensure DOM is ready, especially for widgets with image-clip
        requestAnimationFrame(() => {
            const applied = window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, type);
            if (applied) {
                // Styles were applied successfully
                // Update content if needed
                const contentEl = widget.querySelector('.widget-content');
                if (contentEl && widget.dataset.text) {
                    contentEl.textContent = widget.dataset.text;
                }
                // Re-apply window title positioning after styles (in case styles override it)
                if (isWindow && widget.dataset.title) {
                    if (contentEl) {
                        contentEl.style.alignItems = 'flex-start';
                        contentEl.style.justifyContent = 'center';
                        contentEl.style.paddingTop = '8px';
                        contentEl.style.textAlign = 'center';
                    }
                }
                // Force a reflow to ensure styles are applied, especially for clipped widgets
                // This ensures separators, checkboxes, comboboxes get their correct size immediately
                void widget.offsetHeight;
            }
        });
    }

    return widget;
}

function deleteWidget(widget) {
    if (!widget) return;
    if (!widget.parentNode) return;
    
    let multiSelectedWidgets = window.__multiSelectedWidgets;
    if (!multiSelectedWidgets) {
        multiSelectedWidgets = new Set();
        window.__multiSelectedWidgets = multiSelectedWidgets;
    }
    const survivors = Array.from(multiSelectedWidgets).filter(w => w !== widget);
    widget.remove();
    multiSelectedWidgets.clear();
    survivors.forEach(w => multiSelectedWidgets.add(w));
    
    selectWidget(null);
    survivors.forEach((w, index) => {
        selectWidget(w, { append: index > 0 });
    });
    
    saveState();
    updateAll();
}

function copyWidget(widget) {
    if (!widget) return;
    // Serialize widget data
    const parent = widget.parentElement;
    const wasInContainer = parent && parent.id !== 'editorContent' && parent.classList.contains('widget');
    
    const data = {
        type: widget.dataset.type,
        id: widget.id,
        style: {
            left: widget.style.left,
            top: widget.style.top,
            width: widget.style.width,
            height: widget.style.height
        },
        dataset: {},
        wasInContainer: wasInContainer,
        parentWasContainer: wasInContainer && parent.classList.contains('container')
    };
    
    // Copy all dataset attributes
    Object.keys(widget.dataset).forEach(key => {
        data.dataset[key] = widget.dataset[key];
    });
    
    clipboardWidget = data;
    showToast('Widget copied!');
}

function pasteWidget() {
    if (!clipboardWidget) {
        showToast('No widget in clipboard');
        return;
    }
    
    const content = document.getElementById('editorContent');
    if (!content) return;
    
    const widget = createWidget(clipboardWidget.type);
    if (!widget) return;
    
    // Restore properties (ID is already set by createWidget with sequential numbering)
    Object.entries(clipboardWidget.dataset).forEach(([k, v]) => {
        widget.dataset[k] = v;
    });
    
    // Determine parent container
    let parent = content;
    
    // If a container widget is selected, paste into it
    if (selectedWidget && selectedWidget.classList.contains('container')) {
        parent = selectedWidget;
    }
    
    // Calculate position relative to the parent
    let offsetX, offsetY;
    
    if (parent === content) {
        // Pasting to root - use absolute position with offset
        offsetX = parseInt(clipboardWidget.style.left) + 20;
        offsetY = parseInt(clipboardWidget.style.top) + 20;
    } else {
        // Pasting into a container - position relative to container
        // If original was in a container, use its relative position; otherwise start at top-left
        let originalLeft = parseInt(clipboardWidget.style.left) || 0;
        let originalTop = parseInt(clipboardWidget.style.top) || 0;
        
        // If the original widget was at root level, we need to position it within the container
        // Start with a small offset from top-left of container
        if (!clipboardWidget.wasInContainer) {
            offsetX = 20;
            offsetY = 20;
        } else {
            // Original was in a container, use its position with offset
            offsetX = Math.max(0, originalLeft + 20);
            offsetY = Math.max(0, originalTop + 20);
        }
        
        // Ensure widget stays within container bounds
        const widgetWidth = parseInt(clipboardWidget.style.width) || 140;
        const widgetHeight = parseInt(clipboardWidget.style.height) || 90;
        const maxX = Math.max(0, parent.offsetWidth - widgetWidth);
        const maxY = Math.max(0, parent.offsetHeight - widgetHeight);
        offsetX = Math.min(offsetX, maxX);
        offsetY = Math.min(offsetY, maxY);
        
        // Snap to grid if enabled
        if (snapToGrid) {
            offsetX = Math.round(offsetX / 20) * 20;
            offsetY = Math.round(offsetY / 20) * 20;
        }
    }
    
    widget.style.left = `${offsetX}px`;
    widget.style.top = `${offsetY}px`;
    widget.style.width = clipboardWidget.style.width;
    widget.style.height = clipboardWidget.style.height;
    
    // Update display content
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
        }
    }
    
    // Add widget to parent
    parent.appendChild(widget);
    
    // Verify it was added correctly
    if (parent !== content) {
        console.log(`Pasted widget into container: ${parent.id}, widget parent: ${widget.parentElement.id}`);
    }
    
    selectWidget(widget);
    saveState();
    updateAll();
    
    const parentName = parent === content ? 'root' : parent.dataset.type || parent.id;
    showToast(`Widget pasted into ${parentName}!`);
}

function duplicateWidget(widget) {
    if (!widget) return;
    copyWidget(widget);
    pasteWidget();
}

function performArrowNudge(key, isInitialTick) {
    if (!selectedWidget) return;
    const parent = selectedWidget.parentElement;
    if (!parent) return;
    
    const elapsed = Math.max(0, performance.now() - arrowNudgeStartTime);
    const multiplier = Math.pow(2, Math.floor(elapsed / 2000));
    const step = isInitialTick ? 1 : Math.min(32, Math.max(1, multiplier));
    
    let left = parseInt(selectedWidget.style.left) || 0;
    let top = parseInt(selectedWidget.style.top) || 0;
    
    switch (key) {
        case 'ArrowUp':
            top -= step;
            break;
        case 'ArrowDown':
            top += step;
            break;
        case 'ArrowLeft':
            left -= step;
            break;
        case 'ArrowRight':
            left += step;
            break;
        default:
            return;
    }
    
    const clamped = clampPositionToParent(selectedWidget, left, top);
    selectedWidget.style.left = `${clamped.left}px`;
    selectedWidget.style.top = `${clamped.top}px`;
    
    if (selectedWidget.dataset._originalAnchors !== undefined) {
        delete selectedWidget.dataset._originalAnchors;
        delete selectedWidget.dataset._originalMargins;
    }
    if (selectedWidget.dataset._originalPropertyList !== undefined) {
        delete selectedWidget.dataset._originalPropertyList;
    }
    
    arrowNudgeMoved = true;
}

function stopArrowNudge(shouldSave) {
    if (arrowNudgeInterval) {
        clearInterval(arrowNudgeInterval);
        arrowNudgeInterval = null;
    }
    arrowNudgeKey = null;
    if (shouldSave && arrowNudgeMoved) {
        saveState();
        updateAll();
    }
    arrowNudgeStartTime = 0;
    arrowNudgeMoved = false;
}

function getWidgetCenter(widget) {
    const rect = widget.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function directionalScore(dx, dy, direction) {
    let primary = 0;
    switch (direction) {
        case 'right':
            primary = dx;
            break;
        case 'left':
            primary = -dx;
            break;
        case 'down':
            primary = dy;
            break;
        case 'up':
            primary = -dy;
            break;
    }
    if (primary <= 2) {
        return Infinity;
    }
    const secondary = (direction === 'left' || direction === 'right') ? Math.abs(dy) : Math.abs(dx);
    return primary * primary * 1000 + secondary;
}

function findNearestWidgetInDirection(sourceWidget, directionKey) {
    if (!sourceWidget) return null;
    const direction = directionKey.replace('Arrow', '').toLowerCase();
    const widgets = Array.from(document.querySelectorAll('#editorContent .widget'));
    const sourceCenter = getWidgetCenter(sourceWidget);
    let bestWidget = null;
    let bestScore = Infinity;
    
    widgets.forEach(widget => {
        if (widget === sourceWidget) return;
        const c = getWidgetCenter(widget);
        const dx = c.x - sourceCenter.x;
        const dy = c.y - sourceCenter.y;
        const score = directionalScore(dx, dy, direction);
        if (score < bestScore) {
            bestScore = score;
            bestWidget = widget;
        }
    });
    
    return bestWidget;
}

function handleDirectionalSelection(key, append) {
    const target = findNearestWidgetInDirection(selectedWidget, key);
    if (!target) return;
    selectWidget(target, { append });
}

document.addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    
    if (e.ctrlKey) {
        if (!selectedWidget || isTypingInInput(e.target)) return;
        e.preventDefault();
        handleDirectionalSelection(e.key, true);
        return;
    }
    
    if (e.shiftKey) {
        if (!selectedWidget || isTypingInInput(e.target)) return;
        e.preventDefault();
        handleDirectionalSelection(e.key, false);
        return;
    }
    
    if (!selectedWidget || isTypingInInput(e.target)) return;
    
    e.preventDefault();
    
    if (!arrowNudgeInterval) {
        arrowNudgeStartTime = performance.now();
        arrowNudgeInterval = setInterval(() => {
            if (!arrowNudgeKey || !selectedWidget) {
                stopArrowNudge(true);
                return;
            }
            performArrowNudge(arrowNudgeKey, false);
        }, 80);
    }
    
    arrowNudgeKey = e.key;
    performArrowNudge(e.key, true);
});

document.addEventListener('keyup', e => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    stopArrowNudge(true);
});