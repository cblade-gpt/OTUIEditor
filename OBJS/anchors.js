/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */
function calculateAnchors(widget) {
    const parent = widget.parentElement;
    if (!parent || parent.id === 'editorContent') return null;

    // Get widget position - this is already relative to parent's content area (excluding padding)
    const widgetLeft = parseInt(widget.style.left) || 0;
    const widgetTop = parseInt(widget.style.top) || 0;
    const widgetWidth = widget.offsetWidth || 0;
    const widgetHeight = widget.offsetHeight || 0;
    
    // Get parent dimensions - offsetWidth/Height includes padding but not margin
    const parentWidth = parent.offsetWidth || 1; // Avoid division by zero
    const parentHeight = parent.offsetHeight || 1;
    
    // Get parent padding - margins in OTUI are relative to the content area (after padding)
    // In CSS, position:absolute children are positioned relative to padding box
    // But in OTUI, anchors are relative to content box, so we need to account for parent padding
    const parentStyle = window.getComputedStyle(parent);
    const parentPaddingLeft = parseInt(parentStyle.paddingLeft) || 0;
    const parentPaddingTop = parseInt(parentStyle.paddingTop) || 0;
    const parentPaddingRight = parseInt(parentStyle.paddingRight) || 0;
    const parentPaddingBottom = parseInt(parentStyle.paddingBottom) || 0;
    
    // Determine anchor strategy based on position
    const anchors = [];
    const margins = { left: 0, top: 0, right: 0, bottom: 0 };

    // Calculate content area dimensions (excluding padding)
    const contentWidth = parentWidth - parentPaddingLeft - parentPaddingRight;
    const contentHeight = parentHeight - parentPaddingTop - parentPaddingBottom;

    // CRITICAL FIX: CSS position:absolute is relative to parent's PADDING box
    // OTUI anchors are relative to parent's CONTENT box (after padding)
    // So we need to SUBTRACT parent padding to get content-relative position
    // The parser calculates: CSS position = content-relative position + parentPadding
    // Therefore: content-relative position = CSS position - parentPadding
    const contentRelativeLeft = widgetLeft - parentPaddingLeft;
    const contentRelativeTop = widgetTop - parentPaddingTop;

    // Calculate widget center and edges relative to parent CONTENT area
    const widgetCenterX = contentRelativeLeft + widgetWidth / 2;
    const widgetCenterY = contentRelativeTop + widgetHeight / 2;
    const parentCenterX = contentWidth / 2;
    const parentCenterY = contentHeight / 2;

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
    
    // Calculate distances from CONTENT edges
    const distFromLeft = Math.max(0, contentRelativeLeft);
    const distFromRight = Math.max(0, contentWidth - contentRelativeLeft - widgetWidth);
    const distFromTop = Math.max(0, contentRelativeTop);
    const distFromBottom = Math.max(0, contentHeight - contentRelativeTop - widgetHeight);
    
    // Check for horizontal center (within threshold)
    const horizontalCenterThreshold = 10;
    const isHorizontalCenter = Math.abs((contentRelativeLeft + widgetWidth / 2) - (contentWidth / 2)) < horizontalCenterThreshold;
    
    // Check for vertical center (within threshold)
    const verticalCenterThreshold = 10;
    const isVerticalCenter = Math.abs((contentRelativeTop + widgetHeight / 2) - (contentHeight / 2)) < verticalCenterThreshold;

    // Horizontal anchors
    // Always use the closest edge for accurate margin calculation
    if (isHorizontalCenter) {
        // Horizontally centered
        anchors.push('anchors.horizontalCenter: parent.horizontalCenter');
        // For horizontal center, margins can offset from center
        const offsetFromCenter = (contentRelativeLeft + widgetWidth / 2) - (contentWidth / 2);
        if (Math.abs(offsetFromCenter) > 0.5) {
            if (offsetFromCenter > 0) {
                margins.right = Math.round(Math.abs(offsetFromCenter));
            } else {
                margins.left = Math.round(Math.abs(offsetFromCenter));
            }
        }
    } else if (distFromLeft <= distFromRight) {
        // Closer to left edge (or equal) - anchor to left
        anchors.push('anchors.left: parent.left');
        const marginLeft = Math.max(0, Math.round(distFromLeft));
        if (marginLeft > 0) {
            margins.left = marginLeft;
        }
    } else {
        // Closer to right edge - anchor to right
        anchors.push('anchors.right: parent.right');
        const marginRight = Math.max(0, Math.round(distFromRight));
        if (marginRight > 0) {
            margins.right = marginRight;
        }
    }

    // Vertical anchors
    // Always use the closest edge for accurate margin calculation
    if (isVerticalCenter) {
        // Vertically centered
        anchors.push('anchors.verticalCenter: parent.verticalCenter');
        // For vertical center, margins can offset from center
        const offsetFromCenter = (contentRelativeTop + widgetHeight / 2) - (contentHeight / 2);
        if (Math.abs(offsetFromCenter) > 0.5) {
            if (offsetFromCenter > 0) {
                margins.bottom = Math.round(Math.abs(offsetFromCenter));
            } else {
                margins.top = Math.round(Math.abs(offsetFromCenter));
            }
        }
    } else if (distFromTop <= distFromBottom) {
        // Closer to top edge (or equal) - anchor to top
        anchors.push('anchors.top: parent.top');
        const marginTop = Math.max(0, Math.round(distFromTop));
        if (marginTop > 0) {
            margins.top = marginTop;
        }
    } else {
        // Closer to bottom edge - anchor to bottom
        anchors.push('anchors.bottom: parent.bottom');
        const marginBottom = Math.max(0, Math.round(distFromBottom));
        if (marginBottom > 0) {
            margins.bottom = marginBottom;
        }
    }

    return { anchors, margins };
}

