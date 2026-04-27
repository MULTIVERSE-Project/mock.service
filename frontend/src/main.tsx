import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ConfigProvider } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import 'antd/dist/reset.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={ruRU}>
      <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || "/"}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
) 