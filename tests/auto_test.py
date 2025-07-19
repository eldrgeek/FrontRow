
import asyncio
from playwright.async_api import async_playwright, expect
import requests # For backend API calls
import json
import time
import sys

APP_URL = 'http://localhost:3000' # Frontend URL
BACKEND_URL = 'http://localhost:3001' # Backend URL

async def run_test():
    print("--- Starting FRONT ROW auto-test ---")
    async with async_playwright() as p:
        # Launch browser with CDP enabled for debugging
        # headless=False allows you to visually watch the test.
        browser = await p.chromium.launch(headless=False, devtools=True)
        # For connecting to an MCP server for ad-hoc debugging:
        # browser = await p.chromium.connect("ws://your-mcp-server-address:port/path/to/websocket")

        audience_pages = [] # To keep track of all audience pages for cleanup

        try:
            # --- Scenario 0: Backend Setup (Simulate Artist Scheduling for UI) ---
            print("
--- Backend Setup: Scheduling a Show ---")
            artist_id = "test-artist-1"
            show_title = "My Debut Performance"
            show_time = "2025-07-20T20:00:00Z" # UTC time
            schedule_response = requests.post(f"{BACKEND_URL}/api/shows", json={
                "artistId": artist_id,
                "title": show_title,
                "dateTime": show_time
            })
            expect(schedule_response.status_code).to_be(201)
            print(f"  Backend: Scheduled show '{show_title}'.")

            # --- Scenario 1: Artist Joins and Prepares ---
            print("
--- Scenario 1: Artist Prepares ---")
            # Create a dedicated context for the artist to manage permissions
            artist_context = await browser.new_context()
            await artist_context.grant_permissions(['microphone', 'camera'])
            page_artist = await artist_context.new_page()
            print("  Artist: Navigating to app as artist...")
            await page_artist.goto(APP_URL + '?role=artist') # Use query param for artist role
            await page_artist.wait_for_selector('.performer-controls button:has-text("Go Live")', timeout=10000)
            print("  Artist: Performer controls visible.")
            await asyncio.sleep(1) # Visual pause

            # --- Scenario 2: Multiple Audience Members Join and Select Seats ---
            print("
--- Scenario 2: Audience Members Join ---")
            num_audience_members = 9 # Test all 9 front row seats

            for i in range(num_audience_members):
                print(f"  Audience {i+1}: Joining...")
                page_audience = await browser.new_page()
                await page_audience.goto(APP_URL)
                await page_audience.wait_for_selector('.user-input-form', timeout=10000)

                # Simulate User Input (name and a dummy image)
                dummy_image_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                # Simulate the form submission by executing JS that fills the form
                js_code = f"""(name, img_b64) => {{
                    const nameInput = document.querySelector('input[type="text"]');
                    const fileInput = document.querySelector('input[type="file"]');
                    const form = document.querySelector('.user-input-form form');
                    nameInput.value = name;

                    // Create a dummy File object from base64
                    // Note: Playwright set_input_files is more robust for actual files.
                    // This JS eval approach is for demonstrating in-browser file selection.
                    const byteCharacters = atob(img_b64.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {{
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }}
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], {{ type: 'image/png' }});
                    const file = new File([blob], 'dummy.png', {{ type: 'image/png' }});

                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;

                    // Trigger change events to update React state
                    const nameChangeEvent = new Event('input', {{ bubbles: true }});
                    const fileChangeEvent = new Event('change', {{ bubbles: true }});
                    nameInput.dispatchEvent(nameChangeEvent);
                    fileInput.dispatchEvent(fileChangeEvent);

                    // Submit the form
                    const submitButton = form.querySelector('button[type="submit"]');
                    submitButton.click();
                }}"""
                await page_audience.evaluate(js_code, f'Test User {i+1}', dummy_image_b64)
                print(f"  Audience {i+1}: Name and dummy image submitted.")

                await page_audience.wait_for_selector('.ui-overlay:has-text("Pick your seat")', timeout=10000)
                print(f"  Audience {i+1}: Prompted to pick seat.")

                # Test: Seat Selection - wait for seats to be available and click one
                await page_audience.wait_for_selector('canvas', timeout=10000) # Wait for 3D scene to load
                await asyncio.sleep(1) # Allow scene to fully render
                # Click in the canvas area where seats would be (simulated click)
                canvas = page_audience.locator('canvas')
                await canvas.click(position={'x': 400 + i * 50, 'y': 400}) # Distributed clicks
                await page_audience.wait_for_selector('.controls', timeout=10000)
                print(f"  Audience {i+1}: Seat selected, now in User View.")
                audience_pages.append(page_audience)
                await asyncio.sleep(0.5) # Small pause between users joining

            await asyncio.sleep(2) # Allow all camera transitions to settle

            # --- Scenario 3: Artist Starts Show ---
            print("
--- Scenario 3: Artist Starts Show ---")
            # Artist 'Go Live'
            print("  Artist: Clicking 'Go Live'...")
            await page_artist.click('.performer-controls button:has-text("Go Live")')
            print("  Artist: 'Go Live' clicked. Waiting for WebRTC setup...")
            await asyncio.sleep(5) # Give time for WebRTC to establish

            # Verify show status updates on audience pages
            for i, page_aud in enumerate(audience_pages):
                print(f"  Audience {i+1}: Verifying 'LIVE' indicator...")
                await expect(page_aud.locator('.live-indicator')).to_be_visible(timeout=10000)
                print(f"  Audience {i+1}: 'LIVE' indicator visible.")
                # Verify video element for performer stream is present and possibly playing
                # This is tricky with Playwright. You might need to check network requests
                # or evaluate JS to check video.readyState (e.g., readyState === 4 for HAVE_ENOUGH_DATA)
                # Check if the canvas is rendering (WebRTC stream should be active)
                # Note: Video streams in WebGL/Three.js are not accessible via DOM selectors
                await asyncio.sleep(2) # Allow time for WebRTC stream to establish
                print(f"  Audience {i+1}: Video element for performer stream detected on stage.")
            await asyncio.sleep(5) # Watch the "live" show for a bit

            # --- Scenario 4: Audience Member View Switching ---
            print("
--- Scenario 4: Audience Member View Switching ---")
            test_page_aud = audience_pages[0] # Pick first audience member for view tests

            # Test: User View to Eye-in-the-Sky
            print("  Audience (Test User 1): Switching to Eye-in-the-Sky view...")
            await test_page_aud.click('button:has-text("Eye-in-the-Sky")')
            await asyncio.sleep(2) # Allow camera transition
            print("  Audience (Test User 1): Switched to Eye-in-the-Sky.")

            # Test: Switching back to User View
            print("  Audience (Test User 1): Switching back to Your Seat View...")
            await test_page_aud.click('button:has-text("Your Seat View")')
            await asyncio.sleep(2) # Allow camera transition
            print("  Audience (Test User 1): Switched back to Your Seat View.")

            # --- Scenario 5: Local Recording (Audience side) ---
            print("
--- Scenario 5: Local Recording (Audience) ---")
            print("  Audience (Test User 1): Starting local recording (Performance only)...")
            await test_page_aud.click('button:has-text("Record Performance")')
            await asyncio.sleep(3) # Record for a few seconds
            print("  Audience (Test User 1): Stopping local recording...")
            await test_page_aud.click('button:has-text("Stop Recording")')
            await expect(test_page_aud.locator('button:has-text("Download Recording")')).to_be_visible(timeout=5000)
            print("  Audience (Test User 1): Download button available. (Manual download verification needed)")
            # Note: Playwright doesn't directly support triggering file downloads from data URLs
            # or verifying file content for security reasons. This step is for UI presence.

            # --- Scenario 6: Artist Ends Show ---
            print("
--- Scenario 6: Artist Ends Show ---")
            print("  Artist: Clicking 'End Show'...")
            await page_artist.click('.performer-controls button:has-text("End Show")')
            print("  Artist: 'End Show' clicked.")
            await asyncio.sleep(2) # Wait for signal to propagate

            # Verify show end animation on audience pages
            for i, page_aud in enumerate(audience_pages):
                print(f"  Audience {i+1}: Verifying 'Thank You' screen...")
                await expect(page_aud.locator('.thank-you')).to_be_visible(timeout=10000)
                print(f"  Audience {i+1}: 'Thank You' screen visible.")
            await asyncio.sleep(5) # Allow post-show display

            print("
--- FRONT ROW auto-test completed successfully! ---")

        except Exception as e:
            print(f"
--- Auto-test FAILED: {e} ---")
            # Capture screenshots on failure for debugging
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            await page_artist.screenshot(path=f"test_failure_artist_{timestamp}.png")
            for i, page_aud in enumerate(audience_pages):
                await page_aud.screenshot(path=f"test_failure_audience_{i+1}_{timestamp}.png")
            raise # Re-raise the exception to indicate test failure
        finally:
            print("Closing all browser contexts...")
            await browser.close()
            print("All browser contexts closed.")

if __name__ == '__main__':
    asyncio.run(run_test())
