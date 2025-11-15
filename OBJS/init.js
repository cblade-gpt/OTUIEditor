// OBJS/init.js - Main initialization and event bindings
function getWidgetDepth(widget) {
    let depth = 0;
    let p = widget.parentElement;
    while (p && p !== document.getElementById('editorContent')) {
        if (p.classList?.contains('widget')) depth++;
        p = p.parentElement;
    }
    return depth;
}

function updateAll() {
    const countEl = document.getElementById('widgetCount');
    if (countEl) countEl.textContent = document.querySelectorAll('.widget').length;

    // Update code in modal if it exists (only generate, don't update DOM unless modal is open)
    updateCodeDisplay();

    updatePreview();
    if (typeof updateHierarchyTree === 'function') updateHierarchyTree();
}

function handleDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!OTUI_WIDGETS[type]) return;

    const content = document.getElementById('editorContent');
    if (!content) return;

    let target = e.target;
    let parent = target.closest('.widget.container') || content;
    const parentRect = parent.getBoundingClientRect();

    let x = (e.clientX - parentRect.left) / zoomLevel - 70;
    let y = (e.clientY - parentRect.top) / zoomLevel - 45;
    if (snapToGrid) { x = Math.round(x / 20) * 20; y = Math.round(y / 20) * 20; }

    const widget = createWidget(type);
    if (!widget) return;

    widget.style.left = `${x}px`;
    widget.style.top = `${y}px`;
    parent.appendChild(widget);
    selectWidget(widget);
    saveState();
    updateAll();
}

