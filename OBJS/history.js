/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */
let undoHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 100;

function saveState() {
    const content = document.getElementById('editorContent');
    if (!content) return;
    const html = content.innerHTML;
    if (undoHistory[historyIndex] !== html) {
        undoHistory = undoHistory.slice(0, historyIndex + 1);
        undoHistory.push(html);
        if (undoHistory.length > MAX_HISTORY) undoHistory.shift();
        historyIndex = undoHistory.length - 1;
    }
}

function restoreState() {
    const content = document.getElementById('editorContent');
    if (!content || historyIndex < 0) return;
    content.innerHTML = undoHistory[historyIndex];
    content.querySelectorAll('.widget').forEach(w => {
        w.onclick = e => { e.stopPropagation(); selectWidget(w); };
        w.onmousedown = e => {
            if (e.button === 0) {
                e.stopPropagation();
                startDrag(w, e);
            }
        };
        w.querySelectorAll('.resize-handle').forEach(h => {
            h.onmousedown = e => { e.stopPropagation(); startResize(w, h.className.split(' ')[1], e); };
        });
        // Update display content
        const contentEl = w.querySelector('.widget-content');
        if (contentEl) {
            if (w.dataset.text) {
                contentEl.textContent = w.dataset.text;
            } else if (w.dataset.title) {
                contentEl.textContent = w.dataset.title;
            } else if (w.dataset.placeholder) {
                contentEl.textContent = w.dataset.placeholder;
            } else if (w.dataset.itemId) {
                contentEl.textContent = `Item ${w.dataset.itemId}`;
            } else if (w.dataset.percent !== undefined) {
                contentEl.textContent = `${w.dataset.percent}%`;
            } else if (w.dataset.value !== undefined) {
                contentEl.textContent = `Value: ${w.dataset.value}`;
            } else if (w.dataset.source) {
                contentEl.textContent = 'Image';
            } else if (w.dataset.spriteId) {
                contentEl.textContent = `Sprite ${w.dataset.spriteId}`;
            }
        }
    });
    // Clear selection if widget was deleted
    if (selectedWidget && !document.contains(selectedWidget)) {
        selectWidget(null);
    }
    updateAll();
}

