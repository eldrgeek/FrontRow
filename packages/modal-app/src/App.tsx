import React, { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'

// Extend Window interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      getConfig: () => Promise<any>
      saveConfig: (config: any) => Promise<boolean>
    }
  }
}

interface ModalMessage {
  message: string
  priority: 'info' | 'warning' | 'error' | 'success'
  icon: string
  duration: number
}

interface ModalState {
  isVisible: boolean
  message: string
  priority: 'info' | 'warning' | 'error' | 'success'
  icon: string
  progress?: number
  showProgress: boolean
  interactive?: boolean
  testStep?: string
  testId?: string
}

const iconMap: Record<string, string> = {
  'browser': '🌐',
  'keyboard': '⌨️',
  'camera': '📷',
  'check': '✅',
  'error': '❌',
  'warning': '⚠️',
  'info': 'ℹ️',
  'success': '✅',
  'loading': '🔄',
  'desktop': '🖥️',
  'tab': '📑',
  'click': '👆',
  'type': '✍️',
  'wait': '⏳'
}

function App() {
  const [modalState, setModalState] = useState<ModalState>({
    isVisible: false,
    message: 'Ready for testing...',
    priority: 'info',
    icon: 'info',
    showProgress: false
  })
  
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  const socketRef = useRef<Socket | null>(null)
  const autoHideTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    console.log('🔌 Initializing socket connection...')
    
    // Initialize socket connection
    socketRef.current = io('http://localhost:3001', {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    })

    const socket = socketRef.current

    socket.on('connect', () => {
      setConnectionStatus('connected')
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: 'Connected to FrontRow server',
        priority: 'success',
        icon: 'check'
      }))
    })

    socket.on('disconnect', (reason) => {
      setConnectionStatus('disconnected')
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: reason === 'io server disconnect' 
          ? 'Disconnected from server' 
          : 'Connection lost - attempting to reconnect...',
        priority: reason === 'io server disconnect' ? 'error' : 'warning',
        icon: reason === 'io server disconnect' ? 'error' : 'loading'
      }))
    })

    socket.on('reconnect', (attemptNumber) => {
      setConnectionStatus('connected')
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: `Reconnected to server (attempt ${attemptNumber})`,
        priority: 'success',
        icon: 'check'
      }))
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      setConnectionStatus('connecting')
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: `Reconnecting... (attempt ${attemptNumber})`,
        priority: 'warning',
        icon: 'loading'
      }))
    })

    socket.on('modal-update', (data) => {
      console.log('📨 Received modal-update:', data)
      handleModalUpdate(data)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const handleTestResponse = (response: 'success' | 'failure' | 'stop') => {
    console.log('🔄 Test response:', response)
    
    // Send response back to server
    if (socketRef.current) {
      socketRef.current.emit('test-response', {
        testId: modalState.testId,
        response,
        step: modalState.testStep
      })
    }

    // Update modal based on response
    if (response === 'stop') {
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: 'Test stopped by user',
        priority: 'warning',
        icon: 'warning',
        interactive: false
      }))
    } else {
      setModalState(prev => ({
        ...prev,
        isVisible: true,
        message: response === 'success' ? 'Step completed successfully' : 'Step failed',
        priority: response === 'success' ? 'success' : 'error',
        icon: response === 'success' ? 'check' : 'error',
        interactive: false
      }))
    }
  }

  const handleModalUpdate = (data: any) => {
    console.log('🔄 Handling modal update:', data)
    const { action, message, duration = 3000, priority = 'info', icon, progress, interactive, testStep, testId } = data

    // Clear existing timeout
    if (autoHideTimeoutRef.current) {
      clearTimeout(autoHideTimeoutRef.current)
    }

    switch (action) {
      case 'show':
        setModalState({
          isVisible: true,
          message,
          priority,
          icon: iconMap[icon] || icon || iconMap[priority] || 'ℹ️',
          showProgress: false,
          interactive: interactive || false,
          testStep: testStep || '',
          testId: testId || ''
        })
        
        if (duration > 0 && !interactive) {
          autoHideTimeoutRef.current = setTimeout(() => {
            setModalState(prev => ({ ...prev, isVisible: false }))
          }, duration)
        }
        break

      case 'hide':
        setModalState(prev => ({ ...prev, isVisible: false }))
        break

      case 'update':
        setModalState(prev => ({
          ...prev,
          message,
          priority,
          icon: iconMap[icon] || icon || iconMap[priority] || 'ℹ️'
        }))
        break

      case 'progress':
        setModalState(prev => ({
          ...prev,
          isVisible: true,
          message: message || prev.message,
          showProgress: true,
          progress: progress || 0
        }))
        break

      case 'interactive':
        setModalState(prev => ({
          ...prev,
          isVisible: true,
          message,
          priority,
          icon: iconMap[icon] || icon || iconMap[priority] || 'ℹ️',
          interactive: true,
          testStep: testStep || '',
          testId: testId || ''
        }))
        break
    }
  }



  if (!modalState.isVisible) {
    return null;
  }

  return (
    <div className={`modal-container priority-${modalState.priority}`}>
      {/* Drag handle */}
      <div className="drag-handle">
        <div className="drag-indicator">⋮⋮</div>
        <div className={`status-indicator ${connectionStatus}`}>●</div>
        <button 
          className="close-button" 
          onClick={() => window.close()}
          title="Close modal"
        >
          ×
        </button>
      </div>
      
      {/* Main content */}
      <div className="content">
        <div className="message-container">
          <div className="icon">{modalState.icon}</div>
          <div className="message">{modalState.message}</div>
        </div>
        
        {/* Progress bar */}
        {modalState.showProgress && (
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${modalState.progress}%` }}
              />
            </div>
            <div className="progress-text">{Math.round(modalState.progress || 0)}%</div>
          </div>
        )}

        {/* Interactive controls */}
        {modalState.interactive && (
          <div className="interactive-controls">
            <div className="test-step-info">
              <strong>Test Step:</strong> {modalState.testStep}
            </div>
            <div className="control-buttons">
              <button 
                className="btn-success"
                onClick={() => handleTestResponse('success')}
              >
                ✅ Success
              </button>
              <button 
                className="btn-failure"
                onClick={() => handleTestResponse('failure')}
              >
                ❌ Failed
              </button>
              <button 
                className="btn-stop"
                onClick={() => handleTestResponse('stop')}
              >
                🛑 Stop Test
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App 