// Server-side OTUI Style Loader (no DOM dependencies)
// Extracted from OBJS/styleloader.js - pure parsing logic only

function parseOTUIFile(content) {
    const styles = {};
    const lines = content.split('\n');
    let currentStyle = null;
    let currentState = null;
    let currentStateName = null;
    let baseIndent = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const trimmedLine = originalLine.trim();
        
        if (!trimmedLine || trimmedLine.startsWith('//')) continue;
        
        const indent = originalLine.match(/^(\s*)/)[1].length;
        
        const styleMatch = trimmedLine.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:<\s*([A-Za-z][A-Za-z0-9_]*))?/);
        if (styleMatch && indent === 0) {
            const styleName = styleMatch[1];
            const parentName = styleMatch[2];
            
            currentStyle = {
                name: styleName,
                parent: parentName || null,
                properties: {},
                states: {},
                originalStates: {}
            };
            styles[styleName] = currentStyle;
            currentState = null;
            currentStateName = null;
            baseIndent = 0;
            continue;
        }
        
        const stateMatch = trimmedLine.match(/^\$([a-z]+)/);
        if (stateMatch && currentStyle) {
            const stateName = stateMatch[1];
            if (!currentStyle.states[stateName]) {
                currentStyle.states[stateName] = {};
            }
            if (!currentStyle.originalStates[stateName]) {
                currentStyle.originalStates[stateName] = {};
            }
            currentState = currentStyle.states[stateName];
            currentStateName = stateName;
            baseIndent = indent;
            continue;
        }
        
        if (!currentStyle) continue;
        
        if (currentState && indent <= baseIndent && !trimmedLine.startsWith('$')) {
            currentState = null;
            currentStateName = null;
            baseIndent = 0;
        }
        
        const propMatchColon = trimmedLine.match(/^([!a-z-]+):\s*(.+)$/);
        if (propMatchColon) {
            const key = propMatchColon[1];
            let value = propMatchColon[2].trim();
            
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            const target = currentState || currentStyle.properties;
            target[key] = value;
            if (currentStateName && currentStyle.originalStates && currentStyle.originalStates[currentStateName]) {
                currentStyle.originalStates[currentStateName][key] = value;
            }
            continue;
        }
        
        const propMatchSpace = trimmedLine.match(/^([a-z-]+)\s+(.+)$/);
        if (propMatchSpace) {
            const key = propMatchSpace[1];
            const value = propMatchSpace[2].trim();
            
            const target = currentState || currentStyle.properties;
            target[key] = value;
            if (currentStateName && currentStyle.originalStates && currentStyle.originalStates[currentStateName]) {
                currentStyle.originalStates[currentStateName][key] = value;
            }
            continue;
        }
        
        const boolPropMatch = trimmedLine.match(/^([a-z-]+)$/);
        if (boolPropMatch && indent > 0) {
            const key = boolPropMatch[1];
            const target = currentState || currentStyle.properties;
            if (target[key] === undefined) {
                target[key] = 'true';
            }
        }
    }
    
    return styles;
}

module.exports = {
    parseOTUIFile
};

