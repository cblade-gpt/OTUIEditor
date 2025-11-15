// OBJS/anchors.js - Anchor calculation for OTUI positioning
function calculateAnchors(widget) {
    const parent = widget.parentElement;
    if (!parent || parent.id === 'editorContent') return null;

    const widgetLeft = parseInt(widget.style.left) || 0;
    const widgetTop = parseInt(widget.style.top) || 0;
    const widgetWidth = widget.offsetWidth || 0;
    const widgetHeight = widget.offsetHeight || 0;
    const parentWidth = parent.offsetWidth || 1; // Avoid division by zero
    const parentHeight = parent.offsetHeight || 1;

    // Determine anchor strategy based on position
    const anchors = [];
    const margins = { left: 0, top: 0, right: 0, bottom: 0 };

    // Calculate widget center and edges relative to parent
    const widgetCenterX = widgetLeft + widgetWidth / 2;
    const widgetCenterY = widgetTop + widgetHeight / 2;
    const parentCenterX = parentWidth / 2;
    const parentCenterY = parentHeight / 2;

    // Check if widget is centered (within 10px threshold)
    const centerThreshold = 10;
    const isCenteredX = Math.abs(widgetCenterX - parentCenterX) < centerThreshold;
    const isCenteredY = Math.abs(widgetCenterY - parentCenterY) < centerThreshold;

    if (isCenteredX && isCenteredY) {
        return {
            anchors: ['anchors.centerIn: parent'],
            margins: {}
        };
    }

    // Calculate distances from edges
    const distFromLeft = widgetLeft;
    const distFromRight = parentWidth - widgetLeft - widgetWidth;
    const distFromTop = widgetTop;
    const distFromBottom = parentHeight - widgetTop - widgetHeight;

    // Horizontal anchors - use the edge that's closer
    if (distFromLeft <= distFromRight && distFromLeft < parentWidth * 0.3) {
        // Closer to left edge
        anchors.push('anchors.left: parent.left');
        margins.left = Math.max(0, widgetLeft);
    } else if (distFromRight < parentWidth * 0.3) {
        // Closer to right edge
        anchors.push('anchors.right: parent.right');
        margins.right = Math.max(0, distFromRight);
    } else {
        // Default to left anchor with margin
        anchors.push('anchors.left: parent.left');
        margins.left = Math.max(0, widgetLeft);
    }

    // Vertical anchors - use the edge that's closer
    if (distFromTop <= distFromBottom && distFromTop < parentHeight * 0.3) {
        // Closer to top edge
        anchors.push('anchors.top: parent.top');
        margins.top = Math.max(0, widgetTop);
    } else if (distFromBottom < parentHeight * 0.3) {
        // Closer to bottom edge
        anchors.push('anchors.bottom: parent.bottom');
        margins.bottom = Math.max(0, distFromBottom);
    } else {
        // Default to top anchor with margin
        anchors.push('anchors.top: parent.top');
        margins.top = Math.max(0, widgetTop);
    }

    return { anchors, margins };
}

