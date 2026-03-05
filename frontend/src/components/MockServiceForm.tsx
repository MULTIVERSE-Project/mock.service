import React, { useState, useEffect, useCallback } from 'react'
import { 
  Form, Input, Select, Switch, Button, Card, Typography, Space, 
  InputNumber, Row, Col, Divider, Alert, Collapse, Tag, Tooltip, 
  notification, Badge, Table, Dropdown, Menu
} from 'antd'
import { 
  SaveOutlined, ArrowLeftOutlined, InfoCircleOutlined, 
  PlusOutlined, MinusCircleOutlined, ApiOutlined, 
  CodeOutlined, LinkOutlined, SettingOutlined, DeleteOutlined,
  DownOutlined, GlobalOutlined
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import ResizableMonacoEditor from './ResizableMonacoEditor'
import { MockServiceCreate, ConditionalResponse } from '@/types'
import { MockServiceAPI } from '@/api/mockService'
import { useServerInfo } from '@/contexts/ServerContext'
import { copyWithNotification } from '@/utils/clipboard'

const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse
const { Option } = Select

const MockServiceForm: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { serverInfo } = useServerInfo()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [strategy, setStrategy] = useState<string>('static')
  const [conditionalResponses, setConditionalResponses] = useState<ConditionalResponse[]>([])
  const [conditionCode, setConditionCode] = useState('')
  const [pathParams, setPathParams] = useState<string[]>([])
  const [staticResponse, setStaticResponse] = useState('')
  const [staticHeaders, setStaticHeaders] = useState<Array<{key: string, value: string}>>([])
  const [currentPath, setCurrentPath] = useState('')
  const [headersViewMode, setHeadersViewMode] = useState<'table' | 'json'>('table')
  const [headersJson, setHeadersJson] = useState('{\n  "Content-Type": "application/json"\n}')
  const [conditionalHeadersViewMode, setConditionalHeadersViewMode] = useState<'table' | 'json'>('table')
  const [conditionalHeadersJson, setConditionalHeadersJson] = useState<{[key: number]: string}>({})
  const [syntaxType, setSyntaxType] = useState<'xml' | 'json'>('json')
  
  const isEditing = Boolean(id)

  // Популярные HTTP заголовки
  const popularHeaders = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Cache-Control', value: 'no-cache' },
    { key: 'Access-Control-Allow-Origin', value: '*' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Authorization', value: 'Bearer token' },
    { key: 'Content-Encoding', value: 'gzip' },
    { key: 'Expires', value: 'Thu, 01 Dec 1994 16:00:00 GMT' }
  ]

  useEffect(() => {
    if (isEditing) {
      loadMockService()
    } else {
      // Устанавливаем значения по умолчанию для нового сервиса
      form.setFieldsValue({
        methods: ['GET'],
        strategy: 'static',
        static_status_code: 200,
        conditional_status_code: 200,
        is_active: true,
        proxy_delay: 0,
        static_delay: 0,
        conditional_delay: 0
      })
      
      // Инициализируем JSON редакторы с примерами
      setStaticResponse('{\n  "message": "Hello World",\n  "status": "success"\n}')
      setStaticHeaders([{ key: 'Content-Type', value: 'application/json' }])
      setSyntaxType('json')
    }
  }, [id])

  useEffect(() => {
    // Обновляем список параметров пути при изменении path
    const path = form.getFieldValue('path')
    if (path) {
      const params = extractPathParameters(path)
      setPathParams(params)
    }
  }, [form.getFieldValue('path')])

  // Убираем автоматическое переключение - пользователь сам решает когда менять формат

  const extractPathParameters = (path: string): string[] => {
    const regex = /{([^}]+)}/g
    const params: string[] = []
    let match
    while ((match = regex.exec(path)) !== null) {
      params.push(match[1])
    }
    return params
  }

  const formatJSON = (text: string): string => {
    if (!text.trim()) return ''
    try {
      const parsed = JSON.parse(text)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return text // Возвращаем как есть если не JSON
    }
  }

  const validateJSON = (text: string): boolean => {
    if (!text.trim()) return true
    try {
      JSON.parse(text)
      return true
    } catch {
      return false
    }
  }

  const validateXML = (text: string): boolean => {
    if (!text.trim()) return true
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'application/xml')
      const errorNode = doc.querySelector('parsererror')
      return !errorNode
    } catch {
      return false
    }
  }

  const formatXML = (text: string): string => {
    if (!text.trim()) return ''
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'application/xml')
      const errorNode = doc.querySelector('parsererror')
      if (errorNode) return text // Возвращаем как есть если не XML
      
      const serializer = new XMLSerializer()
      const xmlString = serializer.serializeToString(doc)
      
      // Простое форматирование XML
      let formatted = ''
      let indent = 0
      const lines = xmlString.split('><')
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (i > 0) line = '<' + line
        if (i < lines.length - 1) line = line + '>'
        
        if (line.match(/<\/.+>/)) {
          indent--
        }
        
        formatted += '  '.repeat(Math.max(0, indent)) + line + '\n'
        
        if (line.match(/<[^/].+[^/]>/)) {
          indent++
        }
      }
      
      return formatted.trim()
    } catch {
      return text // Возвращаем как есть если ошибка
    }
  }

  // Функции для работы с headers
  const addHeader = () => {
    setStaticHeaders([...staticHeaders, { key: '', value: '' }])
  }

  const removeHeader = (index: number) => {
    setStaticHeaders(staticHeaders.filter((_, i) => i !== index))
  }

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...staticHeaders]
    updated[index] = { ...updated[index], [field]: value }
    setStaticHeaders(updated)
  }

  const addPopularHeader = (header: { key: string, value: string }) => {
    // Проверяем что такого заголовка еще нет
    if (!staticHeaders.some(h => h.key === header.key)) {
      setStaticHeaders([...staticHeaders, header])
    }
  }

  const convertHeadersToJson = (headers: Array<{key: string, value: string}>) => {
    const headersObj: Record<string, string> = {}
    headers.forEach(header => {
      if (header.key.trim() && header.value.trim()) {
        headersObj[header.key.trim()] = header.value.trim()
      }
    })
    return JSON.stringify(headersObj, null, 2)
  }

  const convertJsonToHeaders = (jsonStr: string): Array<{key: string, value: string}> => {
    try {
      const headersObj = JSON.parse(jsonStr)
      return Object.entries(headersObj).map(([key, value]) => ({
        key: String(key),
        value: String(value)
      }))
    } catch {
      return []
    }
  }

  const switchHeadersView = (mode: 'table' | 'json') => {
    if (mode === 'json' && headersViewMode === 'table') {
      // Конвертируем таблицу в JSON
      const jsonStr = convertHeadersToJson(staticHeaders)
      setHeadersJson(jsonStr)
    } else if (mode === 'table' && headersViewMode === 'json') {
      // Конвертируем JSON в таблицу
      const headers = convertJsonToHeaders(headersJson)
      setStaticHeaders(headers)
    }
    setHeadersViewMode(mode)
  }

  const switchConditionalHeadersView = (mode: 'table' | 'json', responseIndex: number) => {
    if (mode === 'json' && conditionalHeadersViewMode === 'table') {
      // Конвертируем таблицу в JSON
      const jsonStr = convertHeadersToJson(getConditionalHeaders(responseIndex))
      setConditionalHeadersJson(prev => ({ ...prev, [responseIndex]: jsonStr }))
    } else if (mode === 'table' && conditionalHeadersViewMode === 'json') {
      // Конвертируем JSON в таблицу
      const currentJson = conditionalHeadersJson[responseIndex] || '{}'
      const headers = convertJsonToHeaders(currentJson)
      // Обновляем заголовки в conditionalResponses
      const updatedResponses = [...conditionalResponses]
      const headersRecord: Record<string, string> = {}
      headers.forEach(header => {
        headersRecord[header.key] = header.value
      })
      updatedResponses[responseIndex] = {
        ...updatedResponses[responseIndex],
        headers: headersRecord
      }
      setConditionalResponses(updatedResponses)
    }
    setConditionalHeadersViewMode(mode)
  }

  const loadMockService = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      const mockService = await MockServiceAPI.getMockService(parseInt(id))
      
      form.setFieldsValue({
        ...mockService,
        conditional_responses: undefined // Обрабатываем отдельно
      })
      
      setStrategy(mockService.strategy)
      setConditionCode(mockService.condition_code || '')
      
      // Обеспечиваем правильную структуру conditional responses
      const responses = (mockService.conditional_responses || []).map(response => ({
        ...response,
        headers: response.headers || {},
        response: response.response || '{"message": "success"}',
        status_code: response.status_code || 200,
        delay: response.delay || 0,
        condition: response.condition || ''
      }))
      setConditionalResponses(responses)
      
      // Определяем тип синтаксиса: приоритет у service_type из API, fallback — эвристика по содержимому
      const serviceType = mockService.service_type || 'rest'
      const responseContent = mockService.static_response || ''
      const isSOAP = serviceType === 'soap' ||
        responseContent.includes('<?xml') ||
        responseContent.includes('<soap:') ||
        responseContent.includes('<soapenv:')
      
      setSyntaxType(isSOAP ? 'xml' : 'json')
      
      // Форматируем ответ в зависимости от типа (JSON или XML)
      const rawResponse = mockService.static_response || ''
      setStaticResponse(isSOAP ? formatXML(rawResponse) || rawResponse : formatJSON(rawResponse))
      
      // Преобразуем headers объект в массив для таблицы и JSON
      const defaultHeaders = isSOAP
        ? [{ key: 'Content-Type', value: 'text/xml; charset=utf-8' }, { key: 'SOAPAction', value: '""' }]
        : [{ key: 'Content-Type', value: 'application/json' }]
      const headersArray = mockService.static_headers 
        ? Object.entries(mockService.static_headers).map(([key, value]) => ({ key, value: String(value) }))
        : defaultHeaders
      setStaticHeaders(headersArray)
      
      // Инициализируем JSON заголовки
      setHeadersJson(convertHeadersToJson(headersArray))
      
      // Инициализируем JSON заголовки для условной стратегии
      const conditionalHeadersJsonData: {[key: number]: string} = {}
      responses.forEach((response, index) => {
        const headersArray = response.headers 
          ? Object.entries(response.headers).map(([key, value]) => ({ key, value: String(value) }))
          : []
        conditionalHeadersJsonData[index] = convertHeadersToJson(headersArray)
      })
      setConditionalHeadersJson(conditionalHeadersJsonData)
      
      // Устанавливаем currentPath для отображения полного URL
      setCurrentPath(mockService.path || '')
      
    } catch (error) {
      console.error('Ошибка загрузки сервиса:', error)
      notification.error({
        message: 'Ошибка',
        description: 'Не удалось загрузить данные сервиса'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true)
      
      // Подготавливаем данные с правильной обработкой JSON
      const processedValues = { ...values }
      
      // Обрабатываем static_response
      if (strategy === 'static') {
        processedValues.static_response = staticResponse.trim()
        
        // Преобразуем headers в объект в зависимости от режима просмотра
        let headersObj: Record<string, string> = {}
        if (headersViewMode === 'table') {
          staticHeaders.forEach(header => {
            if (header.key.trim() && header.value.trim()) {
              headersObj[header.key.trim()] = header.value.trim()
            }
          })
        } else {
          // JSON режим
          try {
            headersObj = JSON.parse(headersJson)
          } catch {
            headersObj = {}
          }
        }
        processedValues.static_headers = headersObj
      }
      
      // Очищаем пустые заголовки в conditional responses
      const cleanedConditionalResponses = conditionalResponses.map((response, index) => {
        let headersObj: Record<string, string> = {}
        
        // Для проксирования заголовки не используются
        if (response.response_type === 'proxy') {
          headersObj = {}
        } else if (conditionalHeadersViewMode === 'table') {
          // Табличный режим - используем существующие заголовки
          headersObj = Object.fromEntries(
            Object.entries(response.headers || {}).filter(([key, value]) => 
              key.trim() !== '' && value.trim() !== ''
            )
          )
        } else {
          // JSON режим - парсим JSON
          try {
            const jsonStr = conditionalHeadersJson[index] || '{}'
            headersObj = JSON.parse(jsonStr)
          } catch {
            headersObj = {}
          }
        }
        
        return {
          ...response,
          headers: headersObj
        }
      })

      const data: MockServiceCreate = {
        ...processedValues,
        service_type: processedValues.service_type || 'rest',
        condition_code: conditionCode,
        conditional_responses: cleanedConditionalResponses
      }

      if (isEditing) {
        await MockServiceAPI.updateMockService(parseInt(id!), data)
        notification.success({
          message: 'Успех',
          description: 'Mock сервис успешно обновлен'
        })
      } else {
        await MockServiceAPI.createMockService(data)
        notification.success({
          message: 'Успех',
          description: 'Mock сервис успешно создан'
        })
      }
      
      navigate('/services')
    } catch (error: any) {
      notification.error({
        message: 'Ошибка',
        description: error.response?.data?.detail || 'Произошла ошибка при сохранении'
      })
    } finally {
      setLoading(false)
    }
  }

  const addConditionalResponse = () => {
    const defaultResponse = isSOAPService() 
      ? `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="http://tempuri.org/">
    <soap:Body>
        <tns:ExampleResponse>
            <tns:Result>Operation completed successfully</tns:Result>
            <tns:Status>SUCCESS</tns:Status>
        </tns:ExampleResponse>
    </soap:Body>
</soap:Envelope>`
      : '{\n  "message": "success",\n  "timestamp": "2024-01-01T00:00:00Z"\n}'

    setConditionalResponses([...conditionalResponses, {
      condition: '',
      response_type: 'static',
      response: defaultResponse,
      proxy_url: '',
      status_code: 200,
      headers: {},
      delay: 0
    }])
  }

  const isSOAPService = () => {
    return syntaxType === 'xml'
  }

  const convertToSOAPService = () => {
    form.setFieldsValue({ service_type: 'soap' })
    // Установка SOAP заголовков
    const soapHeaders = [
      { key: 'Content-Type', value: 'text/xml; charset=utf-8' },
      { key: 'SOAPAction', value: '""' }
    ]
    setStaticHeaders(soapHeaders)
    
    // Установка SOAP ответа по умолчанию
    const soapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="http://tempuri.org/">
    <soap:Body>
        <tns:ExampleResponse>
            <tns:Result>Operation completed successfully</tns:Result>
            <tns:Status>SUCCESS</tns:Status>
            <tns:Timestamp>2024-01-01T10:30:00Z</tns:Timestamp>
        </tns:ExampleResponse>
    </soap:Body>
</soap:Envelope>`
    setStaticResponse(soapResponse)
    setSyntaxType('xml')
    
    notification.success({
      message: 'Переключено в SOAP режим',
      description: 'Заголовки и ответ настроены для SOAP сервиса'
    })
  }

  const convertToRESTService = () => {
    form.setFieldsValue({ service_type: 'rest' })
    // Установка REST заголовков
    const restHeaders = [
      { key: 'Content-Type', value: 'application/json' }
    ]
    setStaticHeaders(restHeaders)
    
    // Установка JSON ответа по умолчанию
    const jsonResponse = '{\n  "message": "Hello World",\n  "status": "success"\n}'
    setStaticResponse(jsonResponse)
    setSyntaxType('json')
    
    notification.success({
      message: 'Переключено в REST режим',
      description: 'Заголовки и ответ настроены для REST API'
    })
  }

  const removeConditionalResponse = (index: number) => {
    setConditionalResponses(conditionalResponses.filter((_, i) => i !== index))
  }

  const updateConditionalResponse = (index: number, field: string, value: any) => {
    const updated = [...conditionalResponses]
    if (updated[index]) {
      updated[index] = { ...updated[index], [field]: value }
      
      // Если переключились на проксирование, очищаем заголовки
      if (field === 'response_type' && value === 'proxy') {
        updated[index].headers = {}
        // Также очищаем JSON заголовки для этого индекса
        setConditionalHeadersJson(prev => {
          const newJson = { ...prev }
          delete newJson[index]
          return newJson
        })
      }
      
      setConditionalResponses(updated)
    }
  }

  // Функции для работы с headers в conditional responses
  const getConditionalHeaders = (responseIndex: number): Array<{key: string, value: string}> => {
    const response = conditionalResponses[responseIndex]
    if (!response) return []
    
    // Обеспечиваем что headers существует и является объектом
    const headers = response.headers || {}
    if (typeof headers !== 'object') return []
    
    return Object.entries(headers).map(([key, value]) => ({ 
      key, 
      value: String(value || '') 
    }))
  }



  const addConditionalHeader = (responseIndex: number) => {
    const updated = [...conditionalResponses]
    if (updated[responseIndex]) {
      const currentHeaders = updated[responseIndex].headers || {}
      const headerEntries = Object.entries(currentHeaders)
      
      // Добавляем новый пустой заголовок
      const newKey = `header_${Date.now()}`
      updated[responseIndex] = {
        ...updated[responseIndex],
        headers: {
          ...currentHeaders,
          [newKey]: ''
        }
      }
      
      setConditionalResponses(updated)
    }
  }

  const removeConditionalHeader = (responseIndex: number, headerIndex: number) => {
    const updated = [...conditionalResponses]
    if (updated[responseIndex]) {
      const currentHeaders = updated[responseIndex].headers || {}
      const headerEntries = Object.entries(currentHeaders)
      
      if (headerEntries[headerIndex]) {
        const [keyToRemove] = headerEntries[headerIndex]
        const newHeaders = { ...currentHeaders }
        delete newHeaders[keyToRemove]
        
        updated[responseIndex] = {
          ...updated[responseIndex],
          headers: newHeaders
        }
        
        setConditionalResponses(updated)
      }
    }
  }

  const updateConditionalHeader = (responseIndex: number, headerIndex: number, field: 'key' | 'value', value: string) => {
    const updated = [...conditionalResponses]
    if (updated[responseIndex]) {
      const currentHeaders = updated[responseIndex].headers || {}
      const headerEntries = Object.entries(currentHeaders)
      
      if (headerEntries[headerIndex]) {
        const [oldKey, oldValue] = headerEntries[headerIndex]
        
        if (field === 'key') {
          // Обновляем ключ заголовка
          const newHeaders = { ...currentHeaders }
          delete newHeaders[oldKey]
          newHeaders[value || oldKey] = oldValue
          
          updated[responseIndex] = {
            ...updated[responseIndex],
            headers: newHeaders
          }
        } else {
          // Обновляем значение заголовка
          updated[responseIndex] = {
            ...updated[responseIndex],
            headers: {
              ...currentHeaders,
              [oldKey]: value
            }
          }
        }
        
        setConditionalResponses(updated)
      }
    }
  }

  const addPopularConditionalHeader = (responseIndex: number, header: { key: string, value: string }) => {
    const updated = [...conditionalResponses]
    if (updated[responseIndex]) {
      const currentHeaders = updated[responseIndex].headers || {}
      
      // Проверяем, нет ли уже такого заголовка
      if (!currentHeaders.hasOwnProperty(header.key)) {
        updated[responseIndex] = {
          ...updated[responseIndex],
          headers: {
            ...currentHeaders,
            [header.key]: header.value
          }
        }
        
        setConditionalResponses(updated)
      }
    }
  }

  const validatePath = (path: string): string | null => {
    if (!path) return 'Путь обязателен'
    if (!path.startsWith('/')) return 'Путь должен начинаться с /'
    
    // Проверяем синтаксис параметров
    const params = extractPathParameters(path)
    const uniqueParams = new Set(params)
    if (params.length !== uniqueParams.size) {
      return 'Имена параметров должны быть уникальными'
    }
    
    // Проверяем wildcard параметр
    const wildcardIndex = params.indexOf('*')
    if (wildcardIndex !== -1) {
      // Wildcard должен быть последним параметром
      if (wildcardIndex !== params.length - 1) {
        return 'Wildcard параметр {*} должен быть последним в пути'
      }
      // Проверяем что wildcard в конце строки
      if (!path.endsWith('{*}')) {
        return 'Wildcard параметр {*} должен быть в конце пути'
      }
    }
    
    for (const param of params) {
      if (!param.trim()) return 'Имя параметра не может быть пустым'
      // Разрешаем wildcard
      if (param === '*') continue
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param)) {
        return `Некорректное имя параметра: ${param}`
      }
    }
    
    return null
  }

  const getPathExamples = () => [
    '/api/users',
    '/api/users/{id}',
    '/api/users/{user_id}/posts/{post_id}',
    '/api/files/{filename}.{ext}',
    '/api/users{*}',
    '/docs{*}'
  ]

  const getConditionalExamples = () => ({
    codeTemplates: [
      {
        title: '🚀 Базовые переменные',
        code: `# Доступные переменные:
# request, headers, query, body, method, path, path_params, json

# Path параметры
user_id = path_params.get('id', '')
category = path_params.get('category', '')

# Query параметры  
page = int(query.get('page', 1))
limit = int(query.get('limit', 10))
search = query.get('q', '')

# Заголовки
auth_token = headers.get('authorization', '')
user_role = headers.get('x-user-role', 'guest')
api_key = headers.get('x-api-key', '')

# JSON данные
if json:
    username = json.get('username', '')
    email = json.get('email', '')
    age = json.get('age', 0)
else:
    username = ''
    email = ''
    age = 0`
      },
      {
        title: '🧼 SOAP данные',
        code: `import re

# Парсинг SOAP envelope (с поддержкой namespace)
user_id = ""
operation = ""
fault_code = ""

# SOAPAction из заголовков
soap_action = headers.get("soapaction", "").strip('"').lower()

if body:
    try:
        # Убираем переносы строк для regex
        clean_body = re.sub(r'\\s+', ' ', body)
        
        # Извлекаем значения с учетом namespace (tns:, soap:, или без prefix)
        # Для userId
        user_id_patterns = [
            r'<(?:tns:)?userId[^>]*>([^<]+)</(?:tns:)?userId>',
            r'<(?:.*:)?userId[^>]*>([^<]+)</(?:.*:)?userId>',
            r'<userId[^>]*>([^<]+)</userId>'
        ]
        
        for pattern in user_id_patterns:
            match = re.search(pattern, clean_body, re.IGNORECASE)
            if match:
                user_id = match.group(1)
                break
        
        # Определяем операцию из SOAP body или action
        if 'getUserInfo' in soap_action or 'getUserInfo' in body:
            operation = "getUserInfo"
        elif 'createUser' in soap_action or 'createUser' in body:
            operation = "createUser"
        elif 'updateUser' in soap_action or 'updateUser' in body:
            operation = "updateUser"
            
    except Exception as e:
        fault_code = str(e)[:50]`
      },
      {
        title: '🔐 Авторизация и роли',
        code: `# Проверка авторизации
is_authenticated = 'authorization' in headers
has_bearer_token = headers.get('authorization', '').startswith('Bearer ')
has_api_key = headers.get('x-api-key') == 'your-valid-api-key'

# Роли пользователей
user_role = headers.get('x-user-role', 'guest')
is_admin = user_role == 'admin'
is_moderator = user_role in ['admin', 'moderator']
is_premium = user_role == 'premium'

# Извлечение токена
auth_header = headers.get('authorization', '')
token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

# Проверка прав доступа
permissions = headers.get('x-permissions', '').split(',')
can_read = 'read' in permissions
can_write = 'write' in permissions
can_delete = 'delete' in permissions`
      },
      {
        title: '📊 Валидация и лимиты',
        code: `# Валидация query параметров
limit = int(query.get('limit', 10))
page = int(query.get('page', 1))
search_query = query.get('q', '')

# Проверки лимитов
limit_exceeded = limit > 100
search_too_short = len(search_query) < 3
invalid_page = page < 1

# Валидация JSON данных
if json:
    email = json.get('email', '')
    username = json.get('username', '')
    age = json.get('age', 0)
    amount = json.get('amount', 0)
    
    # Проверки
    is_valid_email = '@' in email and '.' in email
    is_valid_username = len(username) >= 3 and username.isalnum()
    is_adult = age >= 18
    is_valid_amount = amount > 0 and amount <= 100000
else:
    is_valid_email = False
    is_valid_username = False
    is_adult = False
    is_valid_amount = False`
      },
      {
        title: '⏰ Временные условия',
        code: `import datetime

# Текущее время
now = datetime.datetime.now()
current_hour = now.hour
current_minute = now.minute
current_weekday = now.weekday()  # 0=понедельник, 6=воскресенье

# Временные интервалы
is_business_hours = 9 <= current_hour <= 17
is_lunch_time = 12 <= current_hour <= 13
is_weekend = current_weekday >= 5
is_monday = current_weekday == 0
is_friday = current_weekday == 4

# Ночное время
is_night = current_hour >= 22 or current_hour <= 6
is_early_morning = 6 <= current_hour <= 9

# Специальные проверки
is_maintenance_window = current_weekday == 6 and 2 <= current_hour <= 4  # Суббота 2-4 утра
is_peak_hours = current_weekday < 5 and 9 <= current_hour <= 11  # Будни 9-11`
      },
      {
        title: '📋 Form данные',
        code: `# Парсинг form-encoded данных
form_data = {}
if 'application/x-www-form-urlencoded' in headers.get('content-type', ''):
    try:
        import urllib.parse
        form_data = urllib.parse.parse_qs(body)
        
        # Извлечение полей (parse_qs возвращает списки)
        username = form_data.get('username', [''])[0]
        password = form_data.get('password', [''])[0]
        email = form_data.get('email', [''])[0]
        remember_me = 'remember' in form_data
        
        # Множественные значения
        categories = form_data.get('category', [])
        tags = form_data.get('tags[]', [])
        
    except Exception:
        username = ''
        password = ''
        email = ''
        remember_me = False
        categories = []
        tags = []
else:
    username = ''
    password = ''
    email = ''
    remember_me = False`
      },
      {
        title: '🌐 REST API паттерны',
        code: `# RESTful паттерны
resource_id = path_params.get('id', '')
parent_id = path_params.get('parent_id', '')

# HTTP методы
is_get = method == 'GET'
is_post = method == 'POST' 
is_put = method == 'PUT'
is_delete = method == 'DELETE'
is_patch = method == 'PATCH'

# Content-Type проверки
is_json = 'application/json' in headers.get('content-type', '')
is_xml = 'text/xml' in headers.get('content-type', '') or 'application/xml' in headers.get('content-type', '')
is_form = 'application/x-www-form-urlencoded' in headers.get('content-type', '')

# Общие REST проверки
is_collection_request = resource_id == ''  # GET /users
is_item_request = resource_id != ''        # GET /users/123
is_nested_resource = parent_id != ''       # GET /users/123/posts

# Фильтрация и сортировка
sort_by = query.get('sort', 'id')
sort_order = query.get('order', 'asc')
filter_status = query.get('status', '')
date_from = query.get('from', '')
date_to = query.get('to', '')`
      },
      {
        title: '🔗 Проксирование с параметрами',
        code: `# Подстановка параметров в proxy_url
user_id = path_params.get('id', '')
user_role = headers.get('x-user-role', 'guest')
is_admin = user_role == 'admin'

# Примеры proxy_url с параметрами:
# https://api.example.com/users/{user_id}
# https://admin-api.example.com/users/{user_id}?role={user_role}
# https://api.example.com/users/{user_id}/posts?admin={is_admin}

# Переменные из JSON body
if json:
    post_id = json.get('post_id', '')
    category = json.get('category', '')
    
# Переменные из query параметров
page = query.get('page', 1)
limit = query.get('limit', 10)

# Все эти переменные можно использовать в proxy_url:
# https://api.example.com/posts/{post_id}?page={page}&limit={limit}`
      }
    ],
    
    quickConditions: [
      { label: 'Авторизован', code: 'is_authenticated' },
      { label: 'Админ', code: 'is_admin' },
      { label: 'Есть ID', code: 'user_id != ""' },
      { label: 'Валидный email', code: 'is_valid_email' },
      { label: 'Превышен лимит', code: 'limit_exceeded' },
      { label: 'Рабочие часы', code: 'is_business_hours' },
      { label: 'Выходные', code: 'is_weekend' },
      { label: 'POST запрос', code: 'is_post' },
      { label: 'JSON данные', code: 'is_json' },
      { label: 'SOAP операция', code: 'operation != ""' }
    ],

    // Старые примеры для совместимости
    examples: [
      {
        title: 'По ID пользователя',
        code: 'user_id = path_params.get("id", "")\nis_admin = user_role == "admin"',
        conditions: [
          { condition: 'user_id == "1"', response: '{"name": "Админ", "role": "admin"}' },
          { condition: 'user_id != "" and is_admin', response: '{"name": "Администратор", "access": "full"}' },
          { condition: 'user_id != ""', response: '{"name": "Пользователь", "id": user_id}' }
        ]
      }
    ]
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Заголовок */}
        <div>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/services')}
            style={{ marginBottom: 16 }}
          >
            Назад к списку
          </Button>
          <Title level={2}>
            <ApiOutlined /> {isEditing ? 'Редактировать' : 'Создать'} Mock Сервис
          </Title>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            methods: ['GET'],
            strategy: 'static',
            static_status_code: 200,
            conditional_status_code: 200,
            is_active: true
          }}
        >
          {/* Основные настройки */}
          <Card title={<><SettingOutlined /> Основные настройки</>} style={{ marginBottom: 24 }}>
            <Row gutter={[16, 0]}>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="Название сервиса"
                  rules={[{ required: true, message: 'Введите название' }]}
                >
                  <Input placeholder="Например: User API" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="is_active"
                  label="Активен"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Да" unCheckedChildren="Нет" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="path"
              label={
                <Space>
                  Путь
                  <Tooltip title="Используйте {параметр} для создания параметризованных путей">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              }
              rules={[
                { required: true, message: 'Введите путь' },
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve()
                    const error = validatePath(value)
                    return error ? Promise.reject(error) : Promise.resolve()
                  }
                }
              ]}
              extra={
                <div>
                  <Paragraph style={{ margin: '8px 0', fontSize: '12px', color: '#666' }}>
                    Примеры: {getPathExamples().map((example, i) => (
                      <Tag 
                        key={i} 
                        style={{ margin: '2px', cursor: 'pointer' }}
                        onClick={() => form.setFieldsValue({ path: example })}
                      >
                        {example}
                      </Tag>
                    ))}
                  </Paragraph>
                  <Alert
                    message="💡 Поддержка Wildcard параметров"
                    description={
                      <div>
                        <Text>Используйте <Text code>{`{*}`}</Text> для захвата любых подпутей:</Text>
                        <br />
                        <Text type="secondary">• <Text code>/users{`{*}`}</Text> → <Text code>/users</Text>, <Text code>/users/123</Text>, <Text code>/users/account/settings</Text></Text>
                        <br />
                        <Text type="secondary">• <Text code>/docs{`{*}`}</Text> → <Text code>/docs</Text>, <Text code>/docs/api</Text>, <Text code>/docs/guide/intro</Text></Text>
                      </div>
                    }
                    type="info"
                    showIcon
                    style={{ marginTop: 8, fontSize: '12px' }}
                  />
                  {pathParams.length > 0 && (
                    <Alert
                      message={
                        <Space>
                          <Text strong>Найденные параметры:</Text>
                          {pathParams.map(param => (
                            <Badge key={param} count={param} style={{ backgroundColor: '#52c41a' }} />
                          ))}
                        </Space>
                      }
                      type="success"
                      showIcon
                      style={{ marginTop: 8 }}
                    />
                  )}
                  {currentPath && serverInfo && (
                    <Alert
                      message={
                        <Space>
                          <Text strong>Полный URL эндпоинта:</Text>
                          <Text code style={{ fontSize: '12px' }}>
                            {serverInfo.mock_base_url}{currentPath}
                          </Text>
                          <Button
                            type="text"
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => {
                              const fullUrl = `${serverInfo.mock_base_url}${currentPath}`
                              copyWithNotification(fullUrl, 'URL скопирован в буфер обмена')
                            }}
                            style={{ padding: '0 4px', height: '20px' }}
                            title="Скопировать URL"
                          />
                        </Space>
                      }
                      type="info"
                      showIcon={false}
                      style={{ marginTop: 8, backgroundColor: '#f0f9ff', border: '1px solid #bae7ff' }}
                    />
                  )}
                </div>
              }
            >
              <Input 
                placeholder="/api/users/{id}" 
                onChange={(e) => {
                  setCurrentPath(e.target.value)
                  const pathParams = extractPathParameters(e.target.value)
                  setPathParams(pathParams)
                }}
              />
            </Form.Item>

            <Row gutter={[16, 0]}>
              <Col span={8}>
                <Form.Item
                  name="methods"
                  label="HTTP методы"
                  rules={[{ required: true, message: 'Выберите методы' }]}
                >
                  <Select mode="multiple" placeholder="Выберите методы">
                    <Option value="GET">GET</Option>
                    <Option value="POST">POST</Option>
                    <Option value="PUT">PUT</Option>
                    <Option value="DELETE">DELETE</Option>
                    <Option value="PATCH">PATCH</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="strategy"
                  label="Стратегия ответа"
                  rules={[{ required: true, message: 'Выберите стратегию' }]}
                >
                  <Select onChange={setStrategy}>
                    <Option value="static">
                      <Space>
                        <CodeOutlined />
                        Статичный ответ
                      </Space>
                    </Option>
                    <Option value="proxy">
                      <Space>
                        <LinkOutlined />
                        Проксирование
                      </Space>
                    </Option>
                    <Option value="conditional">
                      <Space>
                        <ApiOutlined />
                        Условный ответ
                      </Space>
                    </Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="service_type"
                  label="Тип сервиса"
                  initialValue="rest"
                >
                  <Select>
                    <Option value="rest">
                      <Space>
                        <ApiOutlined />
                        REST API
                      </Space>
                    </Option>
                    <Option value="soap">
                      <Space>
                        <GlobalOutlined />
                        SOAP Web Service
                      </Space>
                    </Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Настройки стратегии */}
          {strategy === 'static' && (
            <Card title="⚡ Настройки статичного ответа" style={{ marginBottom: 24 }}>
              <Row gutter={[16, 0]}>
                <Col span={8}>
                  <Form.Item name="static_status_code" label="Код ответа">
                    <InputNumber min={100} max={599} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="static_delay" label="Задержка (сек)">
                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>Тело ответа</span>
                  <Space>
                    <Button 
                      size="small" 
                      icon={<GlobalOutlined />}
                      onClick={convertToSOAPService}
                      style={{ fontSize: '11px' }}
                      type={isSOAPService() ? 'primary' : 'default'}
                    >
                      SOAP
                    </Button>
                    <Button 
                      size="small" 
                      icon={<ApiOutlined />}
                      onClick={convertToRESTService}
                      style={{ fontSize: '11px' }}
                      type={!isSOAPService() ? 'primary' : 'default'}
                    >
                      REST
                    </Button>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {isSOAPService() ? '🌐 XML' : '🔧 JSON'}
                    </Text>
                  </Space>
                </div>
              }>
                <ResizableMonacoEditor
                  height="200px"
                  language={syntaxType}
                  theme="vs"
                  value={staticResponse}
                  onChange={(value) => setStaticResponse(value || '')}
                  minHeight={120}
                  maxHeight={600}
                />
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {syntaxType === 'xml' ? (
                      validateXML(staticResponse) ? (
                        <Text type="success">✓ Корректный XML</Text>
                      ) : staticResponse.trim() ? (
                        <Text type="danger">✗ Некорректный XML</Text>
                      ) : (
                        <Text style={{ color: '#25606f' }}>📝 XML содержимое</Text>
                      )
                    ) : validateJSON(staticResponse) ? (
                      <Text type="success">✓ Корректный JSON</Text>
                    ) : staticResponse.trim() ? (
                      <Text type="danger">✗ Некорректный JSON</Text>
                    ) : (
                      <Text style={{ color: '#25606f' }}>📝 JSON содержимое</Text>
                    )}
                  </Text>
                  <Button 
                    size="small" 
                    type="link" 
                    onClick={() => {
                      if (syntaxType === 'xml') {
                        setStaticResponse(formatXML(staticResponse))
                      } else {
                        setStaticResponse(formatJSON(staticResponse))
                      }
                    }}
                  >
                    Форматировать
                  </Button>
                </div>
              </Form.Item>

              <Form.Item label={
                <Space>
                  HTTP Заголовки
                  <Button.Group size="small">
                    <Button 
                      type={headersViewMode === 'table' ? 'primary' : 'default'}
                      onClick={() => switchHeadersView('table')}
                    >
                      Таблица
                    </Button>
                    <Button 
                      type={headersViewMode === 'json' ? 'primary' : 'default'}
                      onClick={() => switchHeadersView('json')}
                    >
                      JSON
                    </Button>
                  </Button.Group>
                </Space>
              }>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {headersViewMode === 'table' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Button 
                          type="dashed" 
                          icon={<PlusOutlined />} 
                          onClick={addHeader}
                          size="small"
                        >
                          Добавить заголовок
                        </Button>
                        <Dropdown
                          overlay={
                            <Menu>
                              {popularHeaders.map((header, index) => (
                                <Menu.Item 
                                  key={index}
                                  onClick={() => addPopularHeader(header)}
                                >
                                  <Space>
                                    <Text strong>{header.key}:</Text>
                                    <Text type="secondary">{header.value}</Text>
                                  </Space>
                                </Menu.Item>
                              ))}
                            </Menu>
                          }
                        >
                          <Button size="small">
                            Популярные <DownOutlined />
                          </Button>
                        </Dropdown>
                      </div>
                      
                      {staticHeaders.length > 0 && (
                        <Table
                          dataSource={staticHeaders.map((header, index) => ({ ...header, index }))}
                          pagination={false}
                          size="small"
                          rowKey="index"
                          columns={[
                            {
                              title: 'Название заголовка',
                              dataIndex: 'key',
                              width: '40%',
                              render: (value: string, record: any) => (
                                <Input
                                  value={value}
                                  onChange={(e) => updateHeader(record.index, 'key', e.target.value)}
                                  placeholder="Content-Type"
                                  size="small"
                                />
                              )
                            },
                            {
                              title: 'Значение',
                              dataIndex: 'value',
                              width: '50%',
                              render: (value: string, record: any) => (
                                <Input
                                  value={value}
                                  onChange={(e) => updateHeader(record.index, 'value', e.target.value)}
                                  placeholder="application/json"
                              size="small"
                            />
                          )
                        },
                        {
                          title: '',
                          width: '10%',
                          render: (_: any, record: any) => (
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => removeHeader(record.index)}
                            />
                          )
                        }
                      ]}
                    />
                  )}
                  
                  {staticHeaders.length === 0 && (
                    <Alert
                      message="Нет заголовков"
                      description="Добавьте HTTP заголовки для ответа или выберите из популярных"
                      type="info"
                      showIcon
                    />
                  )}
                </>
              ) : (
                <>
                  <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px' }}>
                    <MonacoEditor
                      height="200px"
                      language="json"
                      theme="vs"
                      value={headersJson}
                      onChange={(value) => setHeadersJson(value || '')}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        fontSize: 12,
                        lineNumbers: 'on',
                        folding: true,
                        formatOnPaste: true,
                        formatOnType: true
                      }}
                    />
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {validateJSON(headersJson) ? (
                        <Text type="success">✓ Корректный JSON</Text>
                      ) : (
                        <Text type="danger">✗ Некорректный JSON</Text>
                      )}
                    </Text>
                    <Button 
                      size="small" 
                      type="link" 
                      onClick={() => setHeadersJson(formatJSON(headersJson))}
                    >
                      Форматировать
                    </Button>
                  </div>
                </>
              )}
                </Space>
              </Form.Item>
            </Card>
          )}

          {strategy === 'proxy' && (
            <Card title="🔗 Настройки проксирования" style={{ marginBottom: 24 }}>
              <Alert
                message="Логика проксирования"
                description="По умолчанию путь из mock сервиса НЕ добавляется к URL проксирования. Исключение: если в URL проксирования есть параметры {param}, они будут заменены значениями из запроса."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              <Form.Item
                name="proxy_url"
                label="URL для проксирования"
                rules={[{ required: true, message: 'Введите URL для проксирования' }]}
                tooltip="Запросы будут перенаправлены на этот URL. Примеры: https://api.example.com или https://api.example.com/users/{id}"
              >
                <Input placeholder="https://api.example.com" />
              </Form.Item>
              
              <Form.Item
                name="proxy_delay"
                label="Задержка ответа (секунды)"
                tooltip="Искусственная задержка перед выполнением проксирования"
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0.0" />
              </Form.Item>
            </Card>
          )}

          {strategy === 'conditional' && (
            <Card title="🎯 Настройки условного ответа" style={{ marginBottom: 24 }}>
              <Collapse ghost>
                <Panel 
                  header={
                    <Space>
                      <InfoCircleOutlined />
                      <Text strong>Справка по условным ответам и примеры кода</Text>
                    </Space>
                  } 
                  key="help"
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    {/* Информация о проксировании */}
                    <Alert
                      message="🔗 Проксирование в условном режиме"
                      description={
                        <div>
                          <Text>При выборе <Text code>response_type: "proxy"</Text> в условном ответе:</Text>
                          <br />
                          <Text>• Все заголовки из исходного запроса автоматически копируются</Text>
                          <br />
                          <Text>• Настройка заголовков в интерфейсе недоступна</Text>
                          <br />
                          <Text>• Логика идентична обычному режиму проксирования</Text>
                          <br />
                          <Text>• Поддерживается обработка сжатых ответов (gzip, deflate)</Text>
                          <br />
                          <Text>• <Text strong>Подстановка параметров:</Text></Text>
                          <br />
                          <Text type="secondary">  - Path параметры: <Text code>{`{id}`}</Text> из URL</Text>
                          <br />
                          <Text type="secondary">  - Переменные из Python скрипта: <Text code>{`{user_id}`}</Text>, <Text code>{`{is_admin}`}</Text> и т.д.</Text>
                          <br />
                          <Text type="secondary">  - Query параметры добавляются автоматически</Text>
                        </div>
                      }
                      type="info"
                      showIcon
                    />
                    
                    {/* Шаблоны кода */}
                    <div>
                      <Text strong style={{ fontSize: '14px' }}>📝 Шаблоны кода для быстрой вставки:</Text>
                      <div style={{ marginTop: 8 }}>
                        {getConditionalExamples().codeTemplates.map((template, i) => (
                          <Card 
                            key={i} 
                            size="small" 
                            style={{ marginBottom: 12 }}
                            title={
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text strong style={{ fontSize: '13px' }}>{template.title}</Text>
                                <Button 
                                  size="small" 
                                  type="primary"
                                  onClick={() => setConditionCode(conditionCode + '\n\n' + template.code)}
                                >
                                  Вставить код
                                </Button>
                              </Space>
                            }
                          >
                            <pre style={{ 
                              fontSize: '11px', 
                              margin: 0, 
                              backgroundColor: '#f8f9fa',
                              padding: '8px',
                              borderRadius: '4px',
                              border: '1px solid #e9ecef',
                              overflow: 'auto',
                              maxHeight: '150px'
                            }}>
                              {template.code}
                            </pre>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Быстрые условия */}
                    <div>
                      <Text strong style={{ fontSize: '14px' }}>⚡ Готовые условия:</Text>
                      <div style={{ marginTop: 8 }}>
                        {getConditionalExamples().quickConditions.map((cond, i) => (
                          <Tag 
                            key={i} 
                            style={{ 
                              margin: '4px 2px', 
                              cursor: 'pointer',
                              padding: '4px 8px',
                              fontSize: '12px'
                            }}
                            color="blue"
                            onClick={() => {
                              // Находим активный conditional response и добавляем условие
                              const newResponses = [...conditionalResponses]
                              if (newResponses.length === 0) {
                                // Если нет ответов, создаем новый
                                addConditionalResponse()
                                // Ждем обновления state и устанавливаем условие
                                setTimeout(() => {
                                  updateConditionalResponse(0, 'condition', cond.code)
                                }, 100)
                              } else {
                                // Обновляем последний ответ
                                updateConditionalResponse(newResponses.length - 1, 'condition', cond.code)
                              }
                            }}
                          >
                            {cond.label}
                          </Tag>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                        💡 Нажмите на условие чтобы добавить его в последний вариант ответа
                      </div>
                    </div>

                    {/* Старые примеры */}
                    <div>
                      <Text strong style={{ fontSize: '14px' }}>📚 Примеры использования:</Text>
                      <div style={{ marginTop: 8 }}>
                  {getConditionalExamples().examples.map((example, i) => (
                    <Card key={i} size="small" style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: '13px' }}>{example.title}</Text>
                            <pre style={{ 
                              fontSize: '11px', 
                              margin: '8px 0',
                              backgroundColor: '#f8f9fa',
                              padding: '6px',
                              borderRadius: '3px'
                            }}>
                              {example.code}
                            </pre>
                      {example.conditions.map((cond, j) => (
                              <div key={j} style={{ fontSize: '11px', marginLeft: 8, marginBottom: 2 }}>
                                                                 <Tag color="green">{cond.condition}</Tag>
                                <Text type="secondary" style={{ fontSize: '10px' }}> → {cond.response}</Text>
                        </div>
                      ))}
                    </Card>
                  ))}
                      </div>
                    </div>
                  </Space>
                </Panel>
              </Collapse>

              <Divider />

              <Row gutter={[16, 0]}>
                <Col span={8}>
                  <Form.Item name="conditional_status_code" label="Код ответа по умолчанию">
                    <InputNumber min={100} max={599} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="conditional_delay" label="Задержка по умолчанию (сек)">
                    <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Код для подготовки переменных">
                <ResizableMonacoEditor
                  height="200px"
                  language="python"
                  value={conditionCode}
                  onChange={(value) => setConditionCode(value || '')}
                  minHeight={150}
                  maxHeight={800}
                  options={{
                    fontSize: 14
                  }}
                />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Доступные переменные: request, headers, query, body, method, path, path_params, json
                  {pathParams.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      Path параметры: {pathParams.map(param => (
                        <Tag key={param} style={{ fontSize: '11px' }}>{param}</Tag>
                      ))}
                    </div>
                  )}
                </Text>
              </Form.Item>

              {conditionalResponses.map((response, index) => (
                <Card 
                  key={index} 
                  size="small" 
                  style={{ marginBottom: 16 }}
                  title={`Вариант ${index + 1}`}
                  extra={
                    <Button 
                      type="text" 
                      danger 
                      icon={<MinusCircleOutlined />} 
                      onClick={() => removeConditionalResponse(index)}
                    />
                  }
                >
                  <Row gutter={[16, 8]}>
                    <Col span={12}>
                      <Text strong>Условие:</Text>
                      <Input
                        placeholder="user_id > 0"
                        value={response.condition}
                        onChange={(e) => updateConditionalResponse(index, 'condition', e.target.value)}
                        style={{ marginTop: 4 }}
                      />
                    </Col>
                    <Col span={6}>
                      <Text strong>Код ответа:</Text>
                      <InputNumber
                        min={100}
                        max={599}
                        value={response.status_code}
                        onChange={(value) => updateConditionalResponse(index, 'status_code', value)}
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </Col>
                    <Col span={6}>
                      <Text strong>Задержка (сек):</Text>
                      <InputNumber
                        min={0}
                        step={0.1}
                        value={response.delay}
                        onChange={(value) => updateConditionalResponse(index, 'delay', value)}
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </Col>
                  </Row>
                  
                  <Row gutter={[16, 8]} style={{ marginTop: 12 }}>
                    <Col span={8}>
                      <Text strong>Тип ответа:</Text>
                      <Select
                        value={response.response_type || 'static'}
                        onChange={(value) => updateConditionalResponse(index, 'response_type', value)}
                        style={{ width: '100%', marginTop: 4 }}
                      >
                        <Option value="static">
                          <Space>
                            <CodeOutlined />
                            Статический ответ
                          </Space>
                        </Option>
                        <Option value="proxy">
                          <Space>
                            <LinkOutlined />
                            Проксирование
                          </Space>
                        </Option>
                      </Select>
                    </Col>
                  </Row>
                  
                  <Row gutter={[16, 8]} style={{ marginTop: 12 }}>
                    <Col span={24}>
                      {response.response_type === 'proxy' ? (
                        <>
                          <Text strong>URL для проксирования:</Text>
                          <Input
                            placeholder="https://api.example.com/endpoint"
                            value={response.proxy_url || ''}
                            onChange={(e) => updateConditionalResponse(index, 'proxy_url', e.target.value)}
                            style={{ marginTop: 4 }}
                          />
                          <Alert
                            message="⚠️ Режим проксирования"
                            description="В режиме проксирования HTTP заголовки автоматически копируются из исходного запроса. Настройка заголовков недоступна."
                            type="warning"
                            showIcon
                            style={{ marginTop: 8 }}
                          />
                        </>
                      ) : (
                        <>
                          <Text strong>Ответ:</Text>
                      <div style={{ marginTop: 8 }}>
                        <ResizableMonacoEditor
                           height="120px"
                           language={isSOAPService() ? "xml" : "json"}
                           theme="vs"
                           value={response.response || ''}
                           onChange={(value) => updateConditionalResponse(index, 'response', value || '')}
                           minHeight={100}
                           maxHeight={500}
                           options={{
                             folding: false
                           }}
                         />
                        <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {isSOAPService() ? (
                              response.response && validateXML(response.response) ? (
                                <Text type="success">✓ Корректный XML</Text>
                              ) : response.response && response.response.trim() ? (
                                <Text type="danger">✗ Некорректный XML</Text>
                              ) : response.response ? (
                                <Text style={{ color: '#25606f' }}>📝 XML содержимое</Text>
                              ) : null
                            ) : response.response && validateJSON(response.response) ? (
                              <Text type="success">✓ Корректный JSON</Text>
                            ) : response.response && response.response.trim() ? (
                              <Text type="danger">✗ Некорректный JSON</Text>
                            ) : response.response ? (
                              <Text style={{ color: '#25606f' }}>📝 JSON содержимое</Text>
                            ) : null}
                          </Text>
                          {response.response && (
                            <Button 
                              size="small" 
                              type="link" 
                              onClick={() => {
                                if (isSOAPService()) {
                                  updateConditionalResponse(index, 'response', formatXML(response.response || ''))
                                } else {
                                  updateConditionalResponse(index, 'response', formatJSON(response.response || ''))
                                }
                              }}
                            >
                              Форматировать
                            </Button>
                          )}
                        </div>
                      </div>
                        </>
                      )}
                    </Col>
                  </Row>

                  {/* Показываем заголовки только для статических ответов */}
                  {response.response_type !== 'proxy' && (
                  <Row gutter={[16, 8]} style={{ marginTop: 12 }}>
                    <Col span={24}>
                      <Form.Item label={
                        <Space>
                          HTTP Заголовки
                          <Button.Group size="small">
                            <Button 
                              type={conditionalHeadersViewMode === 'table' ? 'primary' : 'default'}
                              onClick={() => switchConditionalHeadersView('table', index)}
                            >
                              Таблица
                            </Button>
                            <Button 
                              type={conditionalHeadersViewMode === 'json' ? 'primary' : 'default'}
                              onClick={() => switchConditionalHeadersView('json', index)}
                            >
                              JSON
                            </Button>
                          </Button.Group>
                        </Space>
                      }>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          {conditionalHeadersViewMode === 'table' ? (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Button 
                                  type="dashed" 
                                  icon={<PlusOutlined />} 
                                  onClick={() => addConditionalHeader(index)}
                                  size="small"
                                >
                                  Добавить заголовок
                                </Button>
                                <Dropdown
                                  overlay={
                                    <Menu>
                                      {popularHeaders.map((header, headerIndex) => (
                                        <Menu.Item 
                                          key={headerIndex}
                                          onClick={() => addPopularConditionalHeader(index, header)}
                                        >
                                          <Space>
                                            <Text strong>{header.key}:</Text>
                                            <Text type="secondary">{header.value}</Text>
                                          </Space>
                                        </Menu.Item>
                                      ))}
                                    </Menu>
                                  }
                                >
                                  <Button size="small">
                                    Популярные <DownOutlined />
                                  </Button>
                                </Dropdown>
                              </div>
                              
                              {getConditionalHeaders(index).length > 0 ? (
                                <Table
                                  dataSource={getConditionalHeaders(index).map((header, headerIndex) => ({ ...header, index: headerIndex }))}
                                  pagination={false}
                                  size="small"
                                  rowKey="index"
                                  columns={[
                                    {
                                      title: 'Название',
                                      dataIndex: 'key',
                                      width: '40%',
                                      render: (value: string, record: any) => (
                                        <Input
                                          value={value}
                                          onChange={(e) => updateConditionalHeader(index, record.index, 'key', e.target.value)}
                                          placeholder="Content-Type"
                                          size="small"
                                        />
                                      )
                                    },
                                    {
                                      title: 'Значение',
                                      dataIndex: 'value',
                                      width: '50%',
                                      render: (value: string, record: any) => (
                                        <Input
                                          value={value}
                                          onChange={(e) => updateConditionalHeader(index, record.index, 'value', e.target.value)}
                                          placeholder="application/json"
                                          size="small"
                                        />
                                      )
                                    },
                                    {
                                      title: '',
                                      width: '10%',
                                      render: (_: any, record: any) => (
                                        <Button
                                          type="text"
                                          danger
                                          size="small"
                                          icon={<DeleteOutlined />}
                                          onClick={() => removeConditionalHeader(index, record.index)}
                                        />
                                      )
                                    }
                                  ]}
                                />
                              ) : (
                                <Alert
                                  message="Заголовки по умолчанию"
                                  description="Добавьте заголовки для этого варианта ответа"
                                  type="info"
                                  showIcon
                                  style={{ fontSize: '12px' }}
                                />
                              )}
                            </>
                          ) : (
                            <>
                              <ResizableMonacoEditor
                                height="200px"
                                language="json"
                                theme="vs"
                                value={conditionalHeadersJson[index] || '{\n  "Content-Type": "application/json"\n}'}
                                onChange={(value) => {
                                  setConditionalHeadersJson(prev => ({ 
                                    ...prev, 
                                    [index]: value || '{\n  "Content-Type": "application/json"\n}' 
                                  }))
                                }}
                                minHeight={120}
                                maxHeight={400}
                              />
                              <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                  {validateJSON(conditionalHeadersJson[index] || '{}') ? (
                                    <Text type="success">✓ Корректный JSON</Text>
                                  ) : (
                                    <Text type="danger">✗ Некорректный JSON</Text>
                                  )}
                                </Text>
                                <Button 
                                  size="small" 
                                  type="link" 
                                  onClick={() => {
                                    const formatted = formatJSON(conditionalHeadersJson[index] || '{}')
                                    setConditionalHeadersJson(prev => ({ 
                                      ...prev, 
                                      [index]: formatted 
                                    }))
                                  }}
                                >
                                  Форматировать
                                </Button>
                              </div>
                            </>
                          )}
                        </Space>
                      </Form.Item>
                    </Col>
                  </Row>
                  )}
                </Card>
              ))}

              {/* Кнопка добавления вариантов ответов */}
              {conditionalResponses.length === 0 ? (
                // Empty State когда нет вариантов
                <Card style={{ marginTop: 16, textAlign: 'center', padding: '24px 16px' }}>
                  <Space direction="vertical" size="large">
                    <div>
                      <ApiOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
                    </div>
                    <div>
                      <Text strong style={{ fontSize: '16px' }}>Добавьте варианты ответов</Text>
                      <br />
                      <Text type="secondary">
                        Создайте условия для возврата разных ответов в зависимости от данных запроса
                      </Text>
                    </div>
                    <Button 
                      type="primary"
                      size="large"
                      icon={<PlusOutlined />} 
                      onClick={addConditionalResponse}
                    >
                      Добавить первый вариант
                    </Button>
                  </Space>
                </Card>
              ) : (
                // Обычная кнопка когда уже есть варианты
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <Button 
                    type="dashed" 
                    size="large"
                    icon={<PlusOutlined />} 
                    onClick={addConditionalResponse}
                    style={{ width: '300px', height: '50px', fontSize: '14px' }}
                  >
                    Добавить еще один вариант
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Кнопки управления */}
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => navigate('/services')}>
                Отмена
              </Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                icon={<SaveOutlined />}
              >
                {isEditing ? 'Обновить' : 'Создать'}
              </Button>
            </Space>
          </div>
        </Form>
      </Space>
    </div>
  )
}

export default MockServiceForm