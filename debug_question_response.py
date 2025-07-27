#!/usr/bin/env python3
"""
Debug script to test question response functionality
"""

import socketio
import requests
import time
import json

def debug_question_response():
    print("🔍 Debugging question response functionality")
    
    # Create socket client
    sio = socketio.Client()
    
    # Track all events received
    events_received = []
    
    # Flag to control waiting
    response_received = False
    
    @sio.on('connect')
    def on_connect():
        print("✅ Connected to server")
    
    @sio.on('disconnect')
    def on_disconnect():
        print("❌ Disconnected from server")
    
    @sio.on('*')
    def catch_all(event, data):
        print(f"📨 Event: {event}")
        print(f"📄 Data: {data}")
        events_received.append({'event': event, 'data': data, 'timestamp': time.time()})
        
        # If we receive a question-response event, exit immediately
        if event == 'question-response':
            print(f"✅ Received response: {data.get('response', 'N/A')}")
            print("🎉 Exiting immediately after receiving response")
            nonlocal response_received
            response_received = True
            sio.disconnect()
            return
    
    try:
        # Connect to server
        sio.connect('http://localhost:3001')
        
        # Send a question
        question_id = "debug-test-123"
        print(f"📝 Sending question with ID: {question_id}")
        
        response = requests.post(
            'http://localhost:3001/api/test/modal',
            json={
                "action": "question",
                "message": "Debug test question",
                "question": "Debug test question",
                "questionId": question_id,
                "priority": "info",
                "icon": "question"
            }
        )
        
        print(f"📤 Question sent, status: {response.status_code}")
        
        # Wait for response
        print("⏳ Waiting 30 seconds for response...")
        start_time = time.time()
        while not response_received and (time.time() - start_time) < 30:
            time.sleep(0.1)  # Check every 100ms
        
        # Print all events received
        print("\n📋 All events received:")
        for event in events_received:
            print(f"  {event['event']}: {event['data']}")
        
        # Check HTTP API for response
        print(f"\n🔍 Checking HTTP API for response with ID: {question_id}")
        try:
            api_response = requests.get(f'http://localhost:3001/api/question/response/{question_id}')
            print(f"HTTP API status: {api_response.status_code}")
            print(f"HTTP API response: {api_response.json()}")
        except Exception as e:
            print(f"HTTP API error: {e}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        sio.disconnect()

if __name__ == "__main__":
    debug_question_response() 