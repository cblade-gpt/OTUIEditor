// OBJS/ui.js
const multiSelectedWidgets = window.__multiSelectedWidgets || new Set();
window.__multiSelectedWidgets = multiSelectedWidgets;

function getSelectedWidgets() {
    return Array.from(multiSelectedWidgets);
}
window.getSelectedWidgets = getSelectedWidgets;

function selectWidget(widget, options = {}) {
    const append = options.append === true;
    
    if (!append) {
        multiSelectedWidgets.forEach(w => w.classList.remove('selected'));
        multiSelectedWidgets.clear();
    }
    
    if (widget) {
        multiSelectedWidgets.add(widget);
        widget.classList.add('selected');
        selectedWidget = widget;
    } else if (!append) {
        selectedWidget = null;
    }

    updatePropertyEditor();
    updateHierarchyTree();
    const selectionCount = multiSelectedWidgets.size;
    const badge = document.getElementById('selectedWidgetBadge');
    if (badge) {
        if (widget) {
            const extra = selectionCount > 1 ? ` (+${selectionCount - 1})` : '';
            badge.textContent = `${widget.dataset.type}${extra}`;
        } else {
            badge.textContent = 'No Selection';
        }
    }
    const ind = document.getElementById('editingIndicator');
    if (ind) ind.style.display = widget ? 'block' : 'none';
    if (widget) {
        document.getElementById('editingWidgetType').textContent = widget.dataset.type.replace('UI', '');
    }
    
    // Show tooltip with widget properties
    if (widget) {
        showWidgetTooltip(widget);
    } else {
        hideWidgetTooltip();
    }
}

function showWidgetTooltip(widget) {
    // Remove existing tooltip
    const existingTooltip = document.getElementById('widgetTooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    if (!widget) return;
    
    // Get widget properties
    const type = widget.dataset.type || 'Unknown';
    const width = widget.offsetWidth || 0;
    const height = widget.offsetHeight || 0;
    const color = widget.dataset.color || widget.style.color || 'default';
    const bgColor = widget.dataset.background || widget.style.backgroundColor || 'default';
    const opacity = widget.dataset.opacity || widget.style.opacity || '1.0';
    const visible = widget.dataset.visible !== 'false' ? 'true' : 'false';
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'widgetTooltip';
    tooltip.className = 'widget-tooltip';
    
    // Build tooltip content
    let tooltipContent = `<strong>${type.replace('UI', '')}</strong><br>`;
    tooltipContent += `Size: ${width} × ${height}px<br>`;
    if (color !== 'default' && color) tooltipContent += `Color: ${color}<br>`;
    if (bgColor !== 'default' && bgColor) tooltipContent += `BG: ${bgColor}<br>`;
    tooltipContent += `Opacity: ${opacity}<br>`;
    tooltipContent += `Visible: ${visible}`;
    
    tooltip.innerHTML = tooltipContent;
    document.body.appendChild(tooltip);
    
    // Position tooltip above widget
    const rect = widget.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    // Position above widget, centered
    tooltip.style.left = `${rect.left + scrollX + (rect.width / 2) - (tooltipRect.width / 2)}px`;
    tooltip.style.top = `${rect.top + scrollY - tooltipRect.height - 10}px`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.style.opacity = '0';
            setTimeout(() => tooltip.remove(), 300);
        }
    }, 3000);
}

function hideWidgetTooltip() {
    const tooltip = document.getElementById('widgetTooltip');
    if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => tooltip.remove(), 300);
    }
}

