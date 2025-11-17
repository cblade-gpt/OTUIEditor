// OBJS/ai-generator.js - AI-powered OTUI module generator
// Uses loaded OTUI files as context to generate modules based on user descriptions

class OTUIAIGenerator {
    constructor() {
        this.apiKey = localStorage.getItem('ai_api_key') || '';
        this.apiProvider = localStorage.getItem('ai_provider') || 'openai'; // openai, anthropic, ollama, local, huggingface, gemini, groq, openrouter
        this.apiEndpoint = localStorage.getItem('ai_endpoint') || '';
        this.model = localStorage.getItem('ai_model') || 'gpt-4o-mini';
        this.maxContextSize = 50000; // Max characters for context
    }

    // Get context from loaded OTUI files
    getOTUIContext() {
        if (!window.OTUIStyleLoader) {
            return '';
        }

        const loadedStyles = window.OTUIStyleLoader.loadedStyles();
        if (!loadedStyles || Object.keys(loadedStyles).length === 0) {
            return 'No OTUI styles loaded. Please load .otui files first.';
        }

        // Collect examples from loaded styles
        const examples = [];
        const styleNames = Object.keys(loadedStyles);
        
        // Get diverse examples (different widget types)
        const widgetTypes = ['Window', 'Button', 'Panel', 'Label', 'CheckBox', 'TextEdit', 'ScrollBar', 'ProgressBar', 'Item', 'Image'];
        const collectedTypes = new Set();
        
        for (const styleName of styleNames) {
            if (examples.length >= 10) break; // Limit to 10 examples
            
            const style = loadedStyles[styleName];
            if (!style || !style.resolved) continue;
            
            // Check if this is a widget type we want
            const isWidgetType = widgetTypes.some(type => 
                styleName.includes(type) || style.parent === type || style.parent === `UI${type}`
            );
            
            if (isWidgetType && !collectedTypes.has(styleName)) {
                collectedTypes.add(styleName);
                examples.push(this.formatStyleExample(styleName, style));
            }
        }

        // If we don't have enough examples, add more
        for (const styleName of styleNames) {
            if (examples.length >= 15) break;
            if (collectedTypes.has(styleName)) continue;
            
            const style = loadedStyles[styleName];
            if (style && style.resolved) {
                examples.push(this.formatStyleExample(styleName, style));
                collectedTypes.add(styleName);
            }
        }

        return examples.join('\n\n');
    }

    // Format a style as an example for the AI
    formatStyleExample(styleName, style) {
        const props = style.resolved || style.properties || {};
        const parent = style.parent || '';
        
        let example = `${styleName}`;
        if (parent) {
            example += ` < ${parent}`;
        }
        example += '\n';
        
        // Format properties
        const propLines = [];
        for (const [key, value] of Object.entries(props)) {
            if (key.startsWith('$')) continue; // Skip state properties
            if (value === null || value === undefined || value === '') continue;
            
            // Format property
            if (typeof value === 'boolean') {
                propLines.push(`  ${key}`);
            } else if (typeof value === 'number') {
                propLines.push(`  ${key}: ${value}`);
            } else {
                // String value - may need quotes
                const strValue = String(value);
                if (strValue.includes(' ') || strValue.includes(':')) {
                    propLines.push(`  ${key}: "${strValue}"`);
                } else {
                    propLines.push(`  ${key}: ${strValue}`);
                }
            }
        }
        
        if (propLines.length > 0) {
            example += propLines.join('\n');
        }
        
        return example;
    }

