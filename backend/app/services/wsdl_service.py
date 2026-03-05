import xml.etree.ElementTree as ET
import httpx
import re
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urljoin, urlparse
import logging

logger = logging.getLogger(__name__)

class WSDLOperation:
    """Модель SOAP операции из WSDL"""
    def __init__(self, name: str, soap_action: str, input_message: str, output_message: str,
                 input_elements: List[Dict], output_elements: List[Dict], endpoint_url: str):
        self.name = name
        self.soap_action = soap_action
        self.input_message = input_message
        self.output_message = output_message
        self.input_elements = input_elements
        self.output_elements = output_elements
        self.endpoint_url = endpoint_url
    
    def to_dict(self):
        return {
            'name': self.name,
            'soap_action': self.soap_action,
            'input_message': self.input_message,
            'output_message': self.output_message,
            'input_elements': self.input_elements,
            'output_elements': self.output_elements,
            'endpoint_url': self.endpoint_url
        }

class WSDLParseResult:
    """Результат парсинга WSDL"""
    def __init__(self):
        self.service_name: str = ""
        self.target_namespace: str = ""
        self.soap_address: str = ""
        self.operations: List[WSDLOperation] = []
        self.errors: List[str] = []
        self.warnings: List[str] = []
    
    def to_dict(self):
        return {
            'service_name': self.service_name,
            'target_namespace': self.target_namespace,
            'soap_address': self.soap_address,
            'operations': [op.to_dict() for op in self.operations],
            'errors': self.errors,
            'warnings': self.warnings
        }

