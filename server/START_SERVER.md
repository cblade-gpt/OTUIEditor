# Starting the OTUI Editor API Server

## Quick Start

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Configure the frontend:**
   - Open `otui_builder.html` in a text editor
   - Find the API configuration section (around line 13)
   - Uncomment and set: `window.API_BASE_URL = 'http://localhost:3000/api';`
   - Save and refresh the browser

## Default Port

The server runs on port **3000** by default.

To change the port, set the `PORT` environment variable:
```bash
PORT=8080 npm start
```

## What Gets Protected

When the API server is running and configured, these 5 critical functions run server-side:

1. **parseOTUICode** - OTUI parsing logic
2. **generateOTUICode** - Code generation logic  
3. **parseOTUIFile** - Style file parsing
4. **Image processing** - Image handling
5. **AI generation** - AI prompt engineering

## Fallback Behavior

If the API server is not available, the editor automatically falls back to local functions. The editor will work 100% even without the server - the server is optional for code protection.

## Security Note

The server protects your intellectual property by keeping parsing/generation logic server-side. Users cannot see or modify the core algorithms even if they inspect the browser code.

