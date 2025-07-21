# Claude Code Setup for FrontRow Project

## What is Claude Code?

Claude Code is a feature in Cursor that allows Claude to directly execute commands, run tests, and interact with your development environment. It can:
- Start development servers
- Run tests and linting
- Build and deploy applications
- Execute terminal commands
- Monitor running processes

## Setup Complete ✅

Your FrontRow project is now configured for Claude Code with:

### Configuration Files Created:
- `.claude/settings.local.json` - Permissions and security settings
- `.claude/code.json` - Command definitions and tasks
- `.claude/workspace.json` - Project structure and important files

### Available Commands:

#### Development Commands:
```bash
npm run dev          # Start both frontend and backend
npm run frontend     # Start only frontend (Vite)
npm run backend      # Start only backend server
npm run preview      # Preview built application
```

#### Build & Deploy Commands:
```bash
npm run build        # Build for production
npm run deploy-prep  # Prepare for deployment
npm run test         # Run tests
npm run lint         # Run linting
```

#### Setup Commands:
```bash
npm run install-all  # Install all dependencies
```

## How to Use Claude Code in Cursor

### 1. **Ask Claude to Run Commands**
Simply ask Claude to run any of the configured commands:
- "Start the development server"
- "Run the tests"
- "Build the application"
- "Deploy the app"

### 2. **Use the Command Palette**
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "Claude" to see Claude-related commands
- Select "Claude: Run Command" to execute predefined commands

### 3. **Direct Terminal Integration**
Claude can now directly execute terminal commands in your project directory, including:
- Starting servers
- Running npm scripts
- Git operations
- File operations

### 4. **Background Process Management**
Claude can:
- Start development servers in the background
- Monitor running processes
- Stop servers when needed
- Check server status

## Example Usage

### Starting Development:
```
"Start the development environment"
```
This will run `npm run install-all` followed by `npm run dev`

### Running Tests:
```
"Run the test suite"
```
This will execute `npm run test`

### Building for Production:
```
"Build the application for production"
```
This will run `npm run build`

## Environment Variables

The configuration includes environment-specific settings:
- **Development**: `NODE_ENV=development`, `VITE_API_URL=http://localhost:3001`
- **Production**: `NODE_ENV=production`, `VITE_API_URL=https://your-production-api.com`

## Security

The `.claude/settings.local.json` file controls what commands Claude can execute. Currently configured to allow:
- npm commands
- git operations
- deployment commands
- server management
- file operations

## Troubleshooting

### If Claude Code isn't working:
1. **Restart Cursor** - Sometimes a restart is needed after configuration changes
2. **Check Permissions** - Ensure the `.claude/settings.local.json` file has the correct permissions
3. **Verify Configuration** - Make sure all three configuration files exist in `.claude/`
4. **Check Terminal** - Ensure your terminal has the necessary permissions

### Common Issues:
- **Permission Denied**: Check if the commands are allowed in `settings.local.json`
- **Command Not Found**: Ensure all dependencies are installed with `npm run install-all`
- **Port Already in Use**: Claude can help kill processes using `lsof` and `kill` commands

## Next Steps

1. **Test the Setup**: Try asking Claude to "start the development server"
2. **Customize Commands**: Modify `.claude/code.json` to add your own commands
3. **Add More Permissions**: Update `.claude/settings.local.json` if you need additional command access
4. **Explore Features**: Try different Claude Code features like background processes and monitoring

Your FrontRow project is now fully configured for Claude Code! 🎉 