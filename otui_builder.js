const scripts = [
    'OBJS/utils.js',
    'OBJS/widgets.js',
    'OBJS/core.js',
    'OBJS/ui.js',
    'OBJS/history.js',
    'OBJS/anchors.js',
    'OBJS/codegen.js',
    'OBJS/preview.js',
    'OBJS/init.js'
];

let index = 0;
function loadNext() {
    if (index >= scripts.length) {
        if (window.initOTUIBuilder) {
            window.initOTUIBuilder();
        }
        return;
    }
    const src = scripts[index];
    const s = document.createElement('script');
    s.src = src + '?v=' + Date.now();
    s.onload = () => {
        index++;
        loadNext();
    };
    s.onerror = () => console.error('FAILED:', src);
    document.head.appendChild(s);
}
loadNext();