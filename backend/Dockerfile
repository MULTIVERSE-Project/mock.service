FROM python:3.11-slim

WORKDIR /app

# Копирование и установка Python зависимостей
COPY requirements.txt .
RUN pip install --progress-bar off --no-cache-dir -r requirements.txt 
# Копирование исходного кода
COPY . .

# Создание директории для данных
RUN mkdir -p data

# Открытие порта
EXPOSE 8080

# Команда запуска
CMD sh -c 'export http_proxy= && export https_proxy= && echo $http_proxy && uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload'