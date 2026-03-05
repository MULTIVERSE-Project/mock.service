from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Tuple
import re
import logging

logger = logging.getLogger(__name__)
from app.models.mock_service import MockService, ServiceType
from app.schemas.mock_service import MockServiceCreate, MockServiceUpdate
from app.utils.path_parser import path_parser
from app.utils.soap_parser import SOAPParser


class MockServiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_mock_service(self, mock_data: MockServiceCreate) -> MockService:
        """Создать новый mock сервис"""
        # Валидируем шаблон пути
        is_valid, error_message = path_parser.validate_path_pattern(mock_data.path)
        if not is_valid:
            raise ValueError(f"Некорректный шаблон пути: {error_message}")
        
        mock_service = MockService(
            name=mock_data.name,
            path=mock_data.path,
            methods=mock_data.methods,
            strategy=mock_data.strategy,
            service_type=mock_data.service_type,
            proxy_url=mock_data.proxy_url,
            proxy_delay=mock_data.proxy_delay,
            static_response=mock_data.static_response,
            static_status_code=mock_data.static_status_code,
            static_headers=mock_data.static_headers,
            static_delay=mock_data.static_delay,
            condition_code=mock_data.condition_code,
            conditional_responses=[resp.dict() for resp in mock_data.conditional_responses] if mock_data.conditional_responses else None,
            conditional_delay=mock_data.conditional_delay,
            conditional_status_code=mock_data.conditional_status_code,
            conditional_headers=mock_data.conditional_headers,
            is_active=mock_data.is_active
        )
        
        self.db.add(mock_service)
        await self.db.commit()
        await self.db.refresh(mock_service)
        return mock_service

    async def get_mock_service(self, service_id: int) -> Optional[MockService]:
        """Получить mock сервис по ID"""
        result = await self.db.execute(
            select(MockService).where(MockService.id == service_id)
        )
        return result.scalar_one_or_none()

    async def get_mock_services(self, skip: int = 0, limit: int = 1000) -> List[MockService]:
        """Получить список всех mock сервисов"""
        result = await self.db.execute(
            select(MockService).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def get_active_mock_services(self) -> List[MockService]:
        """Получить список активных mock сервисов"""
        result = await self.db.execute(
            select(MockService).where(MockService.is_active == True)
        )
        return result.scalars().all()

    async def find_mock_service_by_path_and_method(self, path: str, method: str, body: str = None, headers: Dict[str, str] = None) -> Tuple[Optional[MockService], Dict[str, str]]:
        """
        Найти mock сервис по пути и методу с поддержкой параметризованных путей и SOAP методов
        
        Args:
            path: Путь запроса
            method: HTTP метод
            body: Тело запроса (для SOAP)
            headers: HTTP заголовки (для SOAP)
            
        Returns:
            Tuple[Optional[MockService], Dict[str, str]]: (сервис, извлеченные параметры)
        """
        result = await self.db.execute(
            select(MockService).where(MockService.is_active == True)
        )
        services = result.scalars().all()
        
        # Переменные для fallback варианта (SOAP сервисы без определенного метода)
        fallback_service = None
        fallback_params = {}
        
        # Извлекаем SOAP метод один раз (для SOAP сервисов)
        soap_method = None
        if headers:
            soap_method = SOAPParser.extract_soap_method(headers, body)
        
        path_normalized = path.rstrip('/') or '/'
        soap_on_path = [s.name for s in services if s.service_type == ServiceType.SOAP and (
            path_parser.extract_parameters(s.path, path_normalized) is not None or
            path_parser.extract_parameters(s.path.rstrip('/') or '/', path_normalized) is not None
        )]
        logger.info(f"Поиск mock: path={path_normalized!r}, soap_method={soap_method!r}, SOAP на пути: {soap_on_path}")
        
        # Собираем кандидатов: сервисы с совпадением пути и метода
        soap_candidates = []  # (service, path_params, is_exact_match)
        rest_match = None
        fallback_service = None
        fallback_params = {}
        
        for service in services:
            # Проверяем метод
            if method.upper() not in [m.upper() for m in service.methods]:
                continue
            
            # Проверяем путь (пробуем с и без trailing slash для совместимости)
            path_params = path_parser.extract_parameters(service.path, path_normalized)
            if path_params is None:
                path_params = path_parser.extract_parameters(service.path.rstrip('/') or '/', path_normalized)
            if path_params is None and path != path_normalized:
                path_params = path_parser.extract_parameters(service.path, path)
            if path_params is None:
                continue
            
            if service.service_type == ServiceType.SOAP:
                if soap_method:
                    is_exact = self._matches_soap_service_exact(service.name, soap_method)
                    if is_exact:
                        return service, path_params  # Точное совпадение — сразу возвращаем
                    if self._matches_soap_service(service.name, soap_method):
                        soap_candidates.append((service, path_params, False))
                else:
                    fallback_service = service
                    fallback_params = path_params
            
            elif service.service_type == ServiceType.REST:
                rest_match = (service, path_params)
        
        # Для REST — возвращаем первый подходящий
        if rest_match:
            return rest_match
        
        # Для SOAP — если есть кандидаты, берём первого (частичное совпадение)
        if soap_candidates:
            return soap_candidates[0][0], soap_candidates[0][1]
        
        if fallback_service:
            return fallback_service, fallback_params
        
        # Диагностика при 404
        soap_services = [s for s in services if s.service_type == ServiceType.SOAP]
        if soap_services:
            logger.warning(f"SOAP 404: path={path!r}, soap_method={soap_method!r}. "
                          f"Доступные пути: {[(s.path, s.name) for s in soap_services]}")
        
        return None, {}
    
    def _normalize_soap_method_for_match(self, soap_method: str) -> List[str]:
        """
        Возвращает варианты имени метода для сопоставления.
        SOAP action часто содержит суффикс Request/Response (имя сообщения),
        а WSDL operation — только имя операции (getHealthGroup).
        """
        if not soap_method:
            return []
        s = soap_method.strip().lower()
        variants = [s]
        for suffix in ('request', 'response', 'in', 'out'):
            if s.endswith(suffix) and len(s) > len(suffix):
                base = s[:-len(suffix)].rstrip('_')
                if base:
                    variants.append(base)
        return variants

    def _matches_soap_service_exact(self, service_name: str, soap_method: str) -> bool:
        """
        Строгое сопоставление: имя метода должно совпадать с операцией в имени сервиса.
        Учитывает суффиксы Request/Response в SOAP action (getHealthGroupRequest -> getHealthGroup).
        """
        if not service_name or not soap_method:
            return False
        
        service_name_lower = service_name.lower().strip()
        soap_variants = self._normalize_soap_method_for_match(soap_method)
        
        for soap_method_lower in soap_variants:
            # Точное совпадение
            if service_name_lower == soap_method_lower:
                return True
            
            # ServiceName_MethodName (например: ProxyService_getHealthGroup)
            if service_name_lower.endswith(f"_{soap_method_lower}"):
                return True
            
            # MethodName_ServiceName
            if service_name_lower.startswith(f"{soap_method_lower}_"):
                return True
            
            # ServiceName.MethodName
            if service_name_lower.endswith(f".{soap_method_lower}"):
                return True
            
            # MethodName.ServiceName
            if service_name_lower.startswith(f"{soap_method_lower}."):
                return True
        
        return False
    
    def _matches_soap_service(self, service_name: str, soap_method: str) -> bool:
        """
        Частичное сопоставление для fallback (только после проверки exact).
        Учитывает суффиксы Request/Response при сравнении частей.
        """
        if not service_name or not soap_method:
            return False
        
        if self._matches_soap_service_exact(service_name, soap_method):
            return True
        
        service_name_lower = service_name.lower().strip()
        soap_variants = self._normalize_soap_method_for_match(soap_method)
        service_parts = re.split(r'[._-]', service_name_lower)
        
        for soap_method_lower in soap_variants:
            soap_parts = re.split(r'[._-]', soap_method_lower)
            for service_part in service_parts:
                if not service_part or len(service_part) < 3:
                    continue
                for soap_part in soap_parts:
                    if not soap_part or len(soap_part) < 3:
                        continue
                    if service_part == soap_part:
                        return True
        
        return False

    async def update_mock_service(self, service_id: int, mock_data: MockServiceUpdate) -> Optional[MockService]:
        """Обновить mock сервис"""
        # Получаем существующий сервис
        mock_service = await self.get_mock_service(service_id)
        if not mock_service:
            return None

        # Обновляем только переданные поля
        update_data = {}
        for field, value in mock_data.dict(exclude_unset=True).items():
            # Валидируем путь если он изменяется
            if field == 'path' and value is not None:
                is_valid, error_message = path_parser.validate_path_pattern(value)
                if not is_valid:
                    raise ValueError(f"Некорректный шаблон пути: {error_message}")
            
            if field == 'conditional_responses' and value is not None:
                # Проверяем тип данных - если это уже список словарей, оставляем как есть
                # Если это список Pydantic объектов, конвертируем в словари
                if isinstance(value, list) and len(value) > 0:
                    if hasattr(value[0], 'dict'):
                        # Это Pydantic объекты
                        update_data[field] = [resp.dict() for resp in value]
                    else:
                        # Это уже словари
                        update_data[field] = value
                else:
                    update_data[field] = value
            else:
                update_data[field] = value

        if update_data:
            await self.db.execute(
                update(MockService)
                .where(MockService.id == service_id)
                .values(**update_data)
            )
            await self.db.commit()
            
            # Получаем обновленный объект
            await self.db.refresh(mock_service)

        return mock_service

    async def delete_mock_service(self, service_id: int) -> bool:
        """Удалить mock сервис"""
        result = await self.db.execute(
            delete(MockService).where(MockService.id == service_id)
        )
        await self.db.commit()
        return result.rowcount > 0

    def get_path_parameters(self, path_pattern: str) -> List[str]:
        """Получить список параметров из шаблона пути"""
        return path_parser.extract_parameter_names(path_pattern)

 