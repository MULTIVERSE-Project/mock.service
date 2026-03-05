import React, { useState, useRef, useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { Button } from 'antd'
import { ExpandOutlined, CompressOutlined } from '@ant-design/icons'

interface ResizableMonacoEditorProps {
  height?: string
  minHeight?: number
  maxHeight?: number
  language: string
  theme?: string
  value: string
  onChange?: (value: string | undefined) => void
  options?: any
  showResizeHandle?: boolean
}

const ResizableMonacoEditor: React.FC<ResizableMonacoEditorProps> = ({
  height = '200px',
  minHeight = 120,
  maxHeight = 600,
  language,
  theme = 'vs',
  value,
  onChange,
  options = {},
  showResizeHandle = true
}) => {
  const [currentHeight, setCurrentHeight] = useState(parseInt(height.replace('px', '')))
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startY.current = e.clientY
    startHeight.current = currentHeight

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY.current
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + deltaY))
      setCurrentHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [currentHeight, minHeight, maxHeight])

  const toggleSize = () => {
    if (currentHeight <= 200) {
      setCurrentHeight(400)
    } else {
      setCurrentHeight(200)
    }
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        border: '1px solid #d9d9d9', 
        borderRadius: '6px',
        position: 'relative'
      }}
    >
      {/* Кнопка быстрого изменения размера */}
      {showResizeHandle && (
        <Button
          size="small"
          type="text"
          icon={currentHeight <= 200 ? <ExpandOutlined /> : <CompressOutlined />}
          onClick={toggleSize}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid #d9d9d9'
          }}
          title={currentHeight <= 200 ? 'Увеличить редактор' : 'Уменьшить редактор'}
        />
      )}
      
      <MonacoEditor
        height={`${currentHeight}px`}
        language={language}
        theme={theme}
        value={value}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          fontSize: 12,
          lineNumbers: 'on',
          folding: true,
          formatOnPaste: true,
          formatOnType: true,
          ...options
        }}
      />
      
      {/* Ручка для изменения размера */}
      {showResizeHandle && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            height: '8px',
            background: isResizing ? '#1890ff' : '#f0f0f0',
            cursor: 'ns-resize',
            borderTop: '1px solid #d9d9d9',
            borderRadius: '0 0 6px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s'
          }}
        >
          <div style={{
            width: '30px',
            height: '3px',
            background: isResizing ? '#1890ff' : '#bfbfbf',
            borderRadius: '2px'
          }} />
        </div>
      )}
    </div>
  )
}

export default ResizableMonacoEditor