class WSDLService:
    """Сервис для работы с WSDL документами (WSDL 1.1 и WSDL 2.0)"""
    
    # WSDL 1.1 namespaces
    WSDL11_NS = 'http://schemas.xmlsoap.org/wsdl/'
    SOAP_NS = 'http://schemas.xmlsoap.org/wsdl/soap/'
    SOAP12_NS = 'http://schemas.xmlsoap.org/wsdl/soap12/'
    # WSDL 2.0 namespaces
    WSDL20_NS = 'http://www.w3.org/ns/wsdl'
    WSOAP_NS = 'http://www.w3.org/ns/wsdl/soap'
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30.0)
        self.namespaces = {
            'wsdl': self.WSDL11_NS,
            'wsdl2': self.WSDL20_NS,
            'soap': self.SOAP_NS,
            'soap12': self.SOAP12_NS,
            'wsoap': self.WSOAP_NS,
            'xsd': 'http://www.w3.org/2001/XMLSchema',
            'tns': ''  # будет определен динамически
        }
    
    async def parse_wsdl_from_url(self, wsdl_url: str) -> WSDLParseResult:
        """
        Парсит WSDL документ по URL (поддержка WSDL 1.1, WSDL 2.0 и импортов)
        
        Args:
            wsdl_url: URL WSDL документа
            
        Returns:
            WSDLParseResult: Результат парсинга
        """
        result = WSDLParseResult()
        
        try:
            logger.info(f"Загружаем WSDL с URL: {wsdl_url}")
            
            # Загружаем WSDL документ и все импорты
            roots = await self._load_wsdl_with_imports(wsdl_url)
            if not roots:
                result.errors.append("Не удалось загрузить WSDL документ")
                return result
            
            root = roots[0]
            wsdl_content = ET.tostring(root, encoding='unicode')
            logger.info(f"WSDL загружен, размер: {len(wsdl_content)} символов")
            
            # Определяем target namespace
            result.target_namespace = root.get('targetNamespace', '')
            if result.target_namespace:
                self.namespaces['tns'] = result.target_namespace
            
            logger.info(f"Target namespace: {result.target_namespace}")
            
            # Извлекаем информацию о сервисе
            await self._extract_service_info(root, result, wsdl_url)
            
            # Извлекаем операции из основного документа и всех импортов
            # Передаём все roots для поиска schema/messages в импортированных файлах
            for doc_root in roots:
                await self._extract_operations(doc_root, result, all_roots=roots)
            
            logger.info(f"Найдено операций: {len(result.operations)}")
            
        except Exception as e:
            error_msg = f"Ошибка парсинга WSDL: {str(e)}"
            logger.error(error_msg)
            result.errors.append(error_msg)
        
        return result
    
    async def _load_wsdl_with_imports(self, wsdl_url: str, loaded_urls: set = None) -> List[ET.Element]:
        """Загружает WSDL и рекурсивно все импортированные документы"""
        if loaded_urls is None:
            loaded_urls = set()
        
        if wsdl_url in loaded_urls:
            return []
        loaded_urls.add(wsdl_url)
        
        try:
            response = await self.http_client.get(wsdl_url)
            response.raise_for_status()
            wsdl_content = response.text
        except Exception as e:
            logger.warning(f"Не удалось загрузить WSDL с {wsdl_url}: {e}")
            return []
        
        try:
            root = ET.fromstring(wsdl_content)
        except ET.ParseError as e:
            logger.warning(f"Ошибка парсинга XML с {wsdl_url}: {e}")
            return []
        
        roots = [root]
        base_url = wsdl_url.rsplit('/', 1)[0] + '/' if '/' in wsdl_url else wsdl_url
        
        # Ищем импорты в WSDL 1.1 и WSDL 2.0
        for import_elem in root.findall('.//{http://schemas.xmlsoap.org/wsdl/}import'):
            location = import_elem.get('location')
            if location:
                import_url = urljoin(wsdl_url, location)
                imported_roots = await self._load_wsdl_with_imports(import_url, loaded_urls)
                roots.extend(imported_roots)
        
        for import_elem in root.findall('.//{http://www.w3.org/ns/wsdl}import'):
            location = import_elem.get('location')
            if location:
                import_url = urljoin(wsdl_url, location)
                imported_roots = await self._load_wsdl_with_imports(import_url, loaded_urls)
                roots.extend(imported_roots)
        
        # WSDL include
        for include_elem in root.findall('.//{http://schemas.xmlsoap.org/wsdl/}include'):
            location = include_elem.get('location')
            if location:
                include_url = urljoin(wsdl_url, location)
                included_roots = await self._load_wsdl_with_imports(include_url, loaded_urls)
                roots.extend(included_roots)
        
        return roots
    
    async def _extract_service_info(self, root: ET.Element, result: WSDLParseResult, wsdl_url: str):
        """Извлекает информацию о сервисе из WSDL 1.1 или WSDL 2.0"""
        
        # WSDL 1.1: service/port
        services = root.findall('.//wsdl:service', self.namespaces)
        # WSDL 2.0: service/endpoint
        if not services:
            services = root.findall('.//wsdl2:service', self.namespaces)
        
        if services:
            service = services[0]
            result.service_name = service.get('name', 'UnknownService')
            
            # WSDL 1.1: port с soap:address
            ports = service.findall('.//wsdl:port', self.namespaces)
            for port in ports:
                soap_address = port.find('soap:address', self.namespaces)
                if soap_address is None:
                    soap_address = port.find('soap12:address', self.namespaces)
                
                if soap_address is not None:
                    location = soap_address.get('location', '')
                    if location:
                        result.soap_address = location
                        break
            
            # WSDL 2.0: endpoint с address атрибутом
            if not result.soap_address:
                endpoints = service.findall('.//wsdl2:endpoint', self.namespaces)
                for endpoint in endpoints:
                    address = endpoint.get('address', '')
                    if address:
                        result.soap_address = address
                        break
            
            # Если не нашли SOAP address, пытаемся построить из URL
            if not result.soap_address:
                parsed_url = urlparse(wsdl_url)
                base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
                if parsed_url.path.endswith('.wsdl'):
                    service_path = parsed_url.path.replace('.wsdl', '')
                else:
                    service_path = parsed_url.path
                result.soap_address = f"{base_url}{service_path}"
                result.warnings.append(f"SOAP address не найден, используется: {result.soap_address}")
        
        else:
            result.errors.append("Элемент service не найден в WSDL")
    
    async def _extract_operations(self, root: ET.Element, result: WSDLParseResult, all_roots: List[ET.Element] = None):
        """
        Извлекает операции из WSDL 1.1 (portType) или WSDL 2.0 (interface)
        all_roots: все загруженные WSDL документы (для поиска schema в импортах)
        """
        if all_roots is None:
            all_roots = [root]
        operations_found = 0
        
        # WSDL 1.1: ищем portType
        port_types = root.findall('.//wsdl:portType', self.namespaces)
        
        # WSDL 2.0: ищем interface (эквивалент portType)
        if not port_types:
            port_types = root.findall('.//wsdl2:interface', self.namespaces)
            if port_types:
                logger.info("Обнаружен WSDL 2.0 формат (interface)")
        
        # Fallback: поиск по локальному имени (для нестандартных namespace)
        if not port_types:
            port_types = self._find_elements_by_local_name(root, 'portType')
        if not port_types:
            port_types = self._find_elements_by_local_name(root, 'interface')
            if port_types:
                logger.info("Обнаружен portType/interface с нестандартным namespace")
        
        if not port_types:
            logger.warning("PortType/Interface не найдены в WSDL")
            result.warnings.append("PortType не найдены, WSDL может быть некорректным")
            return
        
        for port_type in port_types:
            port_type_name = port_type.get('name', 'UnknownPortType')
            logger.info(f"Обрабатываем portType/interface: {port_type_name}")
            
            # WSDL 1.1: wsdl:operation
            operations = port_type.findall('wsdl:operation', self.namespaces)
            # WSDL 2.0: wsdl2:operation
            if not operations:
                operations = port_type.findall('wsdl2:operation', self.namespaces)
            # Fallback: direct children с local-name operation
            if not operations:
                operations = [c for c in port_type if self._get_local_name(c.tag) == 'operation']
            
            for operation in operations:
                try:
                    op_name = operation.get('name')
                    if not op_name:
                        logger.warning("Операция без имени найдена, пропускаем")
                        continue
                    
                    logger.info(f"Обрабатываем операцию: {op_name}")
                    operations_found += 1
                    
                    # Извлекаем сообщения (WSDL 1.1: message, WSDL 2.0: element)
                    input_elem = (operation.find('wsdl:input', self.namespaces) or 
                                  operation.find('wsdl2:input', self.namespaces) or
                                  next((c for c in operation if self._get_local_name(c.tag) == 'input'), None))
                    output_elem = (operation.find('wsdl:output', self.namespaces) or 
                                   operation.find('wsdl2:output', self.namespaces) or
                                   next((c for c in operation if self._get_local_name(c.tag) == 'output'), None))
                    
                    input_message = ''
                    output_message = ''
                    
                    if input_elem is not None:
                        # WSDL 1.1: message attribute
                        input_message = input_elem.get('message', '') or input_elem.get('element', '')
                        if not input_message:
                            input_message = f"{op_name}Request"
                            result.warnings.append(f"Input message для {op_name} не найдено, используется {input_message}")
                    
                    if output_elem is not None:
                        # WSDL 1.1: message, WSDL 2.0: element
                        output_message = output_elem.get('message', '') or output_elem.get('element', '')
                        if not output_message:
                            output_message = f"{op_name}Response"
                            result.warnings.append(f"Output message для {op_name} не найдено, используется {output_message}")
                    
                    # Чистим namespace префиксы
                    input_message = self._clean_message_name(input_message)
                    output_message = self._clean_message_name(output_message)
                    
                    # Ищем SOAP action в binding (во всех документах)
                    soap_action = ''
                    for doc_root in all_roots:
                        soap_action = await self._find_soap_action(doc_root, op_name)
                        if soap_action:
                            break
                    if not soap_action:
                        # Fallback: создаем SOAPAction на основе имени операции
                        soap_action = f"urn:{op_name}"
                        result.warnings.append(f"SOAPAction для {op_name} не найден, используется {soap_action}")
                    
                    # Извлекаем элементы сообщений с обработкой ошибок
                    input_elements = []
                    output_elements = []
                    
                    try:
                        input_elements = await self._extract_message_elements(all_roots, input_message)
                    except Exception as e:
                        logger.warning(f"Ошибка извлечения input элементов для {op_name}: {e}")
                        result.warnings.append(f"Не удалось извлечь input элементы для {op_name}")
                        # input_elements останется пустым, что приведет к созданию базовых элементов
                    
                    try:
                        output_elements = await self._extract_message_elements(all_roots, output_message)
                    except Exception as e:
                        logger.warning(f"Ошибка извлечения output элементов для {op_name}: {e}")
                        result.warnings.append(f"Не удалось извлечь output элементы для {op_name}")
                        # output_elements останется пустым, что приведет к созданию базовых элементов
                    
                    # Создаем операцию
                    wsdl_operation = WSDLOperation(
                        name=op_name,
                        soap_action=soap_action,
                        input_message=input_message,
                        output_message=output_message,
                        input_elements=input_elements,
                        output_elements=output_elements,
                        endpoint_url=result.soap_address or "http://localhost/soap"
                    )
                    
                    # Избегаем дубликатов при обработке импортов
                    if not any(op.name == op_name for op in result.operations):
                        result.operations.append(wsdl_operation)
                        logger.info(f"Операция {op_name} успешно добавлена")
                    else:
                        operations_found -= 1  # дубликат, не считаем
                    
                except Exception as e:
                    error_msg = f"Ошибка при обработке операции {op_name if 'op_name' in locals() else 'unknown'}: {str(e)}"
                    logger.error(error_msg)
                    result.warnings.append(error_msg)
                    # Продолжаем обработку других операций
        
        if operations_found == 0:
            result.warnings.append("Ни одной операции не найдено в WSDL")
        else:
            logger.info(f"Всего обработано операций: {operations_found}")
    
    async def _find_soap_action(self, root: ET.Element, operation_name: str) -> str:
        """Находит SOAP action для операции (WSDL 1.1 и WSDL 2.0)"""
        
        # WSDL 1.1: binding
        bindings = root.findall('.//wsdl:binding', self.namespaces)
        for binding in bindings:
            operations = binding.findall('wsdl:operation', self.namespaces)
            for operation in operations:
                if operation.get('name') == operation_name:
                    soap_op = operation.find('soap:operation', self.namespaces) or operation.find('soap12:operation', self.namespaces)
                    if soap_op is not None:
                        action = soap_op.get('soapAction', '')
                        if action:
                            return action
        
        # WSDL 2.0: binding с wsoap:operation
        bindings = root.findall('.//wsdl2:binding', self.namespaces)
        for binding in bindings:
            operations = binding.findall('wsdl2:operation', self.namespaces)
            for operation in operations:
                ref_name = operation.get('ref', '').split(':')[-1] if operation.get('ref') else operation.get('name', '')
                if ref_name == operation_name or operation.get('name') == operation_name:
                    soap_op = operation.find('wsoap:operation', self.namespaces)
                    if soap_op is not None:
                        action = soap_op.get('soapAction', '') or soap_op.get('action', '')
                        if action:
                            return action
        
        return ''
    
    async def _extract_message_elements(self, roots, message_name: str) -> List[Dict]:
        """
        Извлекает элементы сообщения (WSDL 1.1: из message/part, WSDL 2.0: из element в schema)
        roots: один ET.Element или список загруженных WSDL документов
        """
        if not message_name:
            return []
        
        roots_list = roots if isinstance(roots, list) else [roots]
        elements = []
        clean_name = self._clean_message_name(message_name)
        
        # WSDL 2.0: element ссылается напрямую на schema - пробуем извлечь из schema
        for root in roots_list:
            schema_elements = await self._extract_schema_elements(root, clean_name)
            if schema_elements:
                return schema_elements
        
        # WSDL 1.1: ищем сообщение
        for root in roots_list:
            messages = root.findall('.//wsdl:message', self.namespaces)
            for message in messages:
                msg_name = message.get('name', '')
                if msg_name == message_name or self._clean_message_name(msg_name) == clean_name:
                    parts = message.findall('wsdl:part', self.namespaces)
                    
                    for part in parts:
                        part_name = part.get('name', '')
                        part_element = part.get('element', '')
                        part_type = part.get('type', '')
                        
                        # Если есть element, пытаемся найти его в schema
                        if part_element:
                            schema_elements = []
                            for schema_root in roots_list:
                                schema_elements = await self._extract_schema_elements(schema_root, part_element)
                                if schema_elements:
                                    break
                            if schema_elements:
                                elements.extend(schema_elements)
                            else:
                                # Fallback: создаем элемент на основе имени
                                element_info = {
                                    'name': self._clean_message_name(part_element) or part_name or 'parameter',
                                    'element': self._clean_message_name(part_element),
                                    'type': 'string',  # Дефолтный тип
                                    'required': True
                                }
                                elements.append(element_info)
                        
                        # Если есть type, используем его
                        elif part_type:
                            element_info = {
                                'name': part_name or 'parameter',
                                'element': '',
                                'type': self._clean_message_name(part_type),
                                'required': True
                            }
                            elements.append(element_info)
                        
                        # Fallback случай - создаем базовый элемент
                        else:
                            element_info = {
                                'name': part_name or f'param_{len(elements) + 1}',
                                'element': '',
                                'type': 'string',
                                'required': True
                            }
                            elements.append(element_info)
            
            if elements:
                break
        
        # Если элементы не найдены, создаем базовые для демонстрации
        if not elements:
            logger.warning(f"Элементы для сообщения {message_name} не найдены, создаем базовые")
            elements = [
                {
                    'name': 'parameter1',
                    'element': '',
                    'type': 'string',
                    'required': True
                },
                {
                    'name': 'parameter2', 
                    'element': '',
                    'type': 'string',
                    'required': False
                }
            ]
        
        return elements
    
    async def _extract_schema_elements(self, root: ET.Element, element_name: str) -> List[Dict]:
        """
        Извлекает элементы из XSD схемы с fallback логикой
        """
        elements = []
        clean_element_name = self._clean_message_name(element_name)
        
        try:
            # Ищем schema в WSDL
            schemas = root.findall('.//xsd:schema', self.namespaces)
            if not schemas:
                # Пробуем найти schema без namespace
                schemas = root.findall('.//schema')
            
            for schema in schemas:
                # Ищем элемент в schema
                schema_elements = schema.findall(f'.//xsd:element[@name="{clean_element_name}"]', self.namespaces)
                if not schema_elements:
                    # Пробуем без namespace
                    schema_elements = schema.findall(f'.//element[@name="{clean_element_name}"]')
                
                for schema_element in schema_elements:
                    # Извлекаем информацию об элементе
                    element_type = schema_element.get('type', 'string')
                    
                    # Если элемент имеет сложный тип, пытаемся его разобрать
                    complex_type = schema_element.find('xsd:complexType', self.namespaces)
                    if complex_type is not None:
                        # Ищем вложенные элементы
                        sequence = complex_type.find('.//xsd:sequence', self.namespaces)
                        if sequence is not None:
                            nested_elements = sequence.findall('xsd:element', self.namespaces)
                            for nested in nested_elements:
                                nested_name = nested.get('name', '')
                                nested_type = nested.get('type', 'string')
                                if nested_name:
                                    elements.append({
                                        'name': nested_name,
                                        'element': nested_name,
                                        'type': self._clean_message_name(nested_type),
                                        'required': nested.get('minOccurs', '1') != '0'
                                    })
                    else:
                        # Простой элемент
                        elements.append({
                            'name': clean_element_name,
                            'element': clean_element_name,
                            'type': self._clean_message_name(element_type),
                            'required': True
                        })
                        
        except Exception as e:
            logger.warning(f"Ошибка при разборе XSD схемы для {element_name}: {e}")
            # Возвращаем пустой список, чтобы сработал fallback
        
        return elements
    
    def _clean_message_name(self, name: str) -> str:
        """Убирает namespace префиксы из имени"""
        if ':' in name:
            return name.split(':')[-1]
        return name
    
    def _get_local_name(self, tag: str) -> str:
        """Извлекает локальное имя из тега (без namespace)"""
        if tag and '}' in tag:
            return tag.split('}', 1)[1]
        return tag or ''
    
    def _find_elements_by_local_name(self, root: ET.Element, local_name: str) -> List[ET.Element]:
        """Находит элементы по локальному имени (игнорируя namespace)"""
        result = []
        for elem in root.iter():
            if self._get_local_name(elem.tag) == local_name:
                result.append(elem)
        return result
    
    def generate_soap_envelope(self, operation: WSDLOperation, request_data: Dict[str, Any] = None) -> str:
        """
        Генерирует SOAP envelope для операции
        
        Args:
            operation: SOAP операция
            request_data: Данные для заполнения envelope
            
        Returns:
            str: SOAP envelope XML
        """
        
        if request_data is None:
            request_data = {}
        
        target_ns = self.namespaces.get('tns', 'http://tempuri.org/')
        
        # Базовый SOAP envelope с правильным форматированием
        envelope_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
            f'               xmlns:tns="{target_ns}">',
            '    <soap:Header/>',
            '    <soap:Body>',
            f'        <tns:{operation.name}>'
        ]
        
        # Добавляем входные параметры с красивым форматированием
        if operation.input_elements:
            for element in operation.input_elements:
                element_name = element['name']
                element_value = request_data.get(element_name, self._generate_sample_value(element))
                element_type = element.get('type', '')
                
                # Добавляем комментарий с типом если есть
                if element_type:
                    envelope_lines.append(f'            <!-- {element_name}: {element_type} -->')
                
                envelope_lines.append(f'            <tns:{element_name}>{element_value}</tns:{element_name}>')
        else:
            envelope_lines.append('            <!-- No input parameters -->')
        
        envelope_lines.extend([
            f'        </tns:{operation.name}>',
            '    </soap:Body>',
            '</soap:Envelope>'
        ])
        
        return '\n'.join(envelope_lines)
    
    def generate_soap_response(self, operation: WSDLOperation, response_data: Dict[str, Any] = None) -> str:
        """
        Генерирует SOAP response для операции
        
        Args:
            operation: SOAP операция
            response_data: Данные для заполнения ответа
            
        Returns:
            str: SOAP response XML
        """
        
        if response_data is None:
            response_data = {}
        
        response_name = f"{operation.name}Response"
        target_ns = self.namespaces.get('tns', 'http://tempuri.org/')
        
        # SOAP response envelope с правильным форматированием
        envelope_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
            f'               xmlns:tns="{target_ns}">',
            '    <soap:Body>',
            f'        <tns:{response_name}>'
        ]
        
        # Добавляем выходные параметры с красивым форматированием
        if operation.output_elements:
            for element in operation.output_elements:
                element_name = element['name']
                element_value = response_data.get(element_name, self._generate_sample_value(element))
                element_type = element.get('type', '')
                
                # Добавляем комментарий с типом если есть
                if element_type:
                    envelope_lines.append(f'            <!-- {element_name}: {element_type} -->')
                
                envelope_lines.append(f'            <tns:{element_name}>{element_value}</tns:{element_name}>')
        else:
            # Если нет выходных элементов, добавляем базовый ответ
            envelope_lines.extend([
                '            <!-- Standard success response -->',
                f'            <tns:Result>Operation {operation.name} completed successfully</tns:Result>',
                '            <tns:Status>SUCCESS</tns:Status>',
                '            <tns:Timestamp>2024-01-01T10:30:00Z</tns:Timestamp>'
            ])
        
        envelope_lines.extend([
            f'        </tns:{response_name}>',
            '    </soap:Body>',
            '</soap:Envelope>'
        ])
        
        return '\n'.join(envelope_lines)
    
    def _generate_sample_value(self, element: Dict) -> str:
        """Генерирует реалистичное примерное значение для элемента на основе типа и имени"""
        
        element_type = element.get('type', '').lower()
        element_name = element.get('name', '').lower()
        
        # Специфичные имена полей
        if any(name in element_name for name in ['id', 'identifier']):
            return "12345"
        elif any(name in element_name for name in ['name', 'title', 'label']):
            return f"Example {element['name']}"
        elif any(name in element_name for name in ['email', 'mail']):
            return "example@domain.com"
        elif any(name in element_name for name in ['phone', 'tel']):
            return "+1234567890"
        elif any(name in element_name for name in ['url', 'link']):
            return "https://example.com"
        elif any(name in element_name for name in ['address', 'location']):
            return "123 Main Street, City, Country"
        elif any(name in element_name for name in ['price', 'cost', 'amount']):
            return "99.99"
        elif any(name in element_name for name in ['count', 'quantity', 'number']):
            return "10"
        elif any(name in element_name for name in ['status', 'state']):
            return "active"
        elif any(name in element_name for name in ['description', 'comment', 'note']):
            return f"Description for {element['name']}"
        elif any(name in element_name for name in ['code', 'key']):
            return f"CODE_{element['name'].upper()}"
        elif any(name in element_name for name in ['version']):
            return "1.0"
        elif any(name in element_name for name in ['user', 'customer', 'client']):
            return "John Doe"
        
        # Типы данных XML Schema
        if element_type in ['xs:string', 'xsd:string', 'string']:
            return f"sample_{element['name']}"
        elif element_type in ['xs:int', 'xs:integer', 'xsd:int', 'xsd:integer', 'int', 'integer']:
            return "123"
        elif element_type in ['xs:long', 'xsd:long', 'long']:
            return "1234567890"
        elif element_type in ['xs:float', 'xs:double', 'xsd:float', 'xsd:double', 'float', 'double']:
            return "123.45"
        elif element_type in ['xs:decimal', 'xsd:decimal', 'decimal']:
            return "99.99"
        elif element_type in ['xs:boolean', 'xsd:boolean', 'boolean']:
            return "true"
        elif element_type in ['xs:date', 'xsd:date', 'date']:
            return "2024-01-01"
        elif element_type in ['xs:datetime', 'xsd:datetime', 'datetime']:
            return "2024-01-01T10:30:00Z"
        elif element_type in ['xs:time', 'xsd:time', 'time']:
            return "10:30:00"
        elif element_type in ['xs:base64binary', 'xsd:base64binary', 'base64binary']:
            return "U2FtcGxlIGJhc2U2NCBkYXRh"
        elif element_type in ['xs:hexbinary', 'xsd:hexbinary', 'hexbinary']:
            return "48656C6C6F"
        
        # Общие типы на основе ключевых слов
        if any(word in element_type for word in ['string', 'text']):
            return f"sample_{element['name']}"
        elif any(word in element_type for word in ['int', 'number', 'numeric']):
            return "123"
        elif any(word in element_type for word in ['bool', 'boolean']):
            return "true"
        elif any(word in element_type for word in ['date', 'time']):
            return "2024-01-01T10:30:00Z"
        elif any(word in element_type for word in ['money', 'currency', 'price']):
            return "99.99"
        elif any(word in element_type for word in ['percent']):
            return "85.5"
        
        # Fallback
        return f"sample_{element['name']}"
    
    async def close(self):
        """Закрытие HTTP клиента"""
        await self.http_client.aclose() 