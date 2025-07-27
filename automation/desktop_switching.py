#!/usr/bin/env python3
"""
Desktop and Application Switching Utilities for macOS

This module provides utilities for:
- Switching between desktops/spaces
- Detecting active applications and windows
- Switching to specific applications
"""

import time
from AppKit import NSWorkspace
import Quartz
import Cocoa

class DesktopManager:
    """Manage desktop switching and app detection on macOS"""
    
    def __init__(self, dt_server_client=None):
        """
        Initialize with optional dt-server client for keyboard automation
        If no client provided, instructions will be returned instead
        """
        self.dt_server = dt_server_client
        
    def get_active_app_info(self):
        """Get information about the currently active application"""
        workspace = NSWorkspace.sharedWorkspace()
        active_app = workspace.frontmostApplication()
        
        if active_app is None:
            return {"app": None, "title": None, "pid": None}

        pid = active_app.processIdentifier()
        app_name = active_app.localizedName()

        # Get window info
        windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
        
        for window in windows:
            if window['kCGWindowOwnerPID'] == pid:
                window_title = window.get('kCGWindowName', None)
                return {"app": app_name, "title": window_title, "pid": pid}

        return {"app": app_name, "title": "No window title", "pid": pid}
    
    def find_chrome_with_frontrow(self):
        """Find Chrome windows that contain FRONT ROW or localhost:5173"""
        windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID)
        frontrow_windows = []

        for window in windows:
            pid = window['kCGWindowOwnerPID']
            try:
                ns_running_app = Cocoa.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
                app_name = ns_running_app.localizedName()
                
                if app_name and 'Chrome' in app_name:
                    window_title = window.get('kCGWindowName', '')
                    if window_title and ('FRONT ROW' in window_title or 'localhost:5173' in window_title):
                        frontrow_windows.append({
                            'app': app_name,
                            'title': window_title,
                            'pid': pid,
                            'bounds': window['kCGWindowBounds']
                        })
            except:
                pass
                
        return frontrow_windows
    
    def switch_to_desktop_right(self, delay=0.1):
        """Switch to desktop on the right (Desktop 1 -> Desktop 2)"""
        if self.dt_server:
            # Automated execution
            self.dt_server.press_key("ctrl-up")
            time.sleep(delay)
            self.dt_server.press_key("ctrl-right") 
            time.sleep(delay)
            self.dt_server.press_key("esc")
            time.sleep(delay)
            return True
        else:
            # Return instructions
            return {
                "instructions": [
                    "Press ctrl-up (opens Mission Control)",
                    f"Wait {delay} seconds", 
                    "Press ctrl-right (move to next desktop)",
                    f"Wait {delay} seconds",
                    "Press esc (exit Mission Control)",
                    f"Wait {delay} seconds"
                ],
                "manual_keys": ["ctrl-up", "ctrl-right", "esc"]
            }
    
    def switch_to_desktop_left(self, delay=0.1):
        """Switch to desktop on the left (Desktop 2 -> Desktop 1)"""
        if self.dt_server:
            # Automated execution
            self.dt_server.press_key("ctrl-up")
            time.sleep(delay)
            self.dt_server.press_key("ctrl-left")
            time.sleep(delay) 
            self.dt_server.press_key("esc")
            time.sleep(delay)
            return True
        else:
            # Return instructions
            return {
                "instructions": [
                    "Press ctrl-up (opens Mission Control)",
                    f"Wait {delay} seconds",
                    "Press ctrl-left (move to previous desktop)", 
                    f"Wait {delay} seconds",
                    "Press esc (exit Mission Control)",
                    f"Wait {delay} seconds"
                ],
                "manual_keys": ["ctrl-up", "ctrl-left", "esc"]
            }
    
    def switch_to_app_via_spotlight(self, app_name, delay=0.5):
        """Switch to application using Spotlight"""
        if self.dt_server:
            # Automated execution
            self.dt_server.press_key("cmd-space")
            time.sleep(delay)
            self.dt_server.type_text(app_name, interval=0.05)
            time.sleep(delay)
            self.dt_server.press_key("enter")
            time.sleep(delay)
            return True
        else:
            # Return instructions
            return {
                "instructions": [
                    "Press cmd-space (open Spotlight)",
                    f"Wait {delay} seconds",
                    f"Type '{app_name}'",
                    f"Wait {delay} seconds", 
                    "Press enter",
                    f"Wait {delay} seconds"
                ],
                "manual_keys": [f"cmd-space, type '{app_name}', enter"]
            }
    
    def is_on_correct_desktop_for_frontrow(self):
        """Check if we're on the desktop with Chrome FRONT ROW"""
        frontrow_windows = self.find_chrome_with_frontrow()
        return len(frontrow_windows) > 0
    
    def get_current_context(self):
        """Get full context of current desktop state"""
        active_app = self.get_active_app_info()
        frontrow_available = self.is_on_correct_desktop_for_frontrow()
        
        return {
            "active_app": active_app,
            "frontrow_available": frontrow_available,
            "recommendation": self._get_navigation_recommendation(active_app, frontrow_available)
        }
    
    def _get_navigation_recommendation(self, active_app, frontrow_available):
        """Provide navigation recommendations based on current state"""
        if frontrow_available:
            if active_app['app'] and 'Chrome' in active_app['app'] and 'FRONT ROW' in str(active_app['title']):
                return "✅ Ready - You're in Chrome with FRONT ROW"
            elif active_app['app'] and 'Chrome' in active_app['app']:
                return "⚠️  Switch to FRONT ROW tab in Chrome"
            else:
                return "➡️  Switch to Chrome application"
        else:
            return "🔄 Switch to Desktop 2 (Chrome with FRONT ROW is there)"


# Usage example and testing
if __name__ == "__main__":
    manager = DesktopManager()
    context = manager.get_current_context()
    
    print("=== Current Desktop Context ===")
    print(f"Active App: {context['active_app']['app']}")
    print(f"Window Title: {context['active_app']['title']}")
    print(f"FRONT ROW Available: {context['frontrow_available']}")
    print(f"Recommendation: {context['recommendation']}")
    
    if not context['frontrow_available']:
        print("\n=== Desktop Switch Instructions ===")
        instructions = manager.switch_to_desktop_right()
        for step in instructions['instructions']:
            print(f"  • {step}")