/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */
(function () {
    if (window.__OTUI_UTILS) return;
    window.__OTUI_UTILS = true;

    window.showToast = (msg, t = 2500) => {
        let el = document.getElementById('toast');
        if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
        el.textContent = msg; el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), t);
    };

    // Generate sequential IDs like uicheckbox_1, uicheckbox_2, etc.
    window.generateId = (type) => {
        const typeLower = type.toLowerCase();
        const prefix = typeLower + '_';
        
        // Find all existing widgets of this type in the editor
        const editorContent = document.getElementById('editorContent');
        if (!editorContent) {
            // If editor doesn't exist yet, start from 1
            return `${prefix}1`;
        }
        
        // Get all widgets of this type (including nested ones)
        const allWidgets = editorContent.querySelectorAll('.widget');
        let maxNum = 0;
        
        // Find the highest number used for this widget type
        allWidgets.forEach(widget => {
            if (widget.dataset.type === type && widget.id) {
                const id = widget.id;
                if (id.startsWith(prefix)) {
                    // Extract the number part after the prefix
                    const numStr = id.substring(prefix.length);
                    const num = parseInt(numStr, 10);
                    if (!isNaN(num) && num > 0 && num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });
        
        // Generate next sequential ID
        const nextNum = maxNum + 1;
        return `${prefix}${nextNum}`;
    };

    window.fixFormFields = () => {
        document.querySelectorAll('#propertyForm .form-group').forEach(g => {
            const l = g.querySelector('label'), i = g.querySelector('input');
            if (l && i && !i.id) { const id = 'f' + Date.now(); i.id = i.name = id; l.htmlFor = id; }
        });
    };

    new MutationObserver(window.fixFormFields).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', window.fixFormFields);
})();