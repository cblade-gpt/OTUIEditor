/* OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests. */

const https = require('https');
const http = require('http');

async function generateOTUIModule(options) {
    const { prompt, context, apiKey, provider, model, endpoint } = options;
    
    if (!prompt || prompt.trim().length === 0) {
        throw new Error('Please provide a description of what you want to generate.');
    }
    
    const fullPrompt = buildPrompt(prompt, context);
    
    try {
        let generatedCode = '';
        
        switch (provider) {
            case 'openai':
                generatedCode = await generateWithOpenAI(fullPrompt, apiKey, model);
                break;
            case 'anthropic':
                generatedCode = await generateWithAnthropic(fullPrompt, apiKey, model);
                break;
            case 'ollama':
                generatedCode = await generateWithOllama(fullPrompt, endpoint || 'http://localhost:11434');
                break;
            case 'local':
                generatedCode = await generateWithLocal(fullPrompt, endpoint);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${provider}`);
        }
        
        return cleanGeneratedCode(generatedCode);
    } catch (error) {
        console.error('AI generation error:', error);
        throw error;
    }
}

function buildPrompt(userDescription, context = '') {
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

    if (context && context.trim().length > 0) {
        prompt += `Here are examples from loaded OTUI styles to match the style and patterns:\n\n${context}\n\n`;
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

async function generateWithOpenAI(prompt, apiKey, model = 'gpt-4o-mini') {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: 'You are an expert OTUI developer.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000
        });
        
        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    if (response.error) {
                        reject(new Error(response.error.message));
                    } else {
                        resolve(response.choices[0].message.content);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function generateWithAnthropic(prompt, apiKey, model = 'claude-3-haiku-20240307') {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: model,
            max_tokens: 2000,
            messages: [
                { role: 'user', content: prompt }
            ]
        });
        
        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    if (response.error) {
                        reject(new Error(response.error.message));
                    } else {
                        resolve(response.content[0].text);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function generateWithOllama(prompt, endpoint = 'http://localhost:11434') {
    const http = require('http');
    const url = require('url');
    
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(endpoint);
        const data = JSON.stringify({
            model: 'llama2',
            prompt: prompt,
            stream: false
        });
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 11434,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    resolve(response.response);
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function generateWithLocal(prompt, endpoint) {
    // Placeholder for local AI endpoint
    throw new Error('Local AI generation not yet implemented');
}

function cleanGeneratedCode(code) {
    // Remove markdown code blocks
    code = code.replace(/```otui\n?/gi, '');
    code = code.replace(/```\n?/g, '');
    code = code.replace(/```otui\n?/gi, '');
    
    // Remove leading/trailing whitespace
    code = code.trim();
    
    return code;
}

module.exports = {
    generateOTUIModule,
    buildPrompt,
    cleanGeneratedCode
};

