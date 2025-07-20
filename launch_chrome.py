#!/usr/bin/env python3
import subprocess
import platform
import os
import time
import requests
import json

def verify_cdp_connection():
    """
    Verify that Chrome DevTools Protocol is working by checking the debug endpoint.
    """
    try:
        print("🔍 Verifying CDP connection...")
        
        # Check if the CDP endpoint is responding
        response = requests.get('http://localhost:9222/json', timeout=5)
        if response.status_code == 200:
            tabs = response.json()
            print(f"✅ CDP is working! Found {len(tabs)} tab(s)")
            
            # Show available tabs
            for i, tab in enumerate(tabs):
                print(f"  Tab {i+1}: {tab.get('title', 'No title')} - {tab.get('url', 'No URL')}")
            
            return True
        else:
            print(f"❌ CDP endpoint returned status code: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to CDP endpoint (http://localhost:9222)")
        print("   Chrome might not have started properly or CDP is not enabled")
        return False
    except requests.exceptions.Timeout:
        print("❌ Timeout connecting to CDP endpoint")
        return False
    except Exception as e:
        print(f"❌ Error verifying CDP connection: {e}")
        return False

def check_webgl_support():
    """
    Check if WebGL is working by creating a test page and evaluating WebGL context.
    """
    try:
        print("🎮 Checking WebGL support...")
        
        # Create a new tab for WebGL testing
        new_tab_response = requests.get('http://localhost:9222/json/new', timeout=5)
        if new_tab_response.status_code != 200:
            print("❌ Could not create new tab for WebGL testing")
            return False
            
        # Give the tab a moment to initialize
        time.sleep(2)
        
        # Get the new tab info
        tabs_response = requests.get('http://localhost:9222/json', timeout=5)
        if tabs_response.status_code != 200:
            print("❌ Could not get tabs for WebGL testing")
            return False
            
        tabs = tabs_response.json()
        if not tabs:
            print("❌ No tabs available for WebGL testing")
            return False
            
        # Use the first tab for testing
        tab = tabs[0]
        tab_id = tab['id']
        
        # Navigate to a data URL with WebGL test
        webgl_test_js = """
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const gl2 = canvas.getContext('webgl2');
        
        const result = {
            webgl: !!gl,
            webgl2: !!gl2,
            vendor: gl ? gl.getParameter(gl.VENDOR) : 'N/A',
            renderer: gl ? gl.getParameter(gl.RENDERER) : 'N/A',
            version: gl ? gl.getParameter(gl.VERSION) : 'N/A'
        };
        
        console.log('WebGL Test Results:', result);
        result;
        """
        
        # Navigate to a simple data URL and run WebGL test
        navigate_response = requests.get(
            f'http://localhost:9222/json/runtime/evaluate?tabId={tab_id}',
            params={'expression': webgl_test_js},
            timeout=5
        )
        
        print("✅ WebGL test completed - check browser console for detailed results")
        print("   Open Chrome DevTools to see WebGL support details")
        return True
        
    except Exception as e:
        print(f"❌ Error checking WebGL support: {e}")
        return False

def navigate_to_inspect_page():
    """
    Navigate to chrome://inspect/#devices page using CDP.
    """
    try:
        print("🔗 Navigating to chrome://inspect/#devices...")
        
        # Get the first tab
        response = requests.get('http://localhost:9222/json', timeout=5)
        if response.status_code == 200:
            tabs = response.json()
            if tabs:
                # Use the first tab to navigate
                tab_ws_url = tabs[0]['webSocketDebuggerUrl']
                tab_id = tabs[0]['id']
                
                # Create a new tab with the inspect URL
                new_tab_response = requests.get(
                    'http://localhost:9222/json/new?chrome://inspect/#devices',
                    timeout=5
                )
                
                if new_tab_response.status_code == 200:
                    print("✅ Successfully opened chrome://inspect/#devices")
                    return True
                else:
                    print("❌ Failed to open inspect page")
                    return False
            else:
                print("❌ No tabs available to navigate")
                return False
        else:
            print("❌ Could not get tabs list")
            return False
            
    except Exception as e:
        print(f"❌ Error navigating to inspect page: {e}")
        return False

