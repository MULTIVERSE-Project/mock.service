import re
import xml.etree.ElementTree as ET
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


class SOAPParser:
    """Парсер для SOAP запросов"""
    
    @staticmethod
    def extract_soap_method_from_headers(headers: Dict[str, str]) -> Optional[str]:
        """
        Извлекает имя метода из HTTP заголовков SOAP запроса
        Приоритет поиска согласно требованиям:
        1. Параметр action в Content-Type
        2. Заголовок SOAPAction
        3. Любые другие варианты SOAPAction в разных регистрах
        
        Args:
            headers: HTTP заголовки запроса
            
        Returns:
            Optional[str]: Имя метода или None если не найден
        """
        try:
            # Получаем заголовки без учёта регистра (HTTP headers case-insensitive)
            headers_lower = {k.lower(): v for k, v in headers.items()} if headers else {}
            
            # 1. ПРИОРИТЕТ: Проверяем параметр action в Content-Type
            content_type = headers_lower.get('content-type', '')
            if 'action=' in content_type.lower():
                # Ищем параметр action в Content-Type
                action_match = re.search(r'action=["\']([^"\']+)["\']', content_type, re.IGNORECASE)
                if not action_match:
                    # Пробуем без кавычек
                    action_match = re.search(r'action=([^;\s]+)', content_type, re.IGNORECASE)
                
                if action_match:
                    action_value = action_match.group(1).strip()
                    method_name = SOAPParser._extract_method_from_action(action_value)
                    if method_name:
                        logger.debug(f"Найден метод в Content-Type action: {method_name}")
                        return method_name
            
            # 2. Проверяем заголовок SOAPAction (стандартный способ)
            soap_action = headers_lower.get('soapaction', '').strip('"').strip("'")
            if soap_action:
                method_name = SOAPParser._extract_method_from_action(soap_action)
                if method_name:
                    logger.debug(f"Найден метод в SOAPAction: {method_name}")
                    return method_name
                else:
                    logger.debug("SOAPAction присутствует, но пустой или некорректный")
            
            # 3. Проверяем заголовок SOAPAction в разных регистрах (для совместимости)
            for header_name, header_value in headers.items():
                if header_name.lower() == 'soapaction' and header_name != 'soapaction':
                    soap_action = header_value.strip('"').strip("'")
                    if soap_action:
                        method_name = SOAPParser._extract_method_from_action(soap_action)
                        if method_name:
                            logger.debug(f"Найден метод в {header_name}: {method_name}")
                            return method_name
            
            logger.debug("Метод SOAP не найден в заголовках")
            return None
            
        except Exception as e:
            logger.error(f"Ошибка при извлечении SOAP метода из заголовков: {e}")
            return None
    
    @staticmethod
    def _extract_method_from_action(action_value: str) -> Optional[str]:
        """
        Извлекает имя метода из action значения, обрабатывая различные форматы
        
        Args:
            action_value: Значение action
            
        Returns:
            Optional[str]: Имя метода или None
        """
        if not action_value or not action_value.strip():
            return None
        
        action_value = action_value.strip()
        
        # Обрабатываем URN и другие форматы
        # Примеры:
        # "urn:#getEpicrisisInfoByPatient" -> "getEpicrisisInfoByPatient"
        # "http://example.com/service#method" -> "method"
        # "urn:someNamespace:methodName" -> "methodName"
        # "/service/methodName" -> "methodName"
        
        # Сначала пробуем с разделителем #
        if '#' in action_value:
            method_name = action_value.split('#')[-1].strip()
            if method_name:
                return SOAPParser._normalize_method_name(method_name)
        
        # Затем пробуем с разделителем /
        if '/' in action_value:
            method_name = action_value.split('/')[-1].strip()
            if method_name and not method_name.lower().endswith('.wsdl'):
                return SOAPParser._normalize_method_name(method_name)
        
        # Затем пробуем с разделителем :
        if ':' in action_value:
            # Особый случай для URN - берем последнюю часть после последнего :
            parts = action_value.split(':')
            if len(parts) > 1:
                method_name = parts[-1].strip()
                if method_name and method_name != 'urn':
                    return SOAPParser._normalize_method_name(method_name)
        
        # Если разделителей нет, возвращаем как есть
        return SOAPParser._normalize_method_name(action_value)
    
    @staticmethod
    def _normalize_method_name(method_name: str) -> str:
        """
        Нормализует имя метода, убирая лишние символы и пробелы
        
        Args:
            method_name: Исходное имя метода
            
        Returns:
            str: Нормализованное имя метода
        """
        if not method_name:
            return ""
        
        # Убираем лишние пробелы и символы
        normalized = method_name.strip().strip('"').strip("'").strip()
        
        # Убираем Query string если есть
        if '?' in normalized:
            normalized = normalized.split('?')[0]
        
        # Убираем Fragment если есть
        if '#' in normalized:
            normalized = normalized.split('#')[-1]
        
        return normalized
    
    @staticmethod
    def extract_soap_method_from_body(body: str) -> Optional[str]:
        """
        Извлекает имя метода из тела SOAP запроса (fallback метод)
        
        Args:
            body: Тело SOAP запроса
            
        Returns:
            Optional[str]: Имя метода или None если не найден
        """
        try:
            # Убираем лишние пробелы и переносы строк
            body = body.strip()
            
            # Пытаемся парсить XML для более точного извлечения
            try:
                root = ET.fromstring(body)
                
                # Ищем Body элемент
                body_elem = None
                for elem in root.iter():
                    if 'Body' in elem.tag:
                        body_elem = elem
                        break
                
                if body_elem and len(body_elem) > 0:
                    # Берем первый элемент в Body - это и есть метод
                    method_elem = body_elem[0]
                    method_name = method_elem.tag.split('}')[-1]  # Убираем namespace
                    if method_name and method_name != '':
                        return method_name
                        
            except ET.ParseError:
                # Если XML не парсится, используем regex
                pass
            
            # Fallback на regex парсинг для некорректного XML
            # 1. Стандартный SOAP 1.1
            soap11_pattern = r'<soap:Body[^>]*>\s*<([^:>\s]+)[^>]*>'
            match = re.search(soap11_pattern, body, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1)
            
            # 2. SOAP 1.2
            soap12_pattern = r'<soap12:Body[^>]*>\s*<([^:>\s]+)[^>]*>'
            match = re.search(soap12_pattern, body, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1)
            
            # 3. Простой XML без namespace
            simple_pattern = r'<Body[^>]*>\s*<([^:>\s]+)[^>]*>'
            match = re.search(simple_pattern, body, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1)
            
            # 4. Прямой поиск первого элемента после Body
            body_start = re.search(r'<[^>]*Body[^>]*>', body, re.IGNORECASE)
            if body_start:
                # Ищем следующий элемент после Body
                remaining = body[body_start.end():]
                element_match = re.search(r'<([^:>\s]+)[^>]*>', remaining)
                if element_match:
                    return element_match.group(1)
            
            # 5. Поиск любого элемента с Request в названии (для SOAP запросов)
            request_pattern = r'<([^:>\s]+Request)[^>]*>'
            match = re.search(request_pattern, body, re.IGNORECASE | re.DOTALL)
            if match:
                return match.group(1)
            
            return None
            
        except Exception as e:
            logger.error(f"Ошибка при парсинге SOAP метода из тела: {e}")
            return None
    
    @staticmethod
    def extract_soap_method(headers: Dict[str, str], body: str = None) -> Optional[str]:
        """
        Извлекает имя SOAP метода согласно приоритетам:
        1. Параметр action в Content-Type
        2. Заголовок SOAPAction  
        3. Тело запроса (fallback)
        
        Args:
            headers: HTTP заголовки запроса
            body: Тело SOAP запроса (опционально, для fallback)
            
        Returns:
            Optional[str]: Имя метода или None если не найден
        """
        logger.debug(f"Начинаем извлечение SOAP метода. Заголовки: {dict(headers)}")
        if body:
            logger.debug(f"Тело запроса (первые 200 символов): {body[:200]}...")
        
        # Сначала пробуем извлечь из заголовков с правильными приоритетами
        method_from_headers = SOAPParser.extract_soap_method_from_headers(headers)
        
        # Проверяем, найден ли валидный метод в заголовках (не пустой и содержательный)
        if method_from_headers and len(method_from_headers.strip()) > 1:
            normalized_method = SOAPParser._normalize_method_name(method_from_headers)
            if normalized_method and len(normalized_method) > 1:
                logger.debug(f"SOAP метод найден в заголовках: {normalized_method}")
                return normalized_method
        
        # Если метод не найден в заголовках или некачественный, пробуем из тела
        if body:
            if method_from_headers:
                logger.debug(f"Метод из заголовков некачественный ({method_from_headers}), ищем в теле запроса...")
            else:
                logger.debug("Метод не найден в заголовках, ищем в теле запроса...")
            
            method_from_body = SOAPParser.extract_soap_method_from_body(body)
            if method_from_body:
                normalized_method = SOAPParser._normalize_method_name(method_from_body)
                if normalized_method:
                    logger.debug(f"SOAP метод найден в теле запроса: {normalized_method}")
                    return normalized_method
            else:
                logger.debug("SOAP метод не найден в теле запроса")
        else:
            logger.debug("Тело запроса не предоставлено для fallback поиска")
        
        # Если ничего хорошего не найдено, возвращаем то что есть из заголовков
        if method_from_headers:
            normalized_method = SOAPParser._normalize_method_name(method_from_headers)
            if normalized_method:
                logger.debug(f"Возвращаем метод из заголовков как последний вариант: {normalized_method}")
                return normalized_method
        
        logger.debug("SOAP метод не найден")
        return None
    
    @staticmethod
    def extract_soap_parameters(body: str) -> Dict[str, Any]:
        """
        Извлекает параметры из SOAP запроса
        
        Args:
            body: Тело SOAP запроса
            
        Returns:
            Dict[str, Any]: Словарь параметров
        """
        try:
            params = {}
            
            # Парсим XML
            root = ET.fromstring(body)
            
            # Ищем Body элемент
            body_elem = None
            for elem in root.iter():
                if 'Body' in elem.tag:
                    body_elem = elem
                    break
            
            if body_elem:
                # Извлекаем параметры из первого элемента в Body
                for child in body_elem:
                    method_name = child.tag.split('}')[-1]  # Убираем namespace
                    params['method'] = method_name
                    
                    # Извлекаем параметры метода
                    for param in child:
                        param_name = param.tag.split('}')[-1]
                        param_value = param.text if param.text else ''
                        params[param_name] = param_value
                    
                    break  # Берем только первый метод
            
            return params
            
        except Exception as e:
            logger.error(f"Ошибка при извлечении SOAP параметров: {e}")
            return {}
    
    @staticmethod
    def is_soap_request(headers: Dict[str, str], body: str = None) -> bool:
        """
        Проверяет, является ли запрос SOAP
        
        Args:
            headers: HTTP заголовки запроса
            body: Тело запроса (опционально)
            
        Returns:
            bool: True если это SOAP запрос
        """
        # Проверяем заголовки (case-insensitive)
        headers_lower = {k.lower(): v for k, v in headers.items()} if headers else {}
        content_type = headers_lower.get('content-type', '').lower()
        soap_action = headers_lower.get('soapaction', '').lower()
        
        # Проверяем наличие SOAP индикаторов в заголовках
        soap_header_indicators = [
            'application/soap+xml',
            'text/xml',
            'application/xml',
            'soapaction',
            'action='
        ]
        
        if any(indicator in content_type or indicator in soap_action for indicator in soap_header_indicators):
            return True
        
        # Если заголовки не дали результата, проверяем тело
        if body:
            body_lower = body.lower()
            soap_body_indicators = [
                'soap:envelope',
                'soap:body',
                'soap12:envelope',
                'soap12:body',
                'xmlns:soap',
                'xmlns:soap12'
            ]
            
            return any(indicator in body_lower for indicator in soap_body_indicators)
        
        return False 