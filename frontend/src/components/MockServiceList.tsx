import React, { useState, useEffect } from 'react'
import { 
  Table, Button, Space, Tag, Switch, Popconfirm, message, 
  Card, Typography, Input, Select, Row, Col, Statistic, 
  Badge, Tooltip, Divider, Alert, Empty, Collapse, Modal, Form
} from 'antd'
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  ApiOutlined, LinkOutlined, CodeOutlined, SearchOutlined,
  FilterOutlined, ReloadOutlined, SettingOutlined, BugOutlined,
  GroupOutlined, UnorderedListOutlined, PoweroffOutlined,
  ExclamationCircleOutlined, SaveOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { MockService } from '@/types'
import { MockServiceAPI } from '@/api/mockService'
import { useServerInfo } from '@/contexts/ServerContext'
import { copyWithNotification } from '@/utils/clipboard'

const { Title, Text, Paragraph } = Typography
const { Search } = Input
const { Option } = Select
const { Panel } = Collapse

const MockServiceList: React.FC = () => {
  const navigate = useNavigate()
  const { serverInfo } = useServerInfo()
  const [services, setServices] = useState<MockService[]>([])
  const [filteredServices, setFilteredServices] = useState<MockService[]>([])
  const [loading, setLoading] = useState(false)
  
  // Функции для работы с localStorage
  const getStoredValue = <T,>(key: string, defaultValue: T): T => {
    try {
      const stored = localStorage.getItem(`mock-service-${key}`)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  }

  const setStoredValue = <T,>(key: string, value: T): void => {
    try {
      localStorage.setItem(`mock-service-${key}`, JSON.stringify(value))
    } catch (error) {
      console.error('Ошибка сохранения в localStorage:', error)
    }
  }

  const clearAllStoredSettings = (): void => {
    try {
      const keys = [
        'searchText',
        'strategyFilter', 
        'statusFilter',
        'groupByEndpoint',
        'groupByPrefix',
        'expandedGroups',
        'pagination'
      ]
      keys.forEach(key => localStorage.removeItem(`mock-service-${key}`))
    } catch (error) {
      console.error('Ошибка очистки localStorage:', error)
    }
  }

  // Состояния с сохранением в localStorage
  const [searchText, setSearchText] = useState(() => getStoredValue('searchText', ''))
  const [strategyFilter, setStrategyFilter] = useState<string>(() => getStoredValue('strategyFilter', 'all'))
  const [statusFilter, setStatusFilter] = useState<string>(() => getStoredValue('statusFilter', 'all'))
  const [groupByEndpoint, setGroupByEndpoint] = useState(() => getStoredValue('groupByEndpoint', false))
  const [groupByPrefix, setGroupByPrefix] = useState(() => getStoredValue('groupByPrefix', false))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const stored = getStoredValue('expandedGroups', [] as string[])
    return new Set(stored)
  })
  
  // Состояние пагинации
  const [pagination, setPagination] = useState(() => getStoredValue('pagination', {
    current: 1,
    pageSize: 10,
    showSizeChanger: true,
    showQuickJumper: true,
  }))

  // Состояние для массового изменения proxy URL
  const [proxyModalVisible, setProxyModalVisible] = useState(false)
  const [selectedGroupServices, setSelectedGroupServices] = useState<MockService[]>([])
  const [proxyForm] = Form.useForm()

  useEffect(() => {
    loadServices()
  }, [])

  useEffect(() => {
    applyFilters()
    // Сбрасываем пагинацию при изменении фильтров
    setPagination(prev => ({ ...prev, current: 1 }))
  }, [services, searchText, strategyFilter, statusFilter])

  // Сохранение настроек в localStorage при изменении
  useEffect(() => {
    setStoredValue('searchText', searchText)
  }, [searchText])

  useEffect(() => {
    setStoredValue('strategyFilter', strategyFilter)
  }, [strategyFilter])

  useEffect(() => {
    setStoredValue('statusFilter', statusFilter)
  }, [statusFilter])

  useEffect(() => {
    setStoredValue('groupByEndpoint', groupByEndpoint)
  }, [groupByEndpoint])

  useEffect(() => {
    setStoredValue('groupByPrefix', groupByPrefix)
  }, [groupByPrefix])

  useEffect(() => {
    setStoredValue('expandedGroups', Array.from(expandedGroups))
  }, [expandedGroups])

  useEffect(() => {
    setStoredValue('pagination', pagination)
  }, [pagination])

  // Функция для извлечения базового пути для группировки
  const extractBasePath = (path: string): string => {
    // Удаляем параметры {id}, {userId} и т.д.
    const pathWithoutParams = path.replace(/\{[^}]+\}/g, '')
    // Разбиваем на части и берем первые 2-3 части пути
    const parts = pathWithoutParams.split('/').filter(p => p.length > 0)
    
    if (parts.length === 0) {
      return '/'
    } else if (parts.length === 1) {
      return `/${parts[0]}`
    } else {
      // Для SOAP сервисов группируем только по первому сегменту (/soap)
      if (parts[0].toLowerCase() === 'soap' || parts[0].toLowerCase() === 'ws') {
        return `/${parts[0]}`
      }
      // Для REST API группируем по первым двум сегментам (/api/users)
      return `/${parts.slice(0, 2).join('/')}`
    }
  }

  // Функция для извлечения префикса имени для группировки
  const extractNamePrefix = (name: string): string => {
    // Ищем разделители в имени: подчеркивание, дефис, точка, пробел
    const separators = ['_', '-', '.', ' ']
    
    for (const separator of separators) {
      if (name.includes(separator)) {
        const parts = name.split(separator)
        // Берем первую часть как префикс, если она не пустая
        if (parts[0] && parts[0].length > 0) {
          return parts[0]
        }
      }
    }
    
    // Если нет разделителей, берем первые 3 символа (если имя длиннее 3 символов)
    if (name.length > 3) {
      return name.substring(0, 3).toUpperCase()
    }
    
    // Если имя короткое, возвращаем его целиком
    return name
  }

  // Функция для группировки сервисов
  const groupServices = (services: MockService[]) => {
    const groups: { [key: string]: MockService[] } = {}
    
    services.forEach(service => {
      let groupKey: string
      
      if (groupByPrefix) {
        // Группировка по префиксу имени
        groupKey = extractNamePrefix(service.name)
      } else {
        // Группировка по пути (по умолчанию)
        groupKey = extractBasePath(service.path)
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(service)
    })

    return groups
  }

  /** Ключ группы для сервиса (совпадает с логикой groupServices). */
  const getServiceGroupKey = (service: MockService): string =>
    groupByPrefix ? extractNamePrefix(service.name) : extractBasePath(service.path)

  type GroupStrategyStatus = 'all_proxy' | 'has_conditional' | 'has_mock'

  /**
   * Состояние стратегий в группе: мок (static) важнее условного, чем прокси.
   * Считается по полному списку сервисов группы, не по отфильтрованному виду.
   */
  const getGroupStrategyStatus = (groupMembers: MockService[]): GroupStrategyStatus => {
    if (groupMembers.some(s => s.strategy === 'static')) return 'has_mock'
    if (groupMembers.some(s => s.strategy === 'conditional')) return 'has_conditional'
    return 'all_proxy'
  }

  const groupStrategyIndicatorConfig: Record<
    GroupStrategyStatus,
    { color: string; title: string; description: string }
  > = {
    all_proxy: {
      color: '#52c41a',
      title: 'Проксирование',
      description: 'Все эндпоинты группы работают в режиме проксирования.',
    },
    has_conditional: {
      color: '#faad14',
      title: 'Условный ответ',
      description: 'В группе есть эндпоинты с условным ответом (без мока со статикой).',
    },
    has_mock: {
      color: '#ff4d4f',
      title: 'Мок',
      description: 'В группе есть эндпоинты со статичным моком.',
    },
  }

  const renderGroupStrategyIndicator = (status: GroupStrategyStatus) => {
    const cfg = groupStrategyIndicatorConfig[status]
    return (
      <Tooltip
        title={
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{cfg.title}</div>
            <div style={{ fontSize: 12 }}>{cfg.description}</div>
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.85 }}>
              Учитываются все сервисы группы, не только попавшие в поиск и фильтры.
            </div>
          </div>
        }
      >
        <span
          aria-label={cfg.title}
          style={{
            display: 'inline-block',
            width: 11,
            height: 11,
            borderRadius: '50%',
            backgroundColor: cfg.color,
            boxShadow: `0 0 0 2px ${cfg.color}33`,
            flexShrink: 0,
            cursor: 'help',
          }}
        />
      </Tooltip>
    )
  }

  const loadServices = async () => {
    try {
      setLoading(true)
      const data = await MockServiceAPI.getMockServices()
      setServices(data)
      
      // Автоматически включаем группировку если найдено много сервисов с общими путями или префиксами
      if (data.length > 10) {
        // Проверяем группировку по путям
        const pathGroups = data.reduce((groups: { [key: string]: MockService[] }, service) => {
          const basePath = extractBasePath(service.path)
          if (!groups[basePath]) groups[basePath] = []
          groups[basePath].push(service)
          return groups
        }, {})
        
        // Проверяем группировку по префиксам имен
        const prefixGroups = data.reduce((groups: { [key: string]: MockService[] }, service) => {
          const prefix = extractNamePrefix(service.name)
          if (!groups[prefix]) groups[prefix] = []
          groups[prefix].push(service)
          return groups
        }, {})
        
        const hasLargePathGroups = Object.values(pathGroups).some(group => group.length > 3)
        const hasLargePrefixGroups = Object.values(prefixGroups).some(group => group.length > 3)
        
        if (hasLargePathGroups && !groupByEndpoint && !groupByPrefix) {
          setGroupByEndpoint(true)
          message.info('Автоматически включена группировка по путям для удобного просмотра')
        } else if (hasLargePrefixGroups && !groupByEndpoint && !groupByPrefix) {
          setGroupByPrefix(true)
          message.info('Автоматически включена группировка по префиксам имен для удобного просмотра')
        }
      }
    } catch (error) {
      message.error('Ошибка загрузки сервисов')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...services]

    // Поиск по тексту
    if (searchText) {
      filtered = filtered.filter(service =>
        service.name.toLowerCase().includes(searchText.toLowerCase()) ||
        service.path.toLowerCase().includes(searchText.toLowerCase())
      )
    }

    // Фильтр по стратегии
    if (strategyFilter !== 'all') {
      filtered = filtered.filter(service => service.strategy === strategyFilter)
    }

    // Фильтр по статусу
    if (statusFilter !== 'all') {
      const isActive = statusFilter === 'active'
      filtered = filtered.filter(service => service.is_active === isActive)
    }

    setFilteredServices(filtered)
  }

  const handleDelete = async (id: number) => {
    try {
      await MockServiceAPI.deleteMockService(id)
      message.success('Сервис удален')
      loadServices()
    } catch (error) {
      message.error('Ошибка удаления сервиса')
    }
  }

  const handleToggleStatus = async (service: MockService) => {
    try {
      await MockServiceAPI.updateMockService(service.id, {
        is_active: !service.is_active
      })
      message.success(`Сервис ${!service.is_active ? 'активирован' : 'деактивирован'}`)
      loadServices()
    } catch (error) {
      message.error('Ошибка изменения статуса')
    }
  }

  // Массовые действия для групп
  const handleGroupToggle = async (groupServices: MockService[], isActive: boolean) => {
    try {
      const promises = groupServices.map(service => 
        MockServiceAPI.updateMockService(service.id, {
          is_active: isActive
        })
      )
      await Promise.all(promises)
      message.success(`${isActive ? 'Включено' : 'Отключено'} ${groupServices.length} сервисов`)
      loadServices()
    } catch (error) {
      message.error('Ошибка массового изменения статуса')
    }
  }

  const handleGroupDelete = async (groupServices: MockService[]) => {
    try {
      const promises = groupServices.map(service => 
        MockServiceAPI.deleteMockService(service.id)
      )
      await Promise.all(promises)
      message.success(`Удалено ${groupServices.length} сервисов`)
      loadServices()
    } catch (error) {
      message.error('Ошибка массового удаления')
    }
  }

  const handleGroupProxyUpdate = async (groupServices: MockService[], newProxyUrl: string) => {
    try {
      const promises = groupServices.map(service => 
        MockServiceAPI.updateMockService(service.id, {
          proxy_url: newProxyUrl
        })
      )
      await Promise.all(promises)
      message.success(`Обновлен proxy URL для ${groupServices.length} сервисов`)
      loadServices()
      setProxyModalVisible(false)
      proxyForm.resetFields()
    } catch (error) {
      message.error('Ошибка массового обновления proxy URL')
    }
  }

  const showProxyModal = (groupServices: MockService[]) => {
    setSelectedGroupServices(groupServices)
    // Устанавливаем текущий proxy URL как значение по умолчанию (берем из первого сервиса)
    const currentProxyUrl = groupServices[0]?.proxy_url || ''
    proxyForm.setFieldsValue({ proxyUrl: currentProxyUrl })
    setProxyModalVisible(true)
  }

  const getStrategyInfo = (strategy: string) => {
    switch (strategy) {
      case 'static':
        return { icon: <CodeOutlined />, color: 'blue', text: 'Статичный' }
      case 'proxy':
        return { icon: <LinkOutlined />, color: 'green', text: 'Проксирование' }
      case 'conditional':
        return { icon: <ApiOutlined />, color: 'purple', text: 'Условный' }
      default:
        return { icon: <SettingOutlined />, color: 'default', text: strategy }
    }
  }

  const getMethodsTags = (methods: string[]) => {
    const colors: { [key: string]: string } = {
      'GET': 'green',
      'POST': 'blue',
      'PUT': 'orange',
      'DELETE': 'red',
      'PATCH': 'purple'
    }

    return methods.map(method => (
      <Tag key={method} color={colors[method] || 'default'}>
        {method}
      </Tag>
    ))
  }

  const extractPathParams = (path: string): string[] => {
    const regex = /{([^}]+)}/g
    const params: string[] = []
    let match
    while ((match = regex.exec(path)) !== null) {
      params.push(match[1])
    }
    return params
  }

  const getFullUrl = (path: string): string => {
    if (!serverInfo) return path
    return `${serverInfo.mock_base_url}${path}`
  }

  const getStats = () => {
    const total = services.length
    const active = services.filter(s => s.is_active).length
    const inactive = total - active
    
    const byStrategy = services.reduce((acc, service) => {
      acc[service.strategy] = (acc[service.strategy] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const groups = groupServices(services)
    const groupCount = Object.keys(groups).length

    return { total, active, inactive, byStrategy, groupCount, groups }
  }

  const stats = getStats()

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MockService) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {record.is_active ? (
              <Badge status="success" />
            ) : (
              <Badge status="default" />
            )}
            <span style={{ marginLeft: 8 }}>{name}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Text code style={{ fontSize: '11px' }}>{getFullUrl(record.path)}</Text>
              <Button
                type="text"
                size="small"
                icon={<LinkOutlined />}
                onClick={(e) => {
                  e.stopPropagation()
                  copyWithNotification(getFullUrl(record.path), 'URL скопирован в буфер обмена')
                }}
                style={{ padding: '0 4px', height: '20px' }}
                title="Скопировать URL"
              />
            </div>
            {extractPathParams(record.path).length > 0 && (
              <Tooltip title={`Параметры: ${extractPathParams(record.path).join(', ')}`}>
                <Tag style={{ marginTop: 4, fontSize: '11px' }}>
                  {extractPathParams(record.path).length} param
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Методы',
      dataIndex: 'methods',
      key: 'methods',
      render: (methods: string[]) => (
        <Space wrap>
          {getMethodsTags(methods)}
        </Space>
      ),
    },
    {
      title: 'Стратегия',
      dataIndex: 'strategy',
      key: 'strategy',
      render: (strategy: string) => {
        const info = getStrategyInfo(strategy)
        return (
          <Tag icon={info.icon} color={info.color}>
            {info.text}
          </Tag>
        )
      },
    },
    {
      title: 'Статус',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean, record: MockService) => (
        <Switch
          checked={isActive}
          onChange={() => handleToggleStatus(record)}
          checkedChildren="ВКЛ"
          unCheckedChildren="ВЫКЛ"
          size="small"
        />
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: MockService) => (
        <Space size="small">
          <Tooltip title="Просмотреть логи">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/logs/${record.id}`)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => navigate(`/services/${record.id}/edit`)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="Удалить">
            <Popconfirm
              title="Удалить сервис?"
              description="Это действие нельзя отменить"
              onConfirm={() => handleDelete(record.id)}
              okText="Да"
              cancelText="Отмена"
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div className="fade-in">
      {/* Современный заголовок */}
      <div style={{ 
        background: 'linear-gradient(135deg, #1a4a57 0%, #25606f 50%, #3a7a8a 100%)',
        borderRadius: '20px',
        padding: '32px',
        marginBottom: '32px',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(37, 96, 111, 0.3)',
      }}>
        {/* Декоративные элементы */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '200px',
          height: '200px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30px',
          left: '-30px',
          width: '150px',
          height: '150px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          filter: 'blur(30px)',
        }} />
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}>
          <div>
            <Space direction="vertical" size={4}>
              <Title level={1} style={{ 
                color: 'white', 
                margin: 0,
                fontSize: '32px',
                fontWeight: 700,
                textShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}>
                Mock Сервисы
              </Title>
              <Text style={{ 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontSize: '16px',
                fontWeight: 400
              }}>
                Управляйте и настраивайте ваши API моки
              </Text>
            </Space>
          </div>
          <div>
            <Space size="large">
              <Tooltip title="Обновить список всех mock сервисов. Загрузит последние изменения и статистику.">
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={loadServices}
                  loading={loading}
                  size="large"
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'white',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    fontWeight: 500,
                  }}
                  className="pulse-hover"
                >
                  Обновить
                </Button>
              </Tooltip>
              <Tooltip title="Создать новый mock сервис. Можно настроить статичные ответы, проксирование или условную логику.">
                <Button 
                  type="primary"
                  icon={<PlusOutlined />} 
                  onClick={() => navigate('/services/new')}
                  size="large"
                  style={{
                    background: 'rgba(255, 255, 255, 0.9)',
                    border: 'none',
                    color: '#667eea',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '15px',
                    height: '44px',
                    padding: '0 24px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  }}
                  className="pulse-hover"
                >
                  Создать сервис
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
      
      <div style={{ marginBottom: 24 }}>

        {/* Статистика */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Всего сервисов" value={stats.total} prefix={<ApiOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Активных" value={stats.active} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Неактивных" value={stats.inactive} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              {(groupByEndpoint || groupByPrefix) ? (
                <Statistic 
                  title={groupByPrefix ? "Групп по префиксам" : "Групп эндпоинтов"} 
                  value={stats.groupCount} 
                  prefix={<GroupOutlined />} 
                  valueStyle={{ color: '#25606f' }}
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: 8 }}>По стратегиям:</div>
                  <Space size="small">
                    {Object.entries(stats.byStrategy).map(([strategy, count]) => {
                      const info = getStrategyInfo(strategy)
                      return (
                        <Tag key={strategy} icon={info.icon} color={info.color}>
                          {count}
                        </Tag>
                      )
                    })}
                  </Space>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Фильтры */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Tooltip title="Поиск по названию сервиса или пути эндпоинта. Например: 'users' найдет все сервисы с 'users' в названии или пути.">
                <Search
                  placeholder="Поиск по названию или пути..."
                  allowClear
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  prefix={<SearchOutlined />}
                />
              </Tooltip>
            </Col>
            <Col span={6}>
              <Tooltip title="Фильтровать сервисы по типу обработки запросов: статичные (фиксированный ответ), проксирование (перенаправление) или условные (с логикой).">
                <Select
                  style={{ width: '100%' }}
                  placeholder="Фильтр по стратегии"
                  value={strategyFilter}
                  onChange={setStrategyFilter}
                  suffixIcon={<FilterOutlined />}
                >
                  <Option value="all">Все стратегии</Option>
                  <Option value="static">
                    <Space>
                      <CodeOutlined />
                      Статичный
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
                      Условный
                    </Space>
                  </Option>
                </Select>
              </Tooltip>
            </Col>
            <Col span={6}>
              <Tooltip title="Фильтровать по статусу сервиса. Активные сервисы обрабатывают запросы, неактивные - игнорируются.">
                <Select
                  style={{ width: '100%' }}
                  placeholder="Фильтр по статусу"
                  value={statusFilter}
                  onChange={setStatusFilter}
                >
                  <Option value="all">Все статусы</Option>
                  <Option value="active">Только активные</Option>
                  <Option value="inactive">Только неактивные</Option>
                </Select>
              </Tooltip>
            </Col>
            <Col span={3}>
              <Tooltip 
                title={
                  groupByEndpoint 
                    ? "Переключиться на обычный вид с полной таблицей всех сервисов"
                    : "Группировать сервисы по общим путям. Особенно полезно после импорта WSDL когда создается много похожих сервисов."
                }
              >
                <Button
                  style={{ width: '100%' }}
                  icon={groupByEndpoint ? <UnorderedListOutlined /> : <GroupOutlined />}
                  onClick={() => {
                    setGroupByEndpoint(!groupByEndpoint)
                    if (groupByPrefix) setGroupByPrefix(false)
                  }}
                  type={groupByEndpoint ? "primary" : "default"}
                >
                  {groupByEndpoint ? 'Обычный вид' : 'По путям'}
                </Button>
              </Tooltip>
            </Col>
            <Col span={3}>
              <Tooltip 
                title={
                  groupByPrefix 
                    ? "Переключиться на обычный вид с полной таблицей всех сервисов"
                    : "Группировать сервисы по префиксам имен. Полезно когда сервисы имеют общие префиксы в названиях."
                }
              >
                <Button
                  style={{ width: '100%' }}
                  icon={groupByPrefix ? <UnorderedListOutlined /> : <GroupOutlined />}
                  onClick={() => {
                    setGroupByPrefix(!groupByPrefix)
                    if (groupByEndpoint) setGroupByEndpoint(false)
                  }}
                  type={groupByPrefix ? "primary" : "default"}
                >
                  {groupByPrefix ? 'Обычный вид' : 'По префиксам'}
                </Button>
              </Tooltip>
            </Col>
          </Row>
        </Card>
      </div>

      {/* Список сервисов */}
      {filteredServices.length === 0 && !loading ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              services.length === 0 ? (
                <div>
                  <Text>Пока нет ни одного mock сервиса</Text>
                  <br />
                  <Tooltip title="Создать ваш первый mock сервис. Начните с простого статичного ответа или настройте проксирование к реальному API.">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/services/new')} style={{ marginTop: 16 }}>
                      Создать первый сервис
                    </Button>
                  </Tooltip>
                </div>
              ) : (
                <div>
                  <Text>Ничего не найдено по заданным фильтрам</Text>
                  <br />
                  <Tooltip title="Очистить все фильтры и вернуться к обычному виду. Покажет все сервисы без ограничений.">
                    <Button onClick={() => { 
                      setSearchText(''); 
                      setStrategyFilter('all'); 
                      setStatusFilter('all');
                      setGroupByEndpoint(false);
                      setGroupByPrefix(false);
                      setExpandedGroups(new Set());
                      setPagination({
                        current: 1,
                        pageSize: 10,
                        showSizeChanger: true,
                        showQuickJumper: true,
                      });
                      clearAllStoredSettings();
                    }} style={{ marginTop: 16 }}>
                      Сбросить фильтры и группировку
                    </Button>
                  </Tooltip>
                </div>
              )
            }
          />
        </Card>
      ) : (groupByEndpoint || groupByPrefix) ? (
        <div>
          {Object.entries(groupServices(filteredServices)).map(([basePath, groupedServices]) => {
            const fullGroupServices = services.filter(s => getServiceGroupKey(s) === basePath)
            const groupStrategyStatus = getGroupStrategyStatus(fullGroupServices)
            return (
            <Card key={basePath} style={{ marginBottom: 16 }}>
              <Collapse
                activeKey={expandedGroups.has(basePath) ? ['0'] : []}
                onChange={(keys) => {
                  if (keys.length > 0) {
                    setExpandedGroups(prev => new Set([...prev, basePath]))
                  } else {
                    setExpandedGroups(prev => {
                      const newSet = new Set(prev)
                      newSet.delete(basePath)
                      return newSet
                    })
                  }
                }}
                items={[
                  {
                    key: '0',
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Space align="center">
                          {renderGroupStrategyIndicator(groupStrategyStatus)}
                          <Tag color={groupByPrefix ? "#722ed1" : "#25606f"}>
                            {groupByPrefix ? `Префикс: ${basePath}` : basePath}
                          </Tag>
                          <Badge count={groupedServices.length} showZero style={{ backgroundColor: groupByPrefix ? '#8c4ed1' : '#3a7a8a' }} />
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {groupedServices.filter(s => s.is_active).length} активных
                          </Text>
                        </Space>
                        <Space size="small" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title={`Отключить все ${groupedServices.length} сервисов в группе ${basePath}. Отключенные сервисы не будут отвечать на запросы.`}>
                            <Button
                              size="small"
                              icon={<PoweroffOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleGroupToggle(groupedServices, false)
                              }}
                              style={{ color: '#ff7875' }}
                            />
                          </Tooltip>
                          <Tooltip title={`Включить все ${groupedServices.length} сервисов в группе ${basePath}. Включенные сервисы будут активно обрабатывать запросы.`}>
                            <Button
                              size="small" 
                              icon={<PoweroffOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleGroupToggle(groupedServices, true)
                              }}
                              style={{ color: '#52c41a' }}
                            />
                          </Tooltip>
                          <Tooltip title={`Изменить proxy URL для всех ${groupedServices.length} сервисов в группе ${basePath}. Это обновит адрес проксирования для всех сервисов группы.`}>
                            <Button
                              size="small"
                              icon={<LinkOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                showProxyModal(groupedServices)
                              }}
                              style={{ color: '#1890ff' }}
                            />
                          </Tooltip>
                          <Tooltip title={`Удалить все ${groupedServices.length} сервисов в группе ${basePath}. Это действие необратимо!`}>
                            <Popconfirm
                              title="Удалить всю группу?"
                              description={`Это действие удалит все ${groupedServices.length} сервисов в группе ${basePath}`}
                              onConfirm={(e) => {
                                e?.stopPropagation()
                                handleGroupDelete(groupedServices)
                              }}
                              okText="Да"
                              cancelText="Отмена"
                              icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                            >
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>
                          </Tooltip>
                        </Space>
                      </div>
                    ),
                    children: (
                      <Table
                        columns={columns}
                        dataSource={groupedServices}
                        rowKey="id"
                        pagination={false}
                        onRow={(record: MockService) => ({
                          onDoubleClick: () => {
                            navigate(`/services/${record.id}/edit`)
                          },
                          style: { cursor: 'pointer' }
                        })}
                        size="small"
                      />
                    )
                  }
                ]}
              />
            </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <Table
            columns={columns}
            dataSource={filteredServices}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              total: filteredServices.length,
              showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} сервисов`,
              onChange: (page, pageSize) => {
                setPagination(prev => ({
                  ...prev,
                  current: page,
                  pageSize: pageSize || prev.pageSize
                }))
              },
              onShowSizeChange: (current, size) => {
                setPagination(prev => ({
                  ...prev,
                  current: 1, // Сбрасываем на первую страницу при изменении размера
                  pageSize: size
                }))
              }
            }}
            onRow={(record: MockService) => ({
              onDoubleClick: () => {
                navigate(`/services/${record.id}/edit`)
              },
              style: { cursor: 'pointer' }
            })}
            size="small"
          />
        </Card>
      )}

      {/* Подсказки */}
      {services.length > 0 && (
        <Alert
          style={{ marginTop: 16 }}
          message="💡 Полезные подсказки"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Используйте <Text code>/api/users/{`{id}`}</Text> для создания параметризованных путей</li>
              <li>Статичные ответы подходят для простых заглушек</li>
              <li>Проксирование позволяет перенаправлять запросы на реальные API</li>
              <li>Условные ответы дают максимальную гибкость с Python кодом</li>
              <li>Группировка по путям помогает организовать сервисы из WSDL импорта по общим эндпоинтам</li>
              <li>Группировка по префиксам имен полезна когда сервисы имеют общие префиксы (например, Calculator_Add, Calculator_Subtract)</li>
              <li>В групповом режиме используйте кнопки для массовых действий: включение/отключение/удаление/изменение proxy URL всей группы</li>
              <li>Настройки фильтров, группировки и состояния сворачивания групп автоматически сохраняются в браузере</li>
            </ul>
          }
          type="info"
          showIcon
          closable
        />
      )}

      {/* Модальное окно для массового изменения proxy URL */}
      <Modal
        title={`Изменить proxy URL для группы (${selectedGroupServices.length} сервисов)`}
        open={proxyModalVisible}
        onOk={() => {
          proxyForm.validateFields().then(values => {
            handleGroupProxyUpdate(selectedGroupServices, values.proxyUrl)
          })
        }}
        onCancel={() => {
          setProxyModalVisible(false)
          proxyForm.resetFields()
        }}
        okText="Обновить"
        cancelText="Отмена"
        width={600}
      >
        <Form form={proxyForm} layout="vertical">
          <Form.Item
            label="Новый proxy URL"
            name="proxyUrl"
            rules={[
              { required: true, message: 'Введите proxy URL' },
              { type: 'url', message: 'Введите корректный URL' }
            ]}
            extra="Этот URL будет применен ко всем сервисам в группе. Убедитесь, что URL корректный и доступный."
          >
            <Input 
              placeholder="https://api.example.com" 
              size="large"
            />
          </Form.Item>
          
          <Alert
            message="Внимание"
            description={`Это действие обновит proxy URL для всех ${selectedGroupServices.length} сервисов в группе. Текущие настройки проксирования будут заменены.`}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <div style={{ fontSize: '12px', color: '#666' }}>
            <strong>Сервисы в группе:</strong>
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              {selectedGroupServices.map(service => (
                <li key={service.id}>
                  {service.name} ({service.path})
                </li>
              ))}
            </ul>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default MockServiceList 