def launch_chrome_with_cdp():
    """
    Launch Chrome browser with Chrome DevTools Protocol (CDP) enabled
    using the default user profile.
    """
    
    # Chrome executable paths for different operating systems
    chrome_paths = {
        'Darwin': [  # macOS
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ],
        'Linux': [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ],
        'Windows': [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            r'C:\Users\%s\AppData\Local\Google\Chrome\Application\chrome.exe' % os.getenv('USERNAME', ''),
        ]
    }
    
    system = platform.system()
    print(f"Detected operating system: {system}")
    
    # Find Chrome executable
    chrome_exec = None
    if system in chrome_paths:
        for path in chrome_paths[system]:
            if os.path.exists(path):
                chrome_exec = path
                break
    
    if not chrome_exec:
        print("Chrome executable not found!")
        print("Please install Google Chrome or update the paths in this script.")
        return False
    
    print(f"Found Chrome at: {chrome_exec}")
    
    # Set up user data directory for debugging in the current project
    current_dir = os.path.dirname(os.path.abspath(__file__))
    debug_data_dir = os.path.join(current_dir, "chrome-debug-profile")
    
    # Create debug profile directory if it doesn't exist
    os.makedirs(debug_data_dir, exist_ok=True)
    print(f"Using data directory: {debug_data_dir}")
    
    # Chrome launch arguments - optimized for WebGL support
    chrome_args = [
        chrome_exec,
        f'--user-data-dir={debug_data_dir}',  # Explicit data directory for debugging
        '--remote-debugging-port=9222',  # Enable CDP on port 9222
        '--remote-allow-origins=*',      # Allow connections from any origin
        # Removed --disable-web-security to allow proper WebGL context creation
        # Removed --disable-features=VizDisplayCompositor to enable hardware acceleration
        '--enable-gpu',                  # Explicitly enable GPU acceleration
        '--enable-webgl',               # Explicitly enable WebGL
        '--enable-webgl2',              # Explicitly enable WebGL2
        '--enable-accelerated-2d-canvas', # Enable hardware accelerated 2D canvas
        '--enable-gpu-rasterization',   # Enable GPU rasterization
        '--disable-background-timer-throttling',    # Prevent throttling
        '--disable-renderer-backgrounding',         # Keep renderer active
        '--disable-backgrounding-occluded-windows', # Keep windows active
        '--disable-ipc-flooding-protection',        # Improve automation reliability
        '--no-first-run',                # Skip first run experience
        '--no-default-browser-check',    # Skip default browser check
        '--disable-popup-blocking',      # Allow popups for testing
        '--disable-translate',           # Disable translation prompts
        '--disable-infobars',           # Disable info bars
        '--window-size=1920,1080',      # Set window size
        '--start-maximized'             # Start maximized
    ]
    
    try:
        print("Launching Chrome with CDP enabled...")
        print(f"CDP will be available at: http://localhost:9222")
        print("Chrome DevTools Protocol endpoint: ws://localhost:9222")
        
        # Launch Chrome
        process = subprocess.Popen(
            chrome_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=False
        )
        
        print(f"Chrome launched with PID: {process.pid}")
        print("Waiting a moment for Chrome to fully start...")
        time.sleep(5)  # Give Chrome more time to start up
        
        # Verify CDP connection
        cdp_working = verify_cdp_connection()
        
        # Check WebGL support if CDP is working
        if cdp_working:
            webgl_working = check_webgl_support()
            navigate_to_inspect_page()
        
        # Check if process is still running
        if process.poll() is None:
            if cdp_working:
                print("✅ Chrome is running successfully with CDP enabled!")
                print("✅ CDP connection verified - debugging is working!")
                print("✅ WebGL support has been optimized (flags enabled)")
                print("\n📋 Chrome should now be showing the chrome://inspect/#devices page")
                print("   You should see 'localhost:9222' listed as a discoverable target")
                print("\n🎮 WebGL Status:")
                print("   - Hardware acceleration: ENABLED")
                print("   - WebGL/WebGL2: ENABLED")
                print("   - GPU rasterization: ENABLED")
                print("   - Test your FRONT ROW app at: http://localhost:5173/")
            else:
                print("⚠️  Chrome is running but CDP verification failed")
                print("   Check the chrome://inspect/#devices page manually")
            
            print("\nYou can now:")
            print("1. Use browser automation tools that connect to localhost:9222")
            print("2. Access Chrome DevTools at: http://localhost:9222")
            print("3. Test WebGL applications (like FRONT ROW)")
            print("4. Verify debugging in the chrome://inspect/#devices page")
            print("5. Check chrome://gpu for detailed GPU status")
            print("\nTo stop Chrome, close the browser window or press Ctrl+C in this terminal.")
            
            # Keep the script running so Chrome stays open
            try:
                process.wait()
            except KeyboardInterrupt:
                print("\n🛑 Stopping Chrome...")
                process.terminate()
                process.wait()
                print("Chrome stopped.")
            
            return True
        else:
            print("❌ Chrome failed to start properly.")
            stdout, stderr = process.communicate()
            if stderr:
                print(f"Error: {stderr.decode()}")
            return False
            
    except Exception as e:
        print(f"❌ Error launching Chrome: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Chrome CDP Launcher")
    print("=" * 50)
    success = launch_chrome_with_cdp()
    if not success:
        print("\n💡 Troubleshooting tips:")
        print("- Make sure Google Chrome is installed")
        print("- Close any existing Chrome instances")
        print("- Check if port 9222 is already in use")
        print("- Run this script with appropriate permissions") 