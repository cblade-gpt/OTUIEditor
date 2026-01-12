# License
OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests.

# OTUI Editor API Server

This server protects the critical parsing and generation logic by running it server-side.

## Installation

```bash
cd server
npm install
```

## Configuration

Set the API base URL in your frontend (in `otui_builder.html` or via environment variable):

```javascript
window.API_BASE_URL = 'http://localhost:3000/api';
```

## Running the Server

```bash
npm start
```

The server will run on port 3000 by default. You can change this with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Check if server is running

### Parse OTUI Code
- `POST /api/parse`
  - Body: `{ code: string, widgetDefinitions: object }`
  - Returns: `{ success: true, data: { widgets, templates, templateMap } }`

### Generate OTUI Code
- `POST /api/generate`
  - Body: `{ widgetTree: array, widgetDefinitions: object, importedTemplates: array }`
  - Returns: `{ success: true, data: string }` (OTUI code)

### Load OTUI Styles
- `POST /api/styles/load`
  - Body: FormData with `files` array
  - Returns: `{ success: true, data: array }`

### Process Images
- `POST /api/images/process`
  - Body: FormData with `images` array
  - Returns: `{ success: true, data: array }`

### AI Generate OTUI Module
- `POST /api/ai/generate`
  - Body: `{ prompt: string, context: string, apiKey: string, provider: string, model: string, endpoint: string }`
  - Returns: `{ success: true, data: string }` (generated OTUI code)

## Security

The server protects:
1. **parseOTUICode** - OTUI parsing logic
2. **generateOTUICode** - Code generation logic
3. **parseOTUIFile** - Style file parsing
4. **Image processing** - Image handling logic
5. **AI generation** - AI prompt engineering and generation

All critical logic runs server-side and is not exposed to clients.

