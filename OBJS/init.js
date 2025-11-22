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
    // updateCodeDisplay is now async, but we don't need to wait for it
    updateCodeDisplay().catch(err => {
        console.error('Error updating code display:', err);
    });

    updatePreview();
    if (typeof updateHierarchyTree === 'function') updateHierarchyTree();
}

function notifyAssetsMissing(action, missing) {
    const message = `Please load OTUI ${missing} (Settings > Styles & Images) before ${action}.`;
    if (typeof showToast === 'function') {
        showToast(message);
    } else if (window?.alert) {
        alert(message);
    } else {
        console.warn(message);
    }
}

function ensureAssetsLoaded(action = 'using the editor', requireImages = true) {
    if (!window._stylesLoaded) {
        notifyAssetsMissing(action, 'styles');
        return false;
    }
    if (requireImages && !window._imagesLoaded) {
        notifyAssetsMissing(action, 'images');
        return false;
    }
    return true;
}

window.ensureAssetsLoaded = ensureAssetsLoaded;

function handleDrop(e) {
    e.preventDefault();
    if (!ensureAssetsLoaded('adding widgets')) {
        return;
    }
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
    // Filter out import-only widgets (custom widgets with inheritance)
    if (!window._allWidgets) {
        window._allWidgets = Object.keys(OTUI_WIDGETS)
            .filter(type => !OTUI_WIDGETS[type].importOnly) // Exclude import-only widgets
            .map(type => ({
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
    
    console.log('OTUI Builder 0.1.1 Beta — INITIALIZING...');

    populateWidgetPalette();
    
    // Widget search functionality
    const widgetSearch = document.getElementById('widgetSearch');
    if (widgetSearch) {
        widgetSearch.addEventListener('input', () => {
            populateWidgetPalette();
        });
    }

    const content = document.getElementById('editorContent');
    const workspace = document.querySelector('.workspace');
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    
    // Allow drops on the entire workspace area (not just editorContent)
    // This fixes the issue where widgets can't be dropped below the toolbar (red line)
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function handleDropAnywhere(e) {
        // Only handle if it's a widget drop
        const type = e.dataTransfer.getData('text/plain');
        if (!type || !OTUI_WIDGETS[type]) {
            return; // Not a widget drop, let other handlers deal with it
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Calculate drop position relative to editorContent
        const content = document.getElementById('editorContent');
        if (!content) return;
        
        const contentRect = content.getBoundingClientRect();
        
        // Get mouse position relative to editorContent (accounting for zoom)
        let x = (e.clientX - contentRect.left) / zoomLevel;
        let y = (e.clientY - contentRect.top) / zoomLevel;
        
        // Ensure position is within content bounds (accounting for padding)
        const padding = 32; // 2rem = 32px
        x = Math.max(padding, x - 70);
        y = Math.max(padding, y - 45);
        
        if (snapToGrid) { 
            x = Math.round(x / 20) * 20; 
            y = Math.round(y / 20) * 20; 
        }
        
        // Check if dropping into a container widget
        const elementsUnderMouse = document.elementsFromPoint(e.clientX, e.clientY);
        let targetParent = content;
        
        for (let el of elementsUnderMouse) {
            if (el.classList && el.classList.contains('widget') && el.classList.contains('container')) {
                if (el.id !== 'editorContent') {
                    targetParent = el;
                    const parentRect = el.getBoundingClientRect();
                    x = (e.clientX - parentRect.left) / zoomLevel;
                    y = (e.clientY - parentRect.top) / zoomLevel;
                    break;
                }
            }
        }
        
        const widget = createWidget(type);
        if (!widget) return;
        
        // CRITICAL: After widget is created, apply OTUI styles to get correct size
        // This ensures dragged widgets match their property sizes from OTUI files
        if (window.OTUIStyleLoader && window.OTUIStyleLoader.applyOTUIStyleToWidget) {
            const widgetType = widget.dataset.type;
            if (widgetType) {
                // Apply styles immediately to get correct size
                window.OTUIStyleLoader.applyOTUIStyleToWidget(widget, widgetType);
                // Force a reflow to ensure size is applied
                void widget.offsetHeight;
            }
        }
        
        widget.style.left = `${x}px`;
        widget.style.top = `${y}px`;
        targetParent.appendChild(widget);
        selectWidget(widget);
        saveState();
        updateAll();
    }
    
    if (content) {
        content.addEventListener('dragover', handleDragOver);
        content.addEventListener('drop', handleDropAnywhere);
        content.addEventListener('click', () => selectWidget(null));
    }
    
    // Also allow drops on workspace toolbar and canvas wrapper
    if (workspace) {
        workspace.addEventListener('dragover', handleDragOver);
        workspace.addEventListener('drop', handleDropAnywhere);
    }
    
    if (canvasWrapper) {
        canvasWrapper.addEventListener('dragover', handleDragOver);
        canvasWrapper.addEventListener('drop', handleDropAnywhere);
    }
    
    // Keep the old handleDrop for backwards compatibility
    window.handleDrop = handleDropAnywhere;

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
    
    // AI Generator Integration
    const aiGenerator = window.OTUIAIGenerator;
    
    // Open AI Generate modal (works even if AI generator isn't loaded)
    const openAIModal = () => {
        console.log('Opening AI Generate modal...');
        const modal = document.getElementById('aiGenerateModal');
        if (modal) {
            console.log('Modal found, displaying...');
            modal.style.display = 'flex';
            const descriptionInput = document.getElementById('aiDescriptionInput');
            if (descriptionInput) descriptionInput.focus();
        } else {
            console.error('AI Generate modal not found');
            showToast('AI Generate modal not found. Please refresh the page.');
        }
    };
    
    // Bind AI Generate buttons (always bind, even if generator not loaded)
    console.log('Binding AI Generate buttons...');
    const aiBtn1 = document.getElementById('aiGenerateBtn');
    const aiBtn2 = document.getElementById('aiGenerateBtnSidebar');
    console.log('aiGenerateBtn found:', !!aiBtn1);
    console.log('aiGenerateBtnSidebar found:', !!aiBtn2);
    
    // Use bind function
    bind('aiGenerateBtn', () => {
        console.log('AI Generate button clicked (header)');
        openAIModal();
    });
    bind('aiGenerateBtnSidebar', () => {
        console.log('AI Generate button clicked (sidebar)');
        openAIModal();
    });
    
    // Also add direct event listeners as fallback
    if (aiBtn1) {
        aiBtn1.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('AI Generate button clicked (header - direct listener)');
            openAIModal();
        });
    }
    if (aiBtn2) {
        aiBtn2.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('AI Generate button clicked (sidebar - direct listener)');
            openAIModal();
        });
    }
    
    if (aiGenerator) {
        aiGenerator.loadConfig();
        
        // Load AI settings into UI
        const aiProviderSelect = document.getElementById('aiProviderSelect');
        const aiApiKeyInput = document.getElementById('aiApiKeyInput');
        const aiModelInput = document.getElementById('aiModelInput');
        const aiEndpointInput = document.getElementById('aiEndpointInput');
        const aiEndpointGroup = document.getElementById('aiEndpointGroup');
        
        if (aiProviderSelect) {
            aiProviderSelect.value = aiGenerator.apiProvider;
            aiProviderSelect.addEventListener('change', (e) => {
                const provider = e.target.value;
                if (provider === 'ollama' || provider === 'local') {
                    if (aiEndpointGroup) aiEndpointGroup.style.display = 'block';
                } else {
                    if (aiEndpointGroup) aiEndpointGroup.style.display = 'none';
                }
                
                // Update model suggestions based on provider
                const modelInput = document.getElementById('aiModelInput');
                if (modelInput) {
                    const suggestions = {
                        'groq': 'llama-3.1-8b-instant',
                        'gemini': 'gemini-pro',
                        'huggingface': 'mistralai/Mistral-7B-Instruct-v0.2',
                        'openrouter': 'google/gemini-flash-1.5',
                        'openai': 'gpt-4o-mini',
                        'anthropic': 'claude-3-haiku-20240307',
                        'ollama': 'llama2'
                    };
                    if (suggestions[provider] && !modelInput.value) {
                        modelInput.placeholder = `Suggested: ${suggestions[provider]}`;
                    }
                }
            });
            // Trigger initial state
            if (aiGenerator.apiProvider === 'ollama' || aiGenerator.apiProvider === 'local') {
                if (aiEndpointGroup) aiEndpointGroup.style.display = 'block';
            }
        }
        
        if (aiApiKeyInput) aiApiKeyInput.value = aiGenerator.apiKey;
        if (aiModelInput) aiModelInput.value = aiGenerator.model;
        if (aiEndpointInput) aiEndpointInput.value = aiGenerator.apiEndpoint;
        
        // Save AI settings
        bind('saveAISettingsBtn', () => {
            if (aiProviderSelect) aiGenerator.apiProvider = aiProviderSelect.value;
            if (aiApiKeyInput) aiGenerator.apiKey = aiApiKeyInput.value;
            if (aiModelInput) aiGenerator.model = aiModelInput.value;
            if (aiEndpointInput) aiGenerator.apiEndpoint = aiEndpointInput.value;
            aiGenerator.saveConfig();
            showToast('AI settings saved!');
        });
        
        // AI Generate button in modal
        bind('aiGenerateBtnModal', async () => {
            const descriptionInput = document.getElementById('aiDescriptionInput');
            const progressDiv = document.getElementById('aiProgress');
            const codeDiv = document.getElementById('aiGeneratedCode');
            const codePreview = document.getElementById('aiCodePreview');
            
            if (!descriptionInput) return;
            
            const description = descriptionInput.value.trim();
            if (!description) {
                showToast('Please enter a description');
                return;
            }
            
            // Show progress
            if (progressDiv) {
                progressDiv.style.display = 'block';
                progressDiv.textContent = 'Initializing...';
            }
            if (codeDiv) codeDiv.style.display = 'none';
            
            try {
                const generatedCode = await aiGenerator.generateCode(description, (status) => {
                    if (progressDiv) progressDiv.textContent = status;
                });
                
                if (generatedCode) {
                    if (codePreview) codePreview.textContent = generatedCode;
                    if (codeDiv) codeDiv.style.display = 'block';
                    if (progressDiv) progressDiv.style.display = 'none';
                    window._lastGeneratedCode = generatedCode; // Store for apply
                } else {
                    throw new Error('No code generated');
                }
            } catch (error) {
                console.error('AI generation error:', error);
                if (progressDiv) {
                    progressDiv.style.display = 'block';
                    progressDiv.textContent = `Error: ${error.message}`;
                    progressDiv.style.background = '#ef4444';
                    progressDiv.style.color = 'white';
                }
                showToast(`AI Generation failed: ${error.message}`);
            }
        });
        
        // Apply generated code to canvas
        bind('aiApplyCodeBtn', async () => {
            if (!ensureAssetsLoaded('applying generated code')) {
                return;
            }
            const code = window._lastGeneratedCode;
            if (!code) {
                showToast('No code to apply');
                return;
            }
            
            // Parse and create widgets from OTUI code
            try {
                // Clear canvas first
                const content = document.getElementById('editorContent');
                if (!content) {
                    showToast('Editor content not found');
                    return;
                }
                
                if (!confirm('This will clear the canvas and apply the generated code. Continue?')) {
                    return;
                }
                
                content.innerHTML = '';
                selectWidget(null);
                
                // Parse OTUI code - use API if available, otherwise local
                if (!window.parseOTUICode && !window.APIClient) {
                    console.error('OTUI parser not loaded');
                    showToast('OTUI parser not loaded. Please refresh the page.');
                    return;
                }
                
                console.log('Parsing OTUI code...');
                let parsedResult;
                // parseOTUICode now always uses API (returns a promise)
                if (window.APIClient && window.APIClient.parseOTUICode) {
                    try {
                        parsedResult = await window.APIClient.parseOTUICode(code);
                    } catch (error) {
                        console.error('API parse failed:', error);
                        showToast(`Failed to parse OTUI code: ${error.message}`);
                        return;
                    }
                } else if (window.parseOTUICode) {
                    // Fallback to local function if available (should not happen in secure build)
                    try {
                        parsedResult = await window.parseOTUICode(code);
                    } catch (error) {
                        console.error('Parse failed:', error);
                        showToast(`Failed to parse OTUI code: ${error.message}`);
                        return;
                    }
                } else {
                    showToast('OTUI parser not available. API server required.');
                    return;
                }
                const parsedWidgets = Array.isArray(parsedResult) ? parsedResult : (parsedResult.widgets || []);
                const importedTemplates = parsedResult.templates || (Array.isArray(parsedResult) ? [] : []);
                const templateMap = parsedResult.templateMap || {};
                if (typeof window !== 'undefined') {
                    window._importedTemplates = importedTemplates;
                    window._otuiTemplateMap = templateMap;
                }
                console.log('Parsed widgets:', parsedWidgets);
                
                if (parsedWidgets.length === 0) {
                    showToast('No widgets found in code. Check the code format.');
                    return;
                }
                
                // Create widgets on canvas
                console.log('Creating widgets on canvas...');
                const createdWidgets = window.createWidgetsFromOTUI(parsedWidgets, content, 50, 50);
                console.log('Created widgets:', createdWidgets.length);
                
                if (createdWidgets.length > 0) {
                    // Select first widget
                    selectWidget(createdWidgets[0]);
                    
                    // Refresh widget palette to exclude any import-only widgets
                    window._allWidgets = null;
                    populateWidgetPalette();
                    
                    // Save state
                    saveState();
                    updateAll();
                    
                    // Auto-save progress if cookies enabled
                    if (window.OTUIStorage && window.OTUIStorage.hasCookieConsent()) {
                        window.OTUIStorage.autoSaveProgress();
                    }
                    
                    // Close AI modal
                    const aiModal = document.getElementById('aiGenerateModal');
                    if (aiModal) aiModal.style.display = 'none';
                    
                    showToast(`Successfully created ${createdWidgets.length} widget(s) on canvas!`);
                } else {
                    showToast('Failed to create widgets. Check console for errors.');
                }
            } catch (error) {
                console.error('Error applying code:', error);
                showToast('Error applying code: ' + error.message);
            }
        });
        
        // Copy generated code
        bind('aiCopyCodeBtn', () => {
            const code = window._lastGeneratedCode;
            if (!code) {
                showToast('No code to copy');
                return;
            }
            
            navigator.clipboard.writeText(code).then(() => {
                showToast('Code copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy:', err);
                showToast('Failed to copy code');
            });
        });
        
        // Regenerate
        bind('aiRegenerateBtn', () => {
            const generateBtn = document.getElementById('aiGenerateBtnModal');
            if (generateBtn) generateBtn.click();
        });
        
        // Cancel
        bind('aiCancelBtn', () => {
            const modal = document.getElementById('aiGenerateModal');
            if (modal) modal.style.display = 'none';
            const descriptionInput = document.getElementById('aiDescriptionInput');
            if (descriptionInput) descriptionInput.value = '';
            const codeDiv = document.getElementById('aiGeneratedCode');
            if (codeDiv) codeDiv.style.display = 'none';
            const progressDiv = document.getElementById('aiProgress');
            if (progressDiv) {
                progressDiv.style.display = 'none';
                progressDiv.style.background = '';
                progressDiv.style.color = '';
            }
        });
    } else {
        // AI Generator not loaded - show error when trying to generate
        bind('aiGenerateBtnModal', () => {
            showToast('AI Generator not loaded. Please refresh the page.');
            console.error('OTUIAIGenerator not found. Make sure OBJS/ai-generator.js is loaded.');
        });
        
        bind('aiCancelBtn', () => {
            const modal = document.getElementById('aiGenerateModal');
            if (modal) modal.style.display = 'none';
        });
    }
    bind('exportAllBtn', async () => {
        const zip = new JSZip();
        const name = document.getElementById('moduleName')?.value || 'main';
        
        // Generate all files - use API if available, otherwise local
        let otuiCode;
        // generateOTUICode now always uses API (returns a promise)
        if (window.APIClient && window.APIClient.generateOTUICode) {
            try {
                otuiCode = await window.APIClient.generateOTUICode();
            } catch (error) {
                console.error('API generate failed:', error);
                showToast(`Failed to generate OTUI code: ${error.message}`);
                return;
            }
        } else if (typeof generateOTUICode === 'function') {
            // Fallback to local function if available (should not happen in secure build)
            try {
                otuiCode = await generateOTUICode();
            } catch (error) {
                console.error('Generate failed:', error);
                showToast(`Failed to generate OTUI code: ${error.message}`);
                return;
            }
        } else {
            showToast('OTUI code generator not available. API server required.');
            return;
        }
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
    
    // Import OTUI file handler
    const importOTUIFileInput = document.getElementById('importOTUIFileInput');
    if (importOTUIFileInput) {
        importOTUIFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !file.name.endsWith('.otui')) {
                showToast('Please select a valid .otui file');
                return;
            }
            
            if (!ensureAssetsLoaded('importing OTUI files')) {
                return;
            }
            
            try {
                showToast('Loading OTUI file...');
                const text = await file.text();
                
                // Parse and create widgets - use API if available, otherwise local
                if (!window.parseOTUICode && !window.APIClient) {
                    showToast('OTUI parser not loaded. Please refresh the page.');
                    return;
                }
                
                console.log('Parsing imported OTUI file:', file.name);
                let parsedResult;
                // parseOTUICode now always uses API (returns a promise)
                if (window.APIClient && window.APIClient.parseOTUICode) {
                    try {
                        parsedResult = await window.APIClient.parseOTUICode(text);
                    } catch (error) {
                        console.error('API parse failed:', error);
                        showToast(`Failed to parse OTUI file: ${error.message}`);
                        return;
                    }
                } else if (window.parseOTUICode) {
                    // Fallback to local function if available (should not happen in secure build)
                    try {
                        parsedResult = await window.parseOTUICode(text);
                    } catch (error) {
                        console.error('Parse failed:', error);
                        showToast(`Failed to parse OTUI file: ${error.message}`);
                        return;
                    }
                } else {
                    showToast('OTUI parser not available. API server required.');
                    return;
                }
                const parsedWidgets = Array.isArray(parsedResult) ? parsedResult : (parsedResult.widgets || []);
                const importedTemplates = parsedResult.templates || (Array.isArray(parsedResult) ? [] : []);
                const templateMap = parsedResult.templateMap || {};
                if (typeof window !== 'undefined') {
                    window._importedTemplates = importedTemplates;
                    window._otuiTemplateMap = templateMap;
                }
                console.log('Parsed widgets:', parsedWidgets);
                
                if (parsedWidgets.length === 0) {
                    showToast('No widgets found in file. Check the file format.');
                    return;
                }
                
                // Ask user if they want to clear canvas or append
                const append = confirm('Append widgets to canvas? (Cancel to clear canvas first)');
                
                if (!append) {
                    const content = document.getElementById('editorContent');
                    if (content) {
                        content.innerHTML = '';
                        selectWidget(null);
                    }
                }
                
                // Create widgets on canvas
                const content = document.getElementById('editorContent');
                const createdWidgets = window.createWidgetsFromOTUI(parsedWidgets, content, 50, 50);
                
                if (createdWidgets.length > 0) {
                    // Select first widget
                    selectWidget(createdWidgets[0]);
                    
                    // Refresh widget palette to exclude any import-only widgets
                    window._allWidgets = null;
                    populateWidgetPalette();
                    
                    // Save state
                    saveState();
                    updateAll();
                    
                    // Auto-save progress if cookies enabled
                    if (window.OTUIStorage && window.OTUIStorage.hasCookieConsent()) {
                        window.OTUIStorage.autoSaveProgress();
                    }
                    
                    showToast(`Successfully imported ${createdWidgets.length} widget(s) from ${file.name}!`);
                } else {
                    showToast('Failed to create widgets. Check console for errors.');
                }
                
                // Reset input
                e.target.value = '';
            } catch (error) {
                console.error('Error importing OTUI file:', error);
                showToast('Error importing file: ' + error.message);
            }
        });
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
    showToast('OTUI Builder 0.1.1 Beta — READY! (Please Load Styles/Images UI from Settings to start)');
    console.log('OTUI Builder 0.1.1 Beta — READY!');
    console.log('Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo), Del/Backspace (delete), Ctrl+C (copy), Ctrl+V (paste), Ctrl+D (duplicate)');
    
    // Initialize right sidebar resize functionality
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarResize = document.getElementById('rightSidebarResize');
    
    if (rightSidebar && rightSidebarResize) {
        // Load saved width from localStorage
        const savedWidth = localStorage.getItem('rightSidebarWidth');
        if (savedWidth) {
            // Calculate maximum width based on viewport
            const leftSidebar = document.querySelector('.sidebar-left');
            const leftSidebarWidth = leftSidebar ? leftSidebar.offsetWidth : 260;
            const minWorkspaceWidth = 400;
            const maxWidth = window.innerWidth - leftSidebarWidth - minWorkspaceWidth;
            
            // Ensure saved width doesn't exceed maximum
            const width = Math.min(parseInt(savedWidth) || 260, maxWidth);
            rightSidebar.style.width = Math.max(200, width) + 'px';
        }
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        rightSidebarResize.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = rightSidebar.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const diff = startX - e.clientX; // Inverted because we're resizing from left
            
            // Calculate maximum width based on viewport
            // Account for left sidebar (260px) and minimum workspace width (400px)
            const leftSidebar = document.querySelector('.sidebar-left');
            const leftSidebarWidth = leftSidebar ? leftSidebar.offsetWidth : 260;
            const minWorkspaceWidth = 400;
            const maxWidth = window.innerWidth - leftSidebarWidth - minWorkspaceWidth;
            
            // Min 200px, max based on available viewport space
            const newWidth = Math.max(200, Math.min(maxWidth, startWidth + diff));
            
            rightSidebar.style.width = newWidth + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                
                // Save width to localStorage
                localStorage.setItem('rightSidebarWidth', rightSidebar.offsetWidth);
            }
        });
    }
    
    // ========== COOKIE STORAGE INTEGRATION ==========
    
    // Initialize cookie consent on page load
    if (window.OTUIStorage) {
        window.OTUIStorage.initCookieConsent();
        
        // Cookie consent buttons
        const acceptCookiesBtn = document.getElementById('acceptCookiesBtn');
        const declineCookiesBtn = document.getElementById('declineCookiesBtn');
        
        if (acceptCookiesBtn) {
            acceptCookiesBtn.addEventListener('click', () => {
                window.OTUIStorage.setCookieConsent(true);
                const consentDialog = document.getElementById('cookieConsentDialog');
                if (consentDialog) {
                    consentDialog.style.display = 'none';
                }
                showToast('Cookies enabled! Your progress will be saved.');
                
                // If widget library modal was trying to open, open it now
                const widgetLibraryModal = document.getElementById('widgetLibraryModal');
                if (widgetLibraryModal && widgetLibraryModal.dataset.pendingOpen === 'true') {
                    widgetLibraryModal.style.display = 'flex';
                    widgetLibraryModal.dataset.pendingOpen = 'false';
                    // Refresh templates list (function is defined in same scope)
                    setTimeout(() => {
                        if (typeof refreshWidgetTemplatesList === 'function') {
                            refreshWidgetTemplatesList();
                        }
                    }, 100);
                }
                
                // Check for saved progress
                if (window.OTUIStorage.loadCanvasProgress()) {
                    // Progress loaded
                }
            });
        }
        
        if (declineCookiesBtn) {
            declineCookiesBtn.addEventListener('click', () => {
                window.OTUIStorage.setCookieConsent(false);
                const consentDialog = document.getElementById('cookieConsentDialog');
                if (consentDialog) {
                    consentDialog.style.display = 'none';
                }
                showToast('Cookies disabled. Progress will not be saved.');
            });
        }
        
        // Check for saved progress on startup (if cookies are enabled)
        if (window.OTUIStorage.hasCookieConsent()) {
            // Auto-load progress is handled by user clicking "Restore" button
            // We don't auto-load to avoid overwriting user's current work
        }
    }
    
    // ========== WIDGET LIBRARY ==========
    
    // Widget Library button
    const widgetLibraryBtn = document.getElementById('widgetLibraryBtn');
    const widgetLibraryModal = document.getElementById('widgetLibraryModal');
    const saveWidgetBtn = document.getElementById('saveWidgetBtn');
    const saveWidgetNameInput = document.getElementById('saveWidgetNameInput');
    const widgetTemplatesList = document.getElementById('widgetTemplatesList');
    
    // Open widget library modal
    if (widgetLibraryBtn && widgetLibraryModal) {
        widgetLibraryBtn.addEventListener('click', () => {
            if (!window.OTUIStorage) {
                showToast('Storage system not available');
                return;
            }
            
            // Show cookie consent if not given yet
            if (!window.OTUIStorage.hasCookieConsent()) {
                const consentDialog = document.getElementById('cookieConsentDialog');
                if (consentDialog) {
                    // Mark that library modal should open after consent
                    widgetLibraryModal.dataset.pendingOpen = 'true';
                    consentDialog.style.display = 'flex';
                    showToast('Please accept cookies to use the widget library');
                } else {
                    showToast('Please accept cookies to use the widget library');
                }
                return;
            }
            
            widgetLibraryModal.style.display = 'flex';
            refreshWidgetTemplatesList();
        });
    }
    
    // Save widget template
    if (saveWidgetBtn && saveWidgetNameInput) {
        saveWidgetBtn.addEventListener('click', () => {
            if (!selectedWidget) {
                showToast('Please select a widget to save');
                return;
            }
            
            const templateName = saveWidgetNameInput.value.trim();
            if (!templateName) {
                showToast('Please enter a template name');
                return;
            }
            
            if (!window.OTUIStorage) {
                showToast('Storage system not available');
                return;
            }
            
            // Show cookie consent if not given yet
            if (!window.OTUIStorage.hasCookieConsent()) {
                const consentDialog = document.getElementById('cookieConsentDialog');
                if (consentDialog) {
                    consentDialog.style.display = 'flex';
                    showToast('Please accept cookies to save templates');
                } else {
                    showToast('Please accept cookies to save templates');
                }
                return;
            }
            
            const saved = window.OTUIStorage.saveWidgetTemplate(selectedWidget, templateName);
            if (saved) {
                showToast(`Template "${templateName}" saved!`);
                saveWidgetNameInput.value = '';
                // Small delay to ensure cookie/localStorage is written
                setTimeout(() => {
                    refreshWidgetTemplatesList();
                }, 100);
            } else {
                showToast('Failed to save template. Please check console for errors.');
            }
        });
        
        // Allow Enter key to save
        saveWidgetNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveWidgetBtn.click();
            }
        });
    }
    
    // Refresh widget templates list (make it globally accessible)
    window.refreshWidgetTemplatesList = function refreshWidgetTemplatesList() {
        if (!widgetTemplatesList || !window.OTUIStorage) {
            console.warn('Cannot refresh templates list: missing elements');
            return;
        }
        
        const templates = window.OTUIStorage.getWidgetTemplates();
        const templateKeys = Object.keys(templates);
        
        console.log('Refreshing templates list. Found templates:', templateKeys);
        
        if (templateKeys.length === 0) {
            widgetTemplatesList.innerHTML = `
                <div class="no-templates" style="text-align: center; padding: 40px; color: #94a3b8;">
                    <p>No saved templates yet.</p>
                    <p style="font-size: 0.85rem; margin-top: 10px;">Select a widget and save it to create your first template!</p>
                </div>
            `;
            return;
        }
        
        widgetTemplatesList.innerHTML = templateKeys.map(name => {
            const template = templates[name];
            const savedDate = new Date(template.savedAt).toLocaleDateString();
            const childCount = template.childCount || 0;
            const isGroup = childCount > 0;
            // Escape name for use in data attribute (double escaping for safety)
            const escapedName = escapeHtml(name).replace(/"/g, '&quot;');
            return `
                <div class="template-item">
                    <div class="template-item-info">
                        <div class="template-item-name">${escapeHtml(name)}${isGroup ? ' <span style="color: var(--accent); font-size: 0.85rem;">(Widget Group)</span>' : ''}</div>
                        <div class="template-item-meta">
                            Type: ${escapeHtml(template.type)}${isGroup ? ` • ${childCount} child${childCount !== 1 ? 'ren' : ''}` : ''} • Saved: ${savedDate}
                        </div>
                    </div>
                    <div class="template-item-actions">
                        <button class="btn btn-accent" data-template-name="${escapedName}" data-action="load">Load</button>
                        <button class="btn btn-secondary" data-template-name="${escapedName}" data-action="delete">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Attach event listeners to template buttons (safer than onclick)
        widgetTemplatesList.querySelectorAll('[data-action="load"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateName = e.target.getAttribute('data-template-name');
                if (templateName) {
                    loadTemplate(templateName);
                }
            });
        });
        
        widgetTemplatesList.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateName = e.target.getAttribute('data-template-name');
                if (templateName) {
                    deleteTemplate(templateName);
                }
            });
        });
    }
    
    // Load template function (global for onclick handlers)
    window.loadTemplate = function(templateName) {
        if (!window.OTUIStorage) return;
        
        const widget = window.OTUIStorage.loadWidgetTemplate(templateName);
        if (!widget) return;
        
        // Add widget to canvas at current mouse position or center
        const content = document.getElementById('editorContent');
        if (!content) return;
        
        // Position widget in center of viewport
        const viewportWidth = content.offsetWidth || 800;
        const viewportHeight = content.offsetHeight || 600;
        const widgetWidth = parseInt(widget.style.width) || 140;
        const widgetHeight = parseInt(widget.style.height) || 90;
        
        widget.style.left = `${(viewportWidth / 2) - (widgetWidth / 2)}px`;
        widget.style.top = `${(viewportHeight / 2) - (widgetHeight / 2)}px`;
        
        content.appendChild(widget);
        selectWidget(widget);
        
        // Update all widgets after loading (ensures styles and handlers are applied)
        updateAll();
        
        // Save state after template is loaded
        saveState();
        
        // Auto-save progress
        if (window.OTUIStorage) {
            window.OTUIStorage.autoSaveProgress();
        }
        
        const childCount = widget.querySelectorAll('.widget').length;
        const message = childCount > 0 
            ? `Template "${templateName}" loaded with ${childCount} child widget${childCount !== 1 ? 's' : ''}!`
            : `Template "${templateName}" loaded!`;
        showToast(message);
    };
    
    // Delete template function (global for onclick handlers)
    window.deleteTemplate = function(templateName) {
        if (!confirm(`Delete template "${templateName}"?`)) return;
        
        if (window.OTUIStorage && window.OTUIStorage.deleteWidgetTemplate(templateName)) {
            showToast(`Template "${templateName}" deleted`);
            refreshWidgetTemplatesList();
        }
    };
    
    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ========== AUTO-SAVE PROGRESS ==========
    
    // Auto-save progress when canvas changes
    if (window.OTUIStorage && window.OTUIStorage.hasCookieConsent()) {
        // Override saveState to also trigger auto-save
        const originalSaveState = window.saveState;
        if (originalSaveState) {
            window.saveState = function() {
                originalSaveState();
                window.OTUIStorage.autoSaveProgress();
            };
        }
        
        // Also auto-save on widget creation, deletion, etc.
        // This is already handled by saveState() calls throughout the code
    }
    
    // Add "Restore Progress" option to New button
    const newBtn = document.getElementById('newBtn');
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            if (window.OTUIStorage && window.OTUIStorage.hasCookieConsent()) {
                // Check if there's saved progress
                const progressJson = window.OTUIStorage.getCookie('otui_builder_canvas_progress');
                if (progressJson) {
                    if (confirm('Clear canvas? (Saved progress will still be available to restore)')) {
                        const content = document.getElementById('editorContent');
                        if (content) {
                            content.innerHTML = '';
                            selectWidget(null);
                            saveState();
                            updateAll();
                            showToast('Canvas cleared');
                        }
                    }
                } else {
                    // No saved progress, just clear
                    const content = document.getElementById('editorContent');
                    if (content) {
                        content.innerHTML = '';
                        selectWidget(null);
                        saveState();
                        updateAll();
                        showToast('Canvas cleared');
                    }
                }
            } else {
                // No cookies, just clear
                const content = document.getElementById('editorContent');
                if (content) {
                    content.innerHTML = '';
                    selectWidget(null);
                    saveState();
                    updateAll();
                    showToast('Canvas cleared');
                }
            }
        });
    }
    
    // Add "Restore Progress" button to settings or as a separate button
    // For now, we'll add it to the settings modal
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && window.OTUIStorage) {
        // Check if restore button already exists
        let restoreBtn = document.getElementById('restoreProgressBtn');
        if (!restoreBtn) {
            const settingsBody = settingsModal.querySelector('.modal-body');
            if (settingsBody) {
                restoreBtn = document.createElement('button');
                restoreBtn.id = 'restoreProgressBtn';
                restoreBtn.className = 'btn btn-accent';
                restoreBtn.textContent = '📥 Restore Saved Progress';
                restoreBtn.style.width = '100%';
                restoreBtn.style.marginTop = '20px';
                restoreBtn.addEventListener('click', () => {
                    if (window.OTUIStorage.loadCanvasProgress()) {
                        // Progress loaded successfully
                    }
                });
                settingsBody.appendChild(restoreBtn);
            }
        }
    }
};
