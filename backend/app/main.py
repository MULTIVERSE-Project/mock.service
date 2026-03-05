from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import logging
import os
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from app.database import async_engine, Base
from app.api import mock_services, mock_handler, websocket, swagger, server_info, wsdl
from app.models import mock_service  # Импортируем модели для создания таблиц


def setup_application_logging():
    """Настройка логирования приложения с ротацией"""
    # Создаем директорию для логов
    logs_dir = os.getenv("LOG_DIR", "logs")
    os.makedirs(logs_dir, exist_ok=True)
    
    # Получаем настройки из переменных окружения
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    max_size_str = os.getenv("LOG_MAX_SIZE", "50MB")
    backup_count = int(os.getenv("LOG_BACKUP_COUNT", "10"))
    
    # Парсим размер
    def parse_size(size_str: str) -> int:
        size_str = size_str.upper().strip()
        if size_str.endswith('KB'):
            return int(size_str[:-2]) * 1024
        elif size_str.endswith('MB'):
            return int(size_str[:-2]) * 1024 * 1024
        elif size_str.endswith('GB'):
            return int(size_str[:-2]) * 1024 * 1024 * 1024
        else:
            return int(size_str)
    
    max_bytes = parse_size(max_size_str)
    
    # Настраиваем корневой логгер
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level))
    
    # Очищаем существующие обработчики
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Создаем форматтер
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Обработчик для файла с ротацией
    file_handler = RotatingFileHandler(
        os.path.join(logs_dir, "application.log"),
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    
    # Консольный вывод (для Docker)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    return root_logger


# Настройка логирования
logger = setup_application_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация и завершение работы приложения"""
    # Создание таблиц при запуске
    logger.info("Запуск Mock Service...")
    logger.info(f"Логи сохраняются в: {os.getenv('LOG_DIR', 'logs')}")
    logger.info(f"Размер лога: {os.getenv('LOG_MAX_SIZE', '50MB')}")
    logger.info(f"Количество файлов: {os.getenv('LOG_BACKUP_COUNT', '10')}")
    
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Таблицы созданы успешно")
    
    yield
    
    # Очистка при завершении
    logger.info("Завершение работы Mock Service...")


# Создание приложения FastAPI
app = FastAPI(
    title="Mock Service API",
    description="""
## Mock Service - Универсальная система создания и управления mock API

### Возможности:
- **Создание mock эндпоинтов** - быстрое создание тестовых API
- **Логирование запросов** - отслеживание всех запросов в реальном времени  
- **Proxy режим** - проксирование запросов на внешние сервисы
- **Импорт Swagger/OpenAPI** - автоматическое создание mock'ов из документации
- **Импорт WSDL** - поддержка SOAP сервисов
- **Гибкая настройка** - условная логика, переменные, валидация

### Основные разделы:
- **Mock Services** - управление mock сервисами
- **Swagger Import** - импорт из Swagger/OpenAPI файлов
- **WSDL Import** - импорт SOAP сервисов
- **Logs** - просмотр логов запросов
- **WebSocket** - real-time обновления логов

### Документация:
- **Swagger UI**: [/docs](/docs) - интерактивная документация
- **ReDoc**: [/redoc](/redoc) - альтернативная документация
""",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене ограничить конкретными доменами
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(server_info.router)
app.include_router(mock_services.router)
app.include_router(swagger.router)
app.include_router(wsdl.router)
app.include_router(websocket.router)

# Статические файлы для frontend (если есть)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Главная страница
@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Mock Service</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 50px; }
            .container { max-width: 800px; }
            .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Mock Service API</h1>
            <p>Сервис для создания и управления mock API эндпоинтами</p>
            
            <h2>📚 Документация API</h2>
            <div class="endpoint">
                <strong>Swagger UI:</strong> <a href="/docs">/docs</a>
            </div>
            <div class="endpoint">
                <strong>ReDoc:</strong> <a href="/redoc">/redoc</a>
            </div>
            
            <h2>🔧 Управление Mock Сервисами</h2>
            <div class="endpoint">
                <strong>Список сервисов:</strong> GET /api/mock-services/
            </div>
            <div class="endpoint">
                <strong>Создать сервис:</strong> POST /api/mock-services/
            </div>
            <div class="endpoint">
                <strong>Получить сервис:</strong> GET /api/mock-services/{id}
            </div>
            <div class="endpoint">
                <strong>Обновить сервис:</strong> PUT /api/mock-services/{id}
            </div>
            <div class="endpoint">
                <strong>Удалить сервис:</strong> DELETE /api/mock-services/{id}
            </div>
            
            <h2>📊 Логирование</h2>
            <div class="endpoint">
                <strong>Все логи:</strong> GET /api/mock-services/logs/all
            </div>
            <div class="endpoint">
                <strong>Логи сервиса:</strong> GET /api/mock-services/{id}/logs
            </div>
            <div class="endpoint">
                <strong>WebSocket все логи:</strong> WS /ws/logs
            </div>
            <div class="endpoint">
                <strong>WebSocket логи сервиса:</strong> WS /ws/logs/{id}
            </div>
            
            <h2>🎯 Mock Эндпоинты</h2>
            <p>Все остальные пути обрабатываются как mock эндпоинты согласно настройкам сервисов</p>
        </div>
    </body>
    </html>
    """

@app.get("/health")
async def health_check():
    """Проверка состояния сервиса"""
    return {"status": "healthy", "message": "Mock Service работает"}

# Добавляем обработчик mock запросов в конце, чтобы он не перехватывал API маршруты
app.include_router(mock_handler.router) 