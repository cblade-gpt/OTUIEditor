/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */
const OTUI_WIDGETS = {
    // ========== LAYOUT WIDGETS ==========
    UIWindow: { category: "Layout", isContainer: true, props: { title: "My Window", draggable: true, closable: true }, events: { onClose: 'function()' } },
    CleanStaticMainWindow: { category: "Layout", isContainer: true, props: { title: "Main Window" }, events: { onClose: 'function()' } },
    UIPanel: { category: "Layout", isContainer: true, props: { }, events: {} },
    UIWidget: { category: "Layout", isContainer: true, props: { }, events: {} },
    UIHorizontalSeparator: { category: "Layout", isContainer: false, props: { color: "#666" }, events: {} },
    UIVerticalSeparator: { category: "Layout", isContainer: false, props: { color: "#666" }, events: {} },
    UIScrollArea: { category: "Layout", isContainer: true, props: { verticalScrollBar: true, horizontalScrollBar: false }, events: {} },
    UITabBar: { category: "Layout", isContainer: true, props: { }, events: { onTabChange: 'function(tab)' } },
    UITab: { category: "Layout", isContainer: true, props: { text: "Tab" }, events: {} },
    UIVerticalLayout: { category: "Layout", isContainer: true, props: { spacing: 0 }, events: {} },
    UIHorizontalLayout: { category: "Layout", isContainer: true, props: { spacing: 0 }, events: {} },
    UIGridLayout: { category: "Layout", isContainer: true, props: { cellWidth: 32, cellHeight: 32 }, events: {} },
    
    // ========== CONTROLS ==========
    UIButton: { category: "Controls", isContainer: false, props: { text: "Click" }, events: { onClick: 'function()' } },
    UICheckBox: { category: "Controls", isContainer: false, props: { text: "Option", checked: false }, events: { onCheckChange: 'function(widget, checked)' } },
    UIRadioButton: { category: "Controls", isContainer: false, props: { text: "Option", checked: false, group: "group1" }, events: { onCheckChange: 'function(widget, checked)' } },
    UITextEdit: { category: "Controls", isContainer: false, props: { placeholder: "Enter text...", text: "" }, events: { onTextChange: 'function(widget, text)' } },
    UIProgressBar: { category: "Controls", isContainer: false, props: { percent: 75 }, events: {} },
    UISlider: { category: "Controls", isContainer: false, props: { value: 50, minimum: 0, maximum: 100 }, events: { onValueChange: 'function(widget, value)' } },
    UIComboBox: { category: "Controls", isContainer: false, props: { text: "Select...", currentIndex: 0 }, events: { onOptionChange: 'function(widget, option)' } },
    UIList: { category: "Controls", isContainer: false, props: { }, events: { onSelectionChange: 'function(widget, item)' } },
    UITextList: { category: "Controls", isContainer: false, props: { }, events: { onSelectionChange: 'function(widget, item)' } },
    UIScrollBar: { category: "Controls", isContainer: false, props: { value: 0, maximum: 100, step: 1 }, events: { onValueChange: 'function(widget, value)' } },
    UISpinBox: { category: "Controls", isContainer: false, props: { value: 0, minimum: 0, maximum: 100, step: 1 }, events: { onValueChange: 'function(widget, value)' } },
    
    // ========== DISPLAY ==========
    UILabel: { 
        category: "Display", 
        isContainer: false, 
        props: { 
            text: "",
            textAlign: { type: "select", default: "center", options: ["left", "center", "right"], label: "Text Align" }
        }, 
        events: {} 
    },
    UIImage: { category: "Display", isContainer: false, props: { source: "/images/icon.png" }, events: {} },
    UISprite: { category: "Display", isContainer: false, props: { spriteId: 1, width: 32, height: 32 }, events: {} },
    UIMap: { category: "Display", isContainer: false, props: { zoom: 1, floor: 7 }, events: { onMousePress: 'function(widget, pos)' } },
    UIMinimap: { category: "Display", isContainer: false, props: { zoom: 1, floor: 7 }, events: {} },
    UICreature: { category: "Display", isContainer: false, props: { outfit: "", direction: 3 }, events: {} },
    
    // ========== GAME UI ==========
    UIItem: { category: "Game UI", isContainer: false, props: { itemId: 3031, count: 1 }, events: { onItemClick: 'function(widget, item)' } },
    UIHealthBar: { category: "Game UI", isContainer: false, props: { percent: 100, color: "red" }, events: {} },
    UIManaBar: { category: "Game UI", isContainer: false, props: { percent: 100, color: "blue" }, events: {} },
    UIExperienceBar: { category: "Game UI", isContainer: false, props: { percent: 0, color: "green" }, events: {} },
    UIOutfit: { category: "Game UI", isContainer: false, props: { outfit: "", direction: 3 }, events: {} },
    UICreatureBox: { category: "Game UI", isContainer: false, props: { creatureId: 0 }, events: {} },
    UISkillBar: { category: "Game UI", isContainer: false, props: { skill: "fist", level: 1, percent: 0 }, events: {} },
    UIInventory: { category: "Game UI", isContainer: true, props: { }, events: { onItemClick: 'function(widget, item)' } },
    UIContainer: { category: "Game UI", isContainer: true, props: { containerId: 0 }, events: { onItemClick: 'function(widget, item)' } },
    UISeparator: { category: "Game UI", isContainer: false, props: { color: "#666", marginTop: 5, marginBottom: 5 }, events: {} }
};