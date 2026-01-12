# License
OTUI Editor is licensed for **personal, non-commercial use only**.
Commercial use, resale, or closed-source redistribution is strictly prohibited.
Contributions are welcome via pull requests.


# OTUI Builder

Visual editor for OTClient UI files.

## Quick Start

### 1. Install Dependencies

```bash
# Install server dependencies
cd server
npm install
cd ..
```

Or use the convenience script:
```bash
npm run install-deps
```

### 2. Start the Server

From the root directory:
```bash
npm start
```

Or from the server directory:
```bash
cd server
npm start
```

The server will start on port 3000 by default.

### 3. Access the Application

- Local: `http://localhost:3000`
- Production: `http://otveterans.net` (if configured with reverse proxy)

## Project Structure

```
otui/
├── server/              # Express server
│   ├── server.js       # Main server file
│   ├── package.json    # Server dependencies
│   ├── lib/            # Server-side modules
│   └── data/           # User data and sessions
├── OBJS/               # Client-side JavaScript
├── otui_builder.html   # Main HTML file
├── otui_builder.css    # Styles
├── otui_builder.js     # Script loader
└── package.json        # Root package.json (for convenience)
```

## Important Notes

- Always run `npm install` in the `server/` directory first
- The server serves both the frontend files and API endpoints
- Authentication is required to use the application
- See `server/AUTH_SETUP.md` for authentication setup
- See `server/DEPLOYMENT.md` for deployment instructions

## Troubleshooting

If you get "ENOENT" errors:
1. Make sure you're in the correct directory
2. Run `npm install` in the `server/` directory
3. Check that all files are present

If port 3000 is in use:
```bash
PORT=3001 npm start
```

