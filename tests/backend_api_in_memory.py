
import requests
import json
import asyncio
from playwright.async_api import async_playwright, expect
import socketio # For testing Socket.IO events
import sys # Import sys for sys.exit

BACKEND_URL = 'http://localhost:3001'

async def test_backend_api_in_memory():
    print("
--- Backend API In-Memory Tests ---")

    # Ensure backend is running and accessible
    try:
        response = requests.get(f"{BACKEND_URL}/api/shows")
        expect(response.status_code).to_be(200)
        print("  Backend is accessible.")
    except requests.exceptions.ConnectionError:
        print("  Backend is not running. Please start the backend server before running tests.")
        sys.exit(1)

    # Test 1: GET /api/shows (initially empty)
    print("  Test 1: GET /api/shows (initially empty)")
    response = requests.get(f"{BACKEND_URL}/api/shows")
    expect(response.json()).to_be([])
    print("    -> Passed: Shows list is initially empty.")

    # Test 2: POST /api/shows (add a show)
    print("  Test 2: POST /api/shows (add a show)")
    new_show_data = {
        "artistId": "test-artist-id-123",
        "title": "My Test Show",
        "dateTime": "2025-07-20T19:00:00Z"
    }
    response = requests.post(f"{BACKEND_URL}/api/shows", json=new_show_data)
    expect(response.status_code).to_be(201)
    created_show = response.json()
    expect(created_show['title']).to_be("My Test Show")
    print(f"    -> Passed: Show '{created_show['title']}' added successfully.")

    # Test 3: GET /api/shows (contains the added show)
    print("  Test 3: GET /api/shows (contains the added show)")
    response = requests.get(f"{BACKEND_URL}/api/shows")
    shows = response.json()
    expect(len(shows)).to_be(1)
    expect(shows[0]['title']).to_be("My Test Show")
    print("    -> Passed: Shows list now contains the added show.")

    # Test 4: Socket.IO - Connect and Receive `shows-updated`
    print("  Test 4: Socket.IO - Connect and Receive `shows-updated`")
    sio = socketio.AsyncClient()
    received_shows_update = asyncio.Event()
    updated_shows_data = None

    @sio.event
    def connect():
        print("    Socket.IO client connected.")

    @sio.event
    def shows_updated(data):
        nonlocal updated_shows_data
        updated_shows_data = data
        received_shows_update.set()
        print("    Received 'shows-updated' event.")

    await sio.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time for connect event

    # Trigger another show addition to ensure event is fired
    requests.post(f"{BACKEND_URL}/api/shows", json={
        "artistId": "test-artist-id-456",
        "title": "Another Test Show",
        "dateTime": "2025-07-21T20:00:00Z"
    })

    try:
        await asyncio.wait_for(received_shows_update.wait(), timeout=5)
        expect(len(updated_shows_data)).to_be(2)
        expect(updated_shows_data[1]['title']).to_be("Another Test Show")
        print("    -> Passed: 'shows-updated' event received and data is correct.")
    except asyncio.TimeoutError:
        print("    -> FAILED: 'shows-updated' event not received in time.")
        raise
    finally:
        await sio.disconnect()

    # Test 5: Socket.IO - Seat Selection and `seat-update` broadcast
    print("  Test 5: Socket.IO - Seat Selection and `seat-update` broadcast")
    sio1 = socketio.AsyncClient() # User 1
    sio2 = socketio.AsyncClient() # User 2 (to receive broadcast)
    seat_update_received_by_sio2 = asyncio.Event()
    received_seat_data = None

    @sio2.event
    def seat_update(data):
        nonlocal received_seat_data
        received_seat_data = data
        seat_update_received_by_sio2.set()
        print("    User 2 received 'seat-update' event.")

    await sio1.connect(BACKEND_URL)
    await sio2.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time to connect

    sio1.emit('select-seat', {'seatId': 'seat-0', 'userName': 'TestUserA', 'userImage': 'data:image/png;base64,abc'})

    try:
        await asyncio.wait_for(seat_update_received_by_sio2.wait(), timeout=5)
        expect(received_seat_data['seatId']).to_be('seat-0')
        expect(received_seat_data['user']['name']).to_be('TestUserA')
        print("    -> Passed: 'seat-update' event received by other client.")
    except asyncio.TimeoutError:
        print("    -> FAILED: 'seat-update' event not received in time.")
        raise
    finally:
        await sio1.disconnect()
        await sio2.disconnect()

    # Test 6: Socket.IO - Artist Go Live / End Show
    print("  Test 6: Socket.IO - Artist Go Live / End Show")
    artist_sio = socketio.AsyncClient()
    audience_sio = socketio.AsyncClient()
    go_live_event = asyncio.Event()
    end_show_event = asyncio.Event()
    show_status_data = None

    @audience_sio.event
    def show_status_update(data):
        nonlocal show_status_data
        show_status_data = data
        if data['status'] == 'live':
            go_live_event.set()
        elif data['status'] == 'post-show':
            end_show_event.set()
        print(f"    Audience received show-status-update: {data['status']}")

    await artist_sio.connect(BACKEND_URL)
    await audience_sio.connect(BACKEND_URL)
    await asyncio.sleep(0.1) # Give time to connect

    # Simulate artist going live
    artist_sio.emit('artist-go-live')
    try:
        await asyncio.wait_for(go_live_event.wait(), timeout=5)
        expect(show_status_data['status']).to_be('live')
        print("    -> Passed: Artist 'go-live' signal received by audience.")
    except asyncio.TimeoutError:
        print("    -> FAILED: Artist 'go-live' signal not received.")
        raise

    # Simulate artist ending show
    artist_sio.emit('artist-end-show')
    try:
        await asyncio.wait_for(end_show_event.wait(), timeout=5)
        expect(show_status_data['status']).to_be('post-show')
        print("    -> Passed: Artist 'end-show' signal received by audience.")
    except asyncio.TimeoutError:
        print("    -> FAILED: Artist 'end-show' signal not received.")
        raise
    finally:
        await artist_sio.disconnect()
        await audience_sio.disconnect()

    print("
--- All Backend API In-Memory Tests Passed ---")

if __name__ == '__main__':
    asyncio.run(test_backend_api_in_memory())
