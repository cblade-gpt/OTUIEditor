// OBJS/core.js
let selectedWidget = null;
let dragWidget = null;
let zoomLevel = 1;
let snapToGrid = true;
let showGrid = true;
let clipboardWidget = null;

// Move function definitions to the top for explicit ordering
function startDrag(widget, e) {
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
        
        // Calculate new position (relative to padding box, which is what CSS left/top use)
        let x = startLeft + (currentMouseX - startMouseX);
        let y = startTop + (currentMouseY - startMouseY);
        
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
        
        // Remove hover state
        if (hoveredContainer) {
            hoveredContainer.classList.remove('drag-over');
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
        
        dragWidget = null;
        
        // CRITICAL: Clear preserved anchors/margins when widget is moved
        // This ensures code generation recalculates anchors based on new position
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

function startResize(widget, dir, e) {
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

function createWidget(type) {
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
        displayContent = widget.dataset.text;
    } else if (widget.dataset.title) {
        displayContent = widget.dataset.title;
    } else if (widget.dataset.placeholder) {
        displayContent = widget.dataset.placeholder;
    }
    // Removed default labels: Item, percent, value, Image, Sprite, widget type name

    widget.innerHTML = `
        <div class="widget-content">${displayContent}</div>
        ${['nw','n','ne','w','e','sw','s','se'].map(d => `<div class="resize-handle ${d}"></div>`).join('')}
    `;

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
    // Only delete the exact widget, never delete parent containers
    // Ensure widget is actually in the DOM before removing
    if (widget.parentNode) {
        widget.remove();
        if (selectedWidget === widget) {
            selectWidget(null);
        }
        saveState();
        updateAll();
    }
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