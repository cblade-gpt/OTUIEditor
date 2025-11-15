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
    palette.innerHTML = '';

    const categories = {};
    Object.keys(OTUI_WIDGETS).forEach(type => {
        const def = OTUI_WIDGETS[type];
        if (!categories[def.category]) {
            categories[def.category] = [];
            const cat = document.createElement('div');
            cat.className = 'widget-category';
            cat.innerHTML = `<div class="widget-category-header">${def.category}</div><div class="widget-list"></div>`;
            cat.querySelector('.widget-category-header').onclick = () => cat.classList.toggle('collapsed');
            palette.appendChild(cat);
        }
        const list = palette.querySelectorAll('.widget-list')[Object.keys(categories).length - 1];
        const item = document.createElement('div');
        item.className = 'widget-item';
        item.textContent = type.replace('UI', '');
        item.draggable = true;
        item.ondragstart = e => e.dataTransfer.setData('text/plain', type);
        list.appendChild(item);
    });
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
    
    console.log('OTUI Builder v3.5.7 — INITIALIZING...');

    populateWidgetPalette();

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

        // Delete key
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedWidget) {
                e.preventDefault();
                deleteWidget(selectedWidget);
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
                    
                    // Reapply styles to all existing widgets
                    applyStylesToAllWidgets();
                    
                    if (status) {
                        status.style.background = '#10b981';
                        status.textContent = `✓ Loaded ${loaded.length} style file(s)! Now load images in Step 2.`;
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
                    
                    // Reapply styles to all widgets (now with images available)
                    applyStylesToAllWidgets();
                    
                    if (status) {
                        status.style.background = '#10b981';
                        status.textContent = `✓ Loaded ${loaded.length} image(s)! Styles and images applied to widgets.`;
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
        
        widgets.forEach(widget => {
            const type = widget.dataset.type;
            if (type && window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
                if (window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, type)) {
                    appliedCount++;
                }
            }
        });
        
        updateAll();
        return appliedCount;
    }
    
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

    saveState();
    updateAll();
    showToast('OTUI Builder v3.5.7 — READY!');
    console.log('OTUI Builder v3.5.7 — READY!');
    console.log('Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo), Del/Backspace (delete), Ctrl+C (copy), Ctrl+V (paste), Ctrl+D (duplicate)');
};