function populateWidgetPalette() {
    const palette = document.getElementById('widgetPalette');
    if (!palette) return;
    
    // Store original widget data for filtering
    if (!window._allWidgets) {
        window._allWidgets = Object.keys(OTUI_WIDGETS).map(type => ({
            type,
            def: OTUI_WIDGETS[type],
            displayName: type.replace('UI', '')
        }));
    }
    
    // Get search term
    const searchInput = document.getElementById('widgetSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Filter widgets based on search
    const filteredWidgets = searchTerm 
        ? window._allWidgets.filter(w => 
            w.displayName.toLowerCase().includes(searchTerm) || 
            w.type.toLowerCase().includes(searchTerm) ||
            w.def.category.toLowerCase().includes(searchTerm)
          )
        : window._allWidgets;
    
    palette.innerHTML = '';

    const categories = {};
    filteredWidgets.forEach(({type, def, displayName}) => {
        if (!categories[def.category]) {
            categories[def.category] = [];
            const cat = document.createElement('div');
            cat.className = 'widget-category';
            cat.innerHTML = `<div class="widget-category-header">${def.category}</div><div class="widget-list"></div>`;
            cat.querySelector('.widget-category-header').onclick = () => cat.classList.toggle('collapsed');
            palette.appendChild(cat);
        }
        // Find the category's list
        const categoryLists = Array.from(palette.querySelectorAll('.widget-list'));
        const categoryIndex = Object.keys(categories).indexOf(def.category);
        const list = categoryLists[categoryIndex];
        if (list) {
            const item = document.createElement('div');
            item.className = 'widget-item';
            item.textContent = displayName;
            item.draggable = true;
            item.ondragstart = e => e.dataTransfer.setData('text/plain', type);
            list.appendChild(item);
        }
    });
    
    // If no results, show message
    if (filteredWidgets.length === 0 && searchTerm) {
        const noResults = document.createElement('div');
        noResults.style.padding = '1rem';
        noResults.style.textAlign = 'center';
        noResults.style.color = 'var(--text-secondary)';
        noResults.textContent = 'No widgets found';
        palette.appendChild(noResults);
    }
}

// SAFE BINDING FUNCTION
function bind(id, handler) {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
}

window.initOTUIBuilder = function() {
    // Code tab switching functionality
    function setupCodeTabs(container) {
        const tabs = container.querySelectorAll('.code-tab');
        tabs.forEach(tab => {
            tab.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Remove active from all tabs and blocks in this container
                container.querySelectorAll('.code-tab').forEach(t => {
                    t.classList.remove('active');
                });
                container.querySelectorAll('.code-block').forEach(b => {
                    b.classList.remove('active');
                    b.style.display = 'none';
                });
                
                // Add active to clicked tab
                tab.classList.add('active');
                
                // Show corresponding code block
                const tabName = tab.dataset.tab;
                const codeBlock = container.querySelector(`#${tabName}Code`);
                if (codeBlock) {
                    codeBlock.classList.add('active');
                    codeBlock.style.display = 'block';
                    
                    // Re-highlight code when switching tabs
                    setTimeout(() => {
                        if (typeof Prism !== 'undefined') {
                            const codeElement = codeBlock.querySelector('code');
                            if (codeElement) {
                                Prism.highlightElement(codeElement);
                            }
                        }
                    }, 50);
                }
            };
        });
    }
    
    // Setup code tabs for modal
    const codeModal = document.getElementById('codeModal');
    if (codeModal) {
        setupCodeTabs(codeModal);
    }
    
    console.log('OTUI Builder v3.6.0 — INITIALIZING...');

    populateWidgetPalette();
    
    // Widget search functionality
    const widgetSearch = document.getElementById('widgetSearch');
    if (widgetSearch) {
        widgetSearch.addEventListener('input', () => {
            populateWidgetPalette();
        });
    }

    const content = document.getElementById('editorContent');
    if (content) {
        content.addEventListener('dragover', e => e.preventDefault());
        content.addEventListener('drop', handleDrop);
        content.addEventListener('click', () => selectWidget(null));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Allow delete in inputs
                return;
            }
            // Don't trigger shortcuts when typing
            return;
        }

        // Delete key - only delete the exact selected widget, not parent containers
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedWidget) {
                e.preventDefault();
                e.stopPropagation();
                // Ensure we're deleting the exact selected widget, not a parent
                const widgetToDelete = selectedWidget;
                // Verify the widget still exists and is actually selected
                if (widgetToDelete && widgetToDelete.classList.contains('selected')) {
                    deleteWidget(widgetToDelete);
                }
            }
        }
        
        // Copy (Ctrl+C or Cmd+C)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            if (selectedWidget) {
                e.preventDefault();
                copyWidget(selectedWidget);
            }
        }
        
        // Paste (Ctrl+V or Cmd+V)
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault();
            pasteWidget();
        }
        
        // Duplicate (Ctrl+D or Cmd+D)
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            if (selectedWidget) {
                e.preventDefault();
                duplicateWidget(selectedWidget);
            }
        }
        
        // Undo (Ctrl+Z or Cmd+Z)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                restoreState();
            }
        }
        
        // Redo (Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (historyIndex < undoHistory.length - 1) {
                historyIndex++;
                restoreState();
            }
        }
    });

    // SAFE BINDINGS — NO NULL ERRORS
    bind('undoBtn', () => { if (historyIndex > 0) { historyIndex--; restoreState(); } });
    bind('redoBtn', () => { if (historyIndex < undoHistory.length - 1) { historyIndex++; restoreState(); } });
    bind('deleteBtn', () => {
        if (selectedWidget) {
            deleteWidget(selectedWidget);
        } else {
            showToast('No widget selected');
        }
    });
    bind('copyBtn', () => {
        if (selectedWidget) {
            copyWidget(selectedWidget);
        } else {
            showToast('No widget selected');
        }
    });
    bind('pasteBtn', () => pasteWidget());
    bind('duplicateBtn', () => {
        if (selectedWidget) {
            duplicateWidget(selectedWidget);
        } else {
            showToast('No widget selected');
        }
    });
    bind('gridToggleBtn', () => {
        showGrid = !showGrid;
        const grid = document.getElementById('editorGrid');
        if (grid) grid.style.opacity = showGrid ? '0.3' : '0';
    });
    bind('snapToggleBtn', () => snapToGrid = !snapToGrid);
    bind('zoomInBtn', () => setZoom(zoomLevel + 0.1));
    bind('zoomOutBtn', () => setZoom(zoomLevel - 0.1));
    bind('zoomResetBtn', () => setZoom(1));
    bind('previewBtn', () => showPreview());
    bind('viewCodeBtn', () => showCodeModal());
    bind('newBtn', () => {
        if (confirm('Clear all widgets and start fresh?')) {
            const content = document.getElementById('editorContent');
            if (content) {
                content.innerHTML = '';
                selectWidget(null);
                saveState();
                updateAll();
                showToast('Canvas cleared!');
            }
        }
    });
    bind('exportBtn', () => {
        const modal = document.getElementById('moduleCreatorModal');
        if (modal) modal.style.display = 'flex';
    });
    bind('exportAllBtn', () => {
        const zip = new JSZip();
        const name = document.getElementById('moduleName')?.value || 'main';
        
        // Generate all files
        const otuiCode = generateOTUICode();
        const luaCode = generateLuaCode();
        const otmodCode = generateOTMODCode();
        
        // Debug: Log generated code
        console.log('=== EXPORTING MODULE ===');
        console.log('Module name:', name);
        console.log('OTUI Code:\n', otuiCode);
        console.log('Lua Code:\n', luaCode);
        console.log('OTMOD Code:\n', otmodCode);
        
        // Create a folder with the module name
        const folder = zip.folder(name);
        
        // Add files to the folder
        folder.file(`${name}.otui`, otuiCode);
        folder.file(`${name}.lua`, luaCode);
        folder.file(`${name}.otmod`, otmodCode);
        
        zip.generateAsync({type:'blob'}).then(blob => {
            saveAs(blob, `${name}.zip`);
            const modal = document.getElementById('moduleCreatorModal');
            if (modal) modal.style.display = 'none';
            showToast('Module exported successfully! Check browser console for debug info.');
        });
    });
    
    // Settings button
    bind('settingsBtn', () => {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            const input = document.getElementById('clientDataPathInput');
            if (input && window.OTUIStyleLoader) {
                const currentPath = window.OTUIStyleLoader.getClientDataPath();
                if (currentPath) {
                    input.value = currentPath;
                } else {
                    input.value = 'D:\\Work Data\\dipSet\\OTAOTCV8Dev\\data';
                }
            }
            modal.style.display = 'flex';
        }
    });
    
    // File input for loading .otui files
    const otuiFilesInput = document.getElementById('otuiFilesInput');
    if (otuiFilesInput) {
        otuiFilesInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            const status = document.getElementById('settingsStatus');
            if (status) {
                status.style.display = 'block';
                status.style.background = '#3b82f6';
                status.style.color = 'white';
                status.textContent = `Loading ${files.length} style file(s)...`;
            }
            
            if (window.OTUIStyleLoader && window.OTUIStyleLoader.loadOTUIFilesFromFiles) {
                try {
                    const loaded = await window.OTUIStyleLoader.loadOTUIFilesFromFiles(files);
                    
                    // Resolve inheritance after loading
                    if (window.OTUIStyleLoader.resolveInheritance) {
                        window.OTUIStyleLoader.resolveInheritance();
                    }
                    
                    // Discover new widgets from loaded styles and add to palette
                    discoverWidgetsFromStyles();
                    
                    // Reapply styles to all existing widgets
                    const appliedCount = applyStylesToAllWidgets();
                    
                    if (status) {
                        if (appliedCount > 0) {
                            status.style.background = '#10b981';
                            status.textContent = `✓ Loaded ${loaded.length} style file(s)! Styles applied to ${appliedCount} widget(s). Now load images in Step 2.`;
                        } else {
                            status.style.background = '#10b981';
                            status.textContent = `✓ Loaded ${loaded.length} style file(s)! Now load images in Step 2, then create widgets.`;
                        }
                    }
                } catch (error) {
                    if (status) {
                        status.style.background = '#ef4444';
                        status.textContent = `Error: ${error.message}`;
                    }
                    console.error('Error loading files:', error);
                }
            }
        };
    }
    
    // File input for loading images
    const imagesFilesInput = document.getElementById('imagesFilesInput');
    if (imagesFilesInput) {
        imagesFilesInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            
            const status = document.getElementById('settingsStatus');
            if (status) {
                status.style.display = 'block';
                status.style.background = '#3b82f6';
                status.style.color = 'white';
                status.textContent = `Loading ${files.length} image(s)...`;
            }
            
            if (window.OTUIStyleLoader && window.OTUIStyleLoader.loadImageFiles) {
                try {
                    const loaded = await window.OTUIStyleLoader.loadImageFiles(files);
                    
                    console.log(`Image cache now has ${Object.keys(window.OTUIStyleLoader.imageCache()).length} images`);
                    
                    // Reapply styles to all widgets (now with images available)
                    const appliedCount = applyStylesToAllWidgets();
                    
                    if (status) {
                        if (appliedCount > 0) {
                            status.style.background = '#10b981';
                            status.textContent = `✓ Loaded ${loaded.length} image(s)! Styles and images applied to ${appliedCount} widget(s).`;
                        } else {
                            status.style.background = '#f59e0b';
                            status.textContent = `✓ Loaded ${loaded.length} image(s)! Create widgets to see styled UI.`;
                        }
                    }
                } catch (error) {
                    if (status) {
                        status.style.background = '#ef4444';
                        status.textContent = `Error: ${error.message}`;
                    }
                    console.error('Error loading images:', error);
                }
            }
        };
    }
    
    // Helper function to apply styles to all widgets
    function applyStylesToAllWidgets() {
        const widgets = document.querySelectorAll('.widget');
        let appliedCount = 0;
        
        console.log(`Applying styles to ${widgets.length} widget(s)...`);
        
        widgets.forEach(widget => {
            const type = widget.dataset.type;
            if (type && window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
                if (window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, type)) {
                    appliedCount++;
                } else {
                    console.warn(`Failed to apply styles to ${type}`);
                }
            }
        });
        
        console.log(`✓ Applied styles to ${appliedCount}/${widgets.length} widget(s)`);
        updateAll();
        return appliedCount;
    }
    
    // Discover widgets from loaded OTUI styles and add them to the palette
    function discoverWidgetsFromStyles() {
        if (!window.OTUIStyleLoader || !window.OTUIStyleLoader.loadedStyles) return;
        
        const styles = window.OTUIStyleLoader.loadedStyles();
        const styleNames = Object.keys(styles);
        const palette = document.getElementById('widgetPalette');
        if (!palette) return;
        
        // Map of style names to widget types (OTUI style -> UIWidget format)
        const styleToWidgetMap = {
            'Window': 'UIWindow',
            'Label': 'UILabel',
            'Panel': 'UIPanel',
            'ScrollablePanel': 'UIScrollArea',
            'VerticalScrollBar': 'UIScrollBar',
            'HorizontalScrollBar': 'UIScrollBar',
            'MiniWindow': 'UIMiniWindow',
            'Button': 'UIButton',
            'TextEdit': 'UITextEdit',
            'CheckBox': 'UICheckBox',
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
            'GridLayout': 'UIGridLayout',
            'CleanStaticMainWindow': 'CleanStaticMainWindow'
        };
        
        let addedCount = 0;
        styleNames.forEach(styleName => {
            if (!styleName || typeof styleName !== 'string') return;
            
            // Check if this style corresponds to a widget type - safe lookup
            const widgetType = (styleToWidgetMap && styleToWidgetMap[styleName]) 
                ? styleToWidgetMap[styleName] 
                : (styleName.startsWith('UI') ? styleName : `UI${styleName}`);
            
            // Only add if not already in OTUI_WIDGETS and widgetType is valid
            if (!OTUI_WIDGETS[widgetType] && widgetType && styleName) {
                // Try to infer category and properties from style - safe lookup
                const style = styles && styles[styleName] ? styles[styleName] : null;
                if (!style) return;
                const isContainer = styleName.includes('Panel') || styleName.includes('Window') || 
                                   styleName.includes('Area') || styleName.includes('Layout') ||
                                   styleName.includes('TabBar') || styleName.includes('MainWindow');
                
                // Determine category
                let category = "Display";
                if (isContainer) {
                    category = "Layout";
                } else if (styleName.includes('Button') || styleName.includes('CheckBox') || styleName.includes('TextEdit')) {
                    category = "Controls";
                } else if (styleName.includes('Item') || styleName.includes('Health') || styleName.includes('Mana')) {
                    category = "Game UI";
                }
                
                // Add to OTUI_WIDGETS dynamically
                OTUI_WIDGETS[widgetType] = {
                    category: category,
                    isContainer: isContainer,
                    props: {},
                    events: {}
                };
                
                addedCount++;
            }
        });
        
        if (addedCount > 0) {
            console.log(`Discovered ${addedCount} new widget(s) from styles, updating palette...`);
            // Clear cached widgets so search includes new ones
            window._allWidgets = null;
            populateWidgetPalette();
        }
    }
    
    // Enable debug mode for styles (set window.DEBUG_STYLES = true in console to see detailed logs)
    window.DEBUG_STYLES = false;
    
    // Save settings button (for folder path method)
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.onclick = async () => {
            const input = document.getElementById('clientDataPathInput');
            const status = document.getElementById('settingsStatus');
            if (!input || !status) return;
            
            const path = input.value.trim();
            if (!path) {
                status.style.display = 'block';
                status.style.background = '#ef4444';
                status.style.color = 'white';
                status.textContent = 'Please enter a valid path';
                return;
            }
            
            if (window.OTUIStyleLoader) {
                try {
                    window.OTUIStyleLoader.setClientDataPath(path);
                    status.style.display = 'block';
                    status.style.background = '#10b981';
                    status.style.color = 'white';
                    status.textContent = 'Loading styles...';
                    
                    await window.OTUIStyleLoader.loadAllStyles();
                    
                    status.style.background = '#10b981';
                    status.textContent = 'Styles loaded successfully! Reloading widgets...';
                    
                    // Reapply styles to all existing widgets immediately
                    const widgets = document.querySelectorAll('.widget');
                    let appliedCount = 0;
                    console.log(`Attempting to apply styles to ${widgets.length} widget(s)...`);
                    
                    widgets.forEach(widget => {
                        const type = widget.dataset.type;
                        if (type) {
                            console.log(`Applying styles to widget: ${type}`);
                            if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
                                if (window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, type)) {
                                    appliedCount++;
                                    console.log(`✓ Successfully applied styles to ${type}`);
                                } else {
                                    console.warn(`✗ Failed to apply styles to ${type}`);
                                }
                            }
                        }
                    });
                    
                    updateAll();
                    if (appliedCount > 0) {
                        status.textContent = `Styles applied to ${appliedCount} widget(s)! Widgets now match client appearance.`;
                    } else {
                        status.style.background = '#f59e0b';
                        status.textContent = `No styles applied. Try using the file input above to select .otui files directly.`;
                    }
                } catch (error) {
                    status.style.background = '#ef4444';
                    status.textContent = `Error: ${error.message}`;
                    console.error('Error loading styles:', error);
                }
            }
        };
    }
    
    // Load saved path on startup
    if (window.OTUIStyleLoader) {
        const savedPath = window.OTUIStyleLoader.getClientDataPath();
        if (savedPath) {
            console.log('Loading styles from:', savedPath);
            window.OTUIStyleLoader.loadAllStyles().then(() => {
                console.log('Styles loaded on startup');
            });
        }
    }

    // Close modals
    document.querySelectorAll('.modal').forEach(modal => {
        modal.onclick = e => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    });
    
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.onclick = e => {
            const modal = closeBtn.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        };
    });

    // Click on canvas to deselect widgets
    const editorContent = document.getElementById('editorContent');
    if (editorContent) {
        editorContent.addEventListener('click', (e) => {
            // Only deselect if clicking directly on the canvas (not on a widget)
            if (e.target === editorContent || e.target.id === 'editorContent') {
                if (typeof selectWidget === 'function') {
                    selectWidget(null);
                }
                if (typeof hideWidgetTooltip === 'function') {
                    hideWidgetTooltip();
                }
            }
        });
    }
    
    saveState();
    updateAll();
    showToast('OTUI Builder v3.6.0 — READY!');
    console.log('OTUI Builder v3.6.0 — READY!');
    console.log('Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo), Del/Backspace (delete), Ctrl+C (copy), Ctrl+V (paste), Ctrl+D (duplicate)');
};
