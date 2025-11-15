// OBJS/ui.js
function selectWidget(widget) {
    document.querySelectorAll('.widget.selected').forEach(w => w.classList.remove('selected'));
    if (widget) widget.classList.add('selected');
    selectedWidget = widget;
    updatePropertyEditor();
    updateHierarchyTree();
    document.getElementById('selectedWidgetBadge').textContent = widget ? widget.dataset.type : 'No Selection';
    const ind = document.getElementById('editingIndicator');
    if (ind) ind.style.display = widget ? 'block' : 'none';
    if (widget) document.getElementById('editingWidgetType').textContent = widget.dataset.type.replace('UI', '');
}

function updateHierarchyTree() {
    const tree = document.getElementById('hierarchyTree');
    tree.innerHTML = '';
    const roots = document.querySelectorAll('#editorContent > .widget');

    function buildNode(w) {
        const node = document.createElement('div');
        node.className = 'tree-node' + (w === selectedWidget ? ' selected' : '');
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
    const def = OTUI_WIDGETS[type];
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

    // Other props
    Object.entries(def.props).forEach(([key, val]) => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `<label>${key}:</label><input type="text" value="${selectedWidget.dataset[key] || val}">`;
        form.appendChild(div);
        div.querySelector('input').onchange = e => {
            selectedWidget.dataset[key] = e.target.value;
            const contentEl = selectedWidget.querySelector('.widget-content');
            
            if (key === 'text') {
                if (contentEl) contentEl.textContent = e.target.value;
            } else if (key === 'title') {
                if (contentEl && !selectedWidget.dataset.text) contentEl.textContent = e.target.value;
            } else if (key === 'placeholder') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title) {
                    contentEl.textContent = e.target.value;
                }
            } else if (key === 'percent') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title) {
                    contentEl.textContent = `${e.target.value}%`;
                }
            } else if (key === 'value') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title && !selectedWidget.dataset.percent) {
                    contentEl.textContent = `Value: ${e.target.value}`;
                }
            } else if (key === 'itemId') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title) {
                    contentEl.textContent = `Item ${e.target.value}`;
                }
            } else if (key === 'source') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title) {
                    contentEl.textContent = 'Image';
                }
            } else if (key === 'spriteId') {
                if (contentEl && !selectedWidget.dataset.text && !selectedWidget.dataset.title) {
                    contentEl.textContent = `Sprite ${e.target.value}`;
                }
            }
            updateAll();
        };
    });
}