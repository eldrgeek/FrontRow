#!/bin/bash

echo "🚀 FRONT ROW - Deployment Helper"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}This script helps you prepare for deployment to Render + Netlify${NC}"
echo ""

# Check if git repo is clean
if [[ `git status --porcelain` ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    echo "Commit your changes before deploying to production"
    echo ""
    git status --short
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 1
    fi
fi

# Test local build
echo -e "${BLUE}🔨 Testing frontend build...${NC}"
cd front-row-vite
if npm run build; then
    echo -e "${GREEN}✅ Frontend build successful${NC}"
else
    echo -e "${RED}❌ Frontend build failed${NC}"
    echo "Fix build errors before deploying"
    exit 1
fi

# Test backend
echo -e "${BLUE}🔨 Testing backend...${NC}"
cd ../server
if npm list > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend dependencies ok${NC}"
else
    echo -e "${YELLOW}⚠️  Installing backend dependencies...${NC}"
    npm install
fi

cd ..
echo ""
echo -e "${GREEN}🎉 Ready for deployment!${NC}"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub:"
echo -e "   ${BLUE}git add . && git commit -m 'Prepare for deployment' && git push${NC}"
echo ""
echo "2. Deploy backend to Render:"
echo -e "   ${BLUE}https://render.com${NC}"
echo "   - Connect your GitHub repo"
echo "   - Set root directory to 'server'"
echo "   - Add environment variables (see DEPLOYMENT_GUIDE.md)"
echo ""
echo "3. Deploy frontend to Netlify:"
echo -e "   ${BLUE}https://netlify.com${NC}"
echo "   - Connect your GitHub repo" 
echo "   - Set base directory to 'front-row-vite'"
echo "   - Add environment variables (see DEPLOYMENT_GUIDE.md)"
echo ""
echo -e "${YELLOW}📚 For detailed instructions, see: DEPLOYMENT_GUIDE.md${NC}"
echo "" 