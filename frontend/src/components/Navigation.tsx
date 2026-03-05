import React from 'react'
import { Layout, Menu, Typography, Space, Badge, Tooltip } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import { useServerInfo } from '../contexts/ServerContext'
import {
  ApiOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  PlusOutlined,
  DashboardOutlined,
  SettingOutlined,
  RocketOutlined,
  GlobalOutlined,
  BookOutlined
} from '@ant-design/icons'

const { Sider } = Layout
const { Text } = Typography

const Navigation: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { serverInfo } = useServerInfo()

  const menuItems = [
    {
      key: '/services',
      icon: <DashboardOutlined />,
      label: (
        <Space>
          <span>Мои сервисы</span>
          <Badge count={0} showZero={false} />
        </Space>
      ),
    },
    {
      key: '/services/new',
      icon: <PlusOutlined />,
      label: (
        <Space>
          <span>Создать сервис</span>
          <RocketOutlined style={{ fontSize: '12px', opacity: 0.6 }} />
        </Space>
      ),
    },
    {
      key: '/swagger-import',
      icon: <ApiOutlined />,
      label: (
        <Space>
          <span>Импорт Swagger</span>
          <Badge count="NEW" style={{ backgroundColor: '#3a7a8a', fontSize: '10px' }} />
        </Space>
      ),
    },
    {
      key: '/wsdl-import',
      icon: <GlobalOutlined />,
      label: (
        <Space>
          <span>Импорт WSDL</span>
          <Badge count="SOAP" style={{ backgroundColor: '#25606f', fontSize: '10px' }} />
        </Space>
      ),
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: (
        <Space>
          <span>Логи запросов</span>
          <Badge dot status="processing" />
        </Space>
      ),
    },
    {
      key: 'swagger-docs',
      icon: <BookOutlined />,
      label: (
        <Space>
          <span>Документация</span>
          <Badge count="Swagger" style={{ backgroundColor: '#52c41a', fontSize: '9px' }} />
        </Space>
      ),
    },
  ]

  const bottomMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Настройки',
      disabled: true,
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'swagger-docs') {
      // Открываем Swagger документацию в новой вкладке
      const baseUrl = serverInfo?.base_url || 'http://0.0.0.0:8080'
      window.open(`${baseUrl}/docs`, '_blank')
    } else {
      navigate(key)
    }
  }

  return (
    <Sider 
      width={280} 
      style={{
        background: 'linear-gradient(135deg, #1a4a57 0%, #25606f 50%, #0f3940 100%)',
        boxShadow: '4px 0 20px rgba(37, 96, 111, 0.2)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Логотип SaveLink */}
      <div
        className="app-logo"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 16px',
          margin: '20px 24px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          minHeight: 64,
        }}
      >
        <a
          href="https://save-link.ru/?utm_source=tools&utm_medium=referral&utm_campaign=mock-service&utm_content=logo"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            textDecoration: 'none',
          }}
        >
          <img
            src="/images/logo-savelink.png"
            alt="SaveLink"
            className="logo-full"
            style={{ height: 32, maxWidth: 180, objectFit: 'contain' }}
          />
          <img
            src="/images/logo-savelink-small-transparent.png"
            alt="SaveLink"
            className="logo-small"
            style={{ height: 36, width: 36, objectFit: 'contain', display: 'none' }}
          />
        </a>
      </div>

      {/* Основное меню */}
      <div style={{ padding: '0 16px' }}>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '14px',
          }}
          className="custom-menu"
        />
      </div>

      {/* Статистика */}
      <div style={{
        margin: '24px 24px 16px 24px',
        padding: '16px',
        background: 'rgba(58, 122, 138, 0.15)',
        borderRadius: '12px',
        border: '1px solid rgba(58, 122, 138, 0.2)',
      }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {serverInfo && (
            <Text style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: '12px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '200px',
              display: 'block',
              textAlign: 'center'
            }}>
              API {serverInfo.base_url.replace('http://', '').replace('https://', '')}
            </Text>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            
          </div>
        </Space>
      </div>

      {/* Нижнее меню */}
      <div style={{ 
        position: 'absolute', 
        bottom: '20px', 
        left: '16px', 
        right: '16px' 
      }}>
        <Menu
          mode="inline"
          items={bottomMenuItems}
          style={{
            background: 'transparent',
            border: 'none',
          }}
          className="custom-menu"
        />
        
        {/* Версия */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '16px',
          padding: '8px',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '11px'
        }}>
          v1.0.0
        </div>
      </div>


    </Sider>
  )
}

export default Navigation 