    // Build the prompt for AI generation
    buildPrompt(userDescription, includeContext = true) {
        let prompt = `You are an expert OTUI (OTClient UI) developer. Generate OTUI code based on the user's description.

OTUI Syntax Rules:
- Widgets are defined with their type name (e.g., Window, Button, Panel, Label)
- Properties use format: property: value
- String values with spaces need quotes: text: "Hello"
- Numeric values don't need quotes: size: 200 150
- Boolean properties are just the property name: enabled
- Widgets can inherit from parent styles: WidgetName < ParentName
- Widgets can have IDs: id: myWidgetId
- Nested widgets are indented with 2 spaces
- Common properties: size, text, image-source, color, font, padding, margin, anchors
- Anchors format: anchors.top: parent.top, anchors.bottom: parent.bottom, anchors.left: parent.left, anchors.right: parent.right, anchors.fill: parent, anchors.centerIn: parent, anchors.horizontalCenter: parent.horizontalCenter, anchors.verticalCenter: parent.verticalCenter
- Anchors define position, then margins add offsets: anchors.left: parent.left + margin-left: 10
- Always specify anchors for child widgets - they position relative to parent
- Image sources: image-source: /images/ui/button.png
- Colors: color: #ffffff or color: white

`;

        if (includeContext) {
            const context = this.getOTUIContext();
            if (context && !context.includes('No OTUI styles')) {
                prompt += `Here are examples from loaded OTUI styles to match the style and patterns:\n\n${context}\n\n`;
            }
        }

        prompt += `User Request: ${userDescription}\n\n`;
        prompt += `Generate complete OTUI code that matches the user's description. `;
        prompt += `Use the style patterns from the examples above. `;
        prompt += `Make sure the code is valid OTUI syntax. `;
        prompt += `Include all necessary widgets and properties. `;
        prompt += `If the user wants a window, make it the root widget with an id. `;
        prompt += `IMPORTANT: For child widgets, ALWAYS use anchors to position them relative to parent. `;
        prompt += `Example: anchors.left: parent.left, anchors.top: parent.top, anchors.right: parent.right, anchors.bottom: parent.bottom, anchors.centerIn: parent, anchors.horizontalCenter: parent.horizontalCenter, anchors.verticalCenter: parent.verticalCenter. `;
        prompt += `After anchors, add margins for offsets: margin-left: 10, margin-top: 5, etc. `;
        prompt += `Return ONLY the OTUI code, no explanations or markdown formatting.`;

        return prompt;
    }

    // Generate code using AI
    async generateCode(userDescription, onProgress) {
        if (!userDescription || userDescription.trim().length === 0) {
            throw new Error('Please provide a description of what you want to generate.');
        }

        const prompt = this.buildPrompt(userDescription, true);
        
        if (onProgress) {
            onProgress('Connecting to AI service...');
        }

        try {
            let generatedCode = '';
            
            switch (this.apiProvider) {
                case 'openai':
                    generatedCode = await this.generateWithOpenAI(prompt, onProgress);
                    break;
                case 'anthropic':
                    generatedCode = await this.generateWithAnthropic(prompt, onProgress);
                    break;
                case 'ollama':
                    generatedCode = await this.generateWithOllama(prompt, onProgress);
                    break;
                case 'local':
                    generatedCode = await this.generateWithLocal(prompt, onProgress);
                    break;
                case 'huggingface':
                    generatedCode = await this.generateWithHuggingFace(prompt, onProgress);
                    break;
                case 'gemini':
                    generatedCode = await this.generateWithGemini(prompt, onProgress);
                    break;
                case 'groq':
                    generatedCode = await this.generateWithGroq(prompt, onProgress);
                    break;
                case 'openrouter':
                    generatedCode = await this.generateWithOpenRouter(prompt, onProgress);
                    break;
                default:
                    throw new Error(`Unknown AI provider: ${this.apiProvider}`);
            }

            // Clean up the response
            generatedCode = this.cleanGeneratedCode(generatedCode);
            
            return generatedCode;
        } catch (error) {
            console.error('AI generation error:', error);
            throw error;
        }
    }

    // Generate with OpenAI API
    async generateWithOpenAI(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not set. Please configure it in settings.');
        }

        if (onProgress) {
            onProgress('Sending request to OpenAI...');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert OTUI (OTClient UI) code generator. Generate valid OTUI code based on user requests. Return only the code, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    }

    // Generate with Anthropic (Claude) API
    async generateWithAnthropic(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('Anthropic API key not set. Please configure it in settings.');
        }

        if (onProgress) {
            onProgress('Sending request to Anthropic...');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model || 'claude-3-haiku-20240307',
                max_tokens: 2000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`Anthropic API error: ${error.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        return data.content[0]?.text || '';
    }

    // Generate with Ollama (local model)
    async generateWithOllama(prompt, onProgress) {
        const endpoint = this.apiEndpoint || 'http://localhost:11434';
        const model = this.model || 'llama2';

        if (onProgress) {
            onProgress(`Sending request to Ollama (${model})...`);
        }

        const response = await fetch(`${endpoint}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_predict: 2000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || '';
    }

    // Generate with local API endpoint
    async generateWithLocal(prompt, onProgress) {
        if (!this.apiEndpoint) {
            throw new Error('Local API endpoint not set. Please configure it in settings.');
        }

        if (onProgress) {
            onProgress('Sending request to local API...');
        }

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                model: this.model
            })
        });

        if (!response.ok) {
            throw new Error(`Local API error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.text || data.response || data.content || '';
    }

    // Generate with Hugging Face Inference API (FREE - requires API key from huggingface.co)
    async generateWithHuggingFace(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('Hugging Face API key not set. Get a free key at https://huggingface.co/settings/tokens');
        }

        const model = this.model || 'mistralai/Mistral-7B-Instruct-v0.2';
        
        if (onProgress) {
            onProgress(`Sending request to Hugging Face (${model})...`);
        }

        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 2000,
                    temperature: 0.7,
                    return_full_text: false
                }
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`Hugging Face API error: ${error.error || response.statusText}`);
        }

        const data = await response.json();
        if (Array.isArray(data) && data[0] && data[0].generated_text) {
            return data[0].generated_text;
        }
        return data.generated_text || data[0]?.generated_text || '';
    }

    // Generate with Google Gemini (FREE - requires API key from makersuite.google.com/app/apikey)
    async generateWithGemini(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('Google Gemini API key not set. Get a free key at https://makersuite.google.com/app/apikey');
        }

        const model = this.model || 'gemini-pro';
        
        if (onProgress) {
            onProgress(`Sending request to Google Gemini (${model})...`);
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000
                }
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Generate with Groq (FREE - very fast, requires API key from console.groq.com)
    async generateWithGroq(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('Groq API key not set. Get a free key at https://console.groq.com/keys');
        }

        const model = this.model || 'llama-3.1-8b-instant';
        
        if (onProgress) {
            onProgress(`Sending request to Groq (${model})...`);
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert OTUI (OTClient UI) code generator. Generate valid OTUI code based on user requests. Return only the code, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    }

    // Generate with OpenRouter (FREE models available - requires API key from openrouter.ai)
    async generateWithOpenRouter(prompt, onProgress) {
        if (!this.apiKey) {
            throw new Error('OpenRouter API key not set. Get a free key at https://openrouter.ai/keys');
        }

        const model = this.model || 'google/gemini-flash-1.5';
        
        if (onProgress) {
            onProgress(`Sending request to OpenRouter (${model})...`);
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'OTUI Builder'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert OTUI (OTClient UI) code generator. Generate valid OTUI code based on user requests. Return only the code, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
            throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    }

    // Clean up generated code
    cleanGeneratedCode(code) {
        if (!code) return '';

        // Remove markdown code blocks
        code = code.replace(/```otui\n?/g, '');
        code = code.replace(/```\n?/g, '');
        code = code.replace(/```/g, '');

        // Remove explanations before/after code
        const lines = code.split('\n');
        let startIdx = 0;
        let endIdx = lines.length;

        // Find first line that looks like OTUI code (starts with letter, no colon at start)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && /^[A-Za-z]/.test(line) && !line.startsWith('Here') && !line.startsWith('The')) {
                startIdx = i;
                break;
            }
        }

        // Find last line that looks like OTUI code
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line && (line.includes(':') || /^[A-Za-z]/.test(line))) {
                endIdx = i + 1;
                break;
            }
        }

        code = lines.slice(startIdx, endIdx).join('\n').trim();

        return code;
    }

    // Parse generated OTUI code and create widgets
    parseAndCreateWidgets(code) {
        // This is a simplified parser - in production, you'd want a more robust parser
        const lines = code.split('\n');
        const widgets = [];
        const stack = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;

            // Detect widget type (starts with capital letter, no colon at start)
            if (/^[A-Z][a-zA-Z0-9]*/.test(line) && !line.includes(':')) {
                const widgetType = line.split(' ')[0];
                const indent = lines[i].length - lines[i].trimStart().length;
                
                // Pop stack until we find parent with less indent
                while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }

                const widget = {
                    type: widgetType,
                    indent: indent,
                    properties: {},
                    children: []
                };

                if (stack.length > 0) {
                    stack[stack.length - 1].children.push(widget);
                } else {
                    widgets.push(widget);
                }

                stack.push(widget);
            } else if (line.includes(':')) {
                // Property
                const [key, ...valueParts] = line.split(':');
                const value = valueParts.join(':').trim();
                
                if (stack.length > 0) {
                    const currentWidget = stack[stack.length - 1];
                    currentWidget.properties[key.trim()] = value;
                }
            }
        }

        return widgets;
    }

    // Save configuration
    saveConfig() {
        localStorage.setItem('ai_api_key', this.apiKey);
        localStorage.setItem('ai_provider', this.apiProvider);
        localStorage.setItem('ai_endpoint', this.apiEndpoint);
        localStorage.setItem('ai_model', this.model);
    }

    // Load configuration
    loadConfig() {
        this.apiKey = localStorage.getItem('ai_api_key') || '';
        this.apiProvider = localStorage.getItem('ai_provider') || 'openai';
        this.apiEndpoint = localStorage.getItem('ai_endpoint') || '';
        this.model = localStorage.getItem('ai_model') || 'gpt-4o-mini';
    }
}

// Export singleton instance
window.OTUIAIGenerator = new OTUIAIGenerator();

