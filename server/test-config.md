# Test Configuration

## Environment Variables

### Server-side (Node.js)

- `NODE_ENV=development` - Enables test endpoints and logging automatically
- `ENABLE_TEST_ENDPOINTS=true` - Enables test API endpoints in production
- `ENABLE_TEST_LOGGING=true` - Enables test event logging in production

### Client-side (Vite/React)

- `VITE_ENABLE_TEST_MODE=true` - Enables test components and scene exposure in production

## Usage Examples

### Development (default behavior)
```bash
npm run dev
# Test endpoints and logging are automatically enabled
```

### Production with testing enabled
```bash
NODE_ENV=production ENABLE_TEST_ENDPOINTS=true ENABLE_TEST_LOGGING=true npm start
VITE_ENABLE_TEST_MODE=true npm run build
```

### Production without testing (default)
```bash
NODE_ENV=production npm start
npm run build
# Test endpoints and logging are disabled
```

## Security Note

When enabling test endpoints in production, ensure:
- Test endpoints are not exposed to public users
- Use proper authentication/authorization if needed
- Monitor for any security implications
- Consider using a separate test environment instead 