// OBJS/anchors.js - Anchor calculation for OTUI positioning
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
    
    // CRITICAL: In CSS, position:absolute children are positioned relative to parent's PADDING box
    // In OTUI, anchors are relative to parent's CONTENT box (after padding)
    // So we need to ADD parent padding to the margin to get the correct distance from content edge
    const actualMarginLeft = widgetLeft + parentPaddingLeft;
    const actualMarginTop = widgetTop + parentPaddingTop;

    // Determine anchor strategy based on position
    const anchors = [];
    const margins = { left: 0, top: 0, right: 0, bottom: 0 };

    // Calculate content area dimensions (excluding padding)
    const contentWidth = parentWidth - parentPaddingLeft - parentPaddingRight;
    const contentHeight = parentHeight - parentPaddingTop - parentPaddingBottom;

    // Calculate widget center and edges relative to parent CONTENT area
    const widgetCenterX = actualMarginLeft + widgetWidth / 2;
    const widgetCenterY = actualMarginTop + widgetHeight / 2;
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
    
    // Calculate distances from CONTENT edges (not padding edges)
    const distFromLeft = actualMarginLeft;
    const distFromRight = contentWidth - actualMarginLeft - widgetWidth;
    const distFromTop = actualMarginTop;
    const distFromBottom = contentHeight - actualMarginTop - widgetHeight;

    // Horizontal anchors - use the edge that's closer, but be more precise
    // Use a smaller threshold (10px) to determine which edge is closer
    const horizontalThreshold = 10;
    if (distFromLeft <= distFromRight && distFromLeft <= horizontalThreshold) {
        // Closer to left edge - anchor to left
        anchors.push('anchors.left: parent.left');
        const marginLeft = Math.max(0, Math.round(actualMarginLeft));
        // Only set margin if it's non-zero - don't output margin-left: 0
        if (marginLeft > 0) {
            margins.left = marginLeft;
        }
    } else if (distFromRight <= horizontalThreshold) {
        // Closer to right edge - anchor to right
        anchors.push('anchors.right: parent.right');
        const marginRight = Math.max(0, Math.round(distFromRight));
        // Only set margin if it's non-zero - don't output margin-right: 0
        if (marginRight > 0) {
            margins.right = marginRight;
        }
    } else {
        // Not close to either edge - use left anchor with exact margin from content edge
        anchors.push('anchors.left: parent.left');
        const marginLeft = Math.max(0, Math.round(actualMarginLeft));
        // Only set margin if it's non-zero - don't output margin-left: 0
        if (marginLeft > 0) {
            margins.left = marginLeft;
        }
    }

    // Vertical anchors - use the edge that's closer, but be more precise
    const verticalThreshold = 10;
    if (distFromTop <= distFromBottom && distFromTop <= verticalThreshold) {
        // Closer to top edge - anchor to top
        anchors.push('anchors.top: parent.top');
        const marginTop = Math.max(0, Math.round(actualMarginTop));
        // Only set margin if it's non-zero - don't output margin-top: 0
        if (marginTop > 0) {
            margins.top = marginTop;
        }
    } else if (distFromBottom <= verticalThreshold) {
        // Closer to bottom edge - anchor to bottom
        anchors.push('anchors.bottom: parent.bottom');
        const marginBottom = Math.max(0, Math.round(distFromBottom));
        // Only set margin if it's non-zero - don't output margin-bottom: 0
        if (marginBottom > 0) {
            margins.bottom = marginBottom;
        }
    } else {
        // Not close to either edge - use top anchor with exact margin from content edge
        anchors.push('anchors.top: parent.top');
        const marginTop = Math.max(0, Math.round(actualMarginTop));
        // Only set margin if it's non-zero - don't output margin-top: 0
        if (marginTop > 0) {
            margins.top = marginTop;
        }
    }

    return { anchors, margins };
}