function updateHierarchyTree() {
    const tree = document.getElementById('hierarchyTree');
    tree.innerHTML = '';
    const roots = document.querySelectorAll('#editorContent > .widget');

    function buildNode(w) {
        const node = document.createElement('div');
        node.className = 'tree-node' + (multiSelectedWidgets.has(w) ? ' selected' : '');
        const input = document.createElement('input');
        input.value = w.id;
        input.onchange = () => { w.id = input.value; updateAll(); };
        node.appendChild(input);
        node.onclick = e => e.target !== input && selectWidget(w);

        const children = [...w.children].filter(c => c.classList.contains('widget'));
        if (children.length) {
            const ul = document.createElement('ul');
            children.forEach(c => {
                const li = document.createElement('li');
                li.appendChild(buildNode(c));
                ul.appendChild(li);
            });
            node.appendChild(ul);
        }
        return node;
    }

    roots.forEach(r => tree.appendChild(buildNode(r)));
    fixFormFields();
}

function updatePropertyEditor() {
    const form = document.getElementById('propertyForm');
    form.innerHTML = '<div class="no-selection-message">Select a widget to edit properties</div>';
    if (!selectedWidget) return;

    const type = selectedWidget.dataset.type;
    const def = OTUI_WIDGETS[type] || {};
    form.innerHTML = '';

    // ID field
    const idDiv = document.createElement('div');
    idDiv.className = 'form-group';
    idDiv.innerHTML = `<label>ID:</label><input type="text" value="${selectedWidget.id}">`;
    form.appendChild(idDiv);
    idDiv.querySelector('input').onchange = e => {
        selectedWidget.id = e.target.value;
        updateAll();
    };

    // Common OTUI styling properties (not positioning - that's handled visually)
    const commonProperties = {
        'width': { type: 'number', default: 0, label: 'Width (px)' },
        'height': { type: 'number', default: 0, label: 'Height (px)' },
        'visible': { type: 'boolean', default: true, label: 'Visible' },
        'enabled': { type: 'boolean', default: true, label: 'Enabled' },
        'focusable': { type: 'boolean', default: false, label: 'Focusable' },
        'opacity': { type: 'number', default: 1.0, label: 'Opacity (0.0-1.0)' },
        'color': { type: 'color', default: '', label: 'Text Color' },
        'background': { type: 'color', default: '', label: 'Background Color' },
        'font': { type: 'text', default: '', label: 'Font (e.g., "12px Tahoma")' }
    };

    // Widget-specific properties
    const widgetProps = def.props || {};

    // Helper function to create property input
    function createPropertyInput(key, propDef, defaultValue) {
        const div = document.createElement('div');
        div.className = 'form-group';
        
        // For width/height, get from actual widget dimensions
        let currentValue;
        if (key === 'width') {
            currentValue = selectedWidget.offsetWidth || selectedWidget.dataset[key] || '';
        } else if (key === 'height') {
            currentValue = selectedWidget.offsetHeight || selectedWidget.dataset[key] || '';
        } else {
            currentValue = selectedWidget.dataset[key];
        }
        const value = currentValue !== undefined && currentValue !== '' ? currentValue : defaultValue;
        const label = propDef.label || key;
        
        let inputHTML = '';
        if (propDef.type === 'boolean') {
            const checked = value === 'true' || value === true || (value === '' && defaultValue === true);
            inputHTML = `<label>${label}:</label><input type="checkbox" ${checked ? 'checked' : ''}>`;
        } else if (propDef.type === 'color') {
            inputHTML = `<label>${label}:</label><input type="color" value="${value || '#000000'}">`;
        } else if (propDef.type === 'number') {
            inputHTML = `<label>${label}:</label><input type="number" step="0.1" value="${value || defaultValue || 0}">`;
        } else if (propDef.type === 'select') {
            const options = propDef.options || [];
            const optionsHTML = options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt || '(none)'}</option>`).join('');
            inputHTML = `<label>${label}:</label><select>${optionsHTML}</select>`;
        } else {
            inputHTML = `<label>${label}:</label><input type="text" value="${value || defaultValue || ''}">`;
        }
        
        div.innerHTML = inputHTML;
        form.appendChild(div);
        
        const input = div.querySelector('input') || div.querySelector('select');
        
        // Real-time update handler (for text inputs, use oninput; for others, use onchange)
        const updateHandler = (e) => {
            let newValue;
            if (propDef.type === 'boolean') {
                newValue = e.target.checked ? 'true' : 'false';
            } else if (propDef.type === 'select') {
                newValue = e.target.value;
            } else {
                newValue = e.target.value;
            }
            
            selectedWidget.dataset[key] = newValue;
            
            // CRITICAL: Clear preserved anchors/margins when widget properties are edited
            // This ensures code generation recalculates anchors based on new values
            if (selectedWidget.dataset._originalAnchors !== undefined) {
                delete selectedWidget.dataset._originalAnchors;
                delete selectedWidget.dataset._originalMargins;
            }
            if (selectedWidget.dataset._originalPropertyList !== undefined) {
                delete selectedWidget.dataset._originalPropertyList;
            }
            
            // Handle special properties
            if (key === 'width') {
                // Apply width directly
                const widthValue = parseInt(newValue, 10);
                if (!isNaN(widthValue) && widthValue > 0) {
                    selectedWidget.style.width = `${widthValue}px`;
                }
            } else if (key === 'height') {
                // Apply height directly
                const heightValue = parseInt(newValue, 10);
                if (!isNaN(heightValue) && heightValue > 0) {
                    selectedWidget.style.height = `${heightValue}px`;
                }
            } else if (key === 'visible') {
                selectedWidget.style.display = (newValue === 'true' || newValue === true) ? '' : 'none';
            } else if (key === 'opacity') {
                selectedWidget.style.opacity = newValue || '1';
            } else if (key === 'color') {
                selectedWidget.style.color = newValue || '';
                const contentEl = selectedWidget.querySelector('.widget-content');
                if (contentEl) contentEl.style.color = newValue || '';
            } else if (key === 'background') {
                selectedWidget.style.backgroundColor = newValue || '';
            } else if (key === 'font') {
                // Parse font string (e.g., "12px Tahoma") and apply
                if (newValue) {
                    selectedWidget.style.font = newValue;
                    const contentEl = selectedWidget.querySelector('.widget-content');
                    if (contentEl) contentEl.style.font = newValue;
                }
            }
            
            if (window.setWidgetDisplayText) {
                window.setWidgetDisplayText(selectedWidget);
            }
            
            // Reapply styles when properties change (especially for image-source, font, etc.)
            if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
                const type = selectedWidget.dataset.type;
                if (type) {
                    // Use requestAnimationFrame to ensure DOM is updated
                    requestAnimationFrame(() => {
                        window.OTUIStyleLoader.applyOTUIStyleToWidget(selectedWidget, type);
                    });
                }
            }
            updateAll();
        };
        
        // Add real-time input handler for text/number inputs (not for checkboxes/selects)
        if (propDef.type === 'text' || propDef.type === 'number' || propDef.type === 'color') {
            input.addEventListener('input', updateHandler);
        } else if (propDef.type === 'select') {
            input.addEventListener('change', updateHandler);
        } else {
            input.addEventListener('change', updateHandler);
        }
    }

    // Add widget-specific properties first
    Object.entries(widgetProps).forEach(([key, val]) => {
        createPropertyInput(key, { type: typeof val === 'boolean' ? 'boolean' : typeof val === 'number' ? 'number' : 'text', default: val }, val);
    });

    // Add separator
    if (Object.keys(widgetProps).length > 0) {
        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: var(--border-primary); margin: 0.5rem 0;';
        form.appendChild(separator);
    }

    // Add common properties section
    const commonHeader = document.createElement('div');
    commonHeader.className = 'form-group';
    commonHeader.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-top: 0.5rem;';
    commonHeader.textContent = 'Common Properties';
    form.appendChild(commonHeader);

    Object.entries(commonProperties).forEach(([key, propDef]) => {
        const currentValue = selectedWidget.dataset[key];
        const defaultValue = propDef.default;
        createPropertyInput(key, propDef, currentValue !== undefined ? currentValue : defaultValue);
    });
}