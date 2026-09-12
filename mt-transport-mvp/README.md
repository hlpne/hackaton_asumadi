# Прогноз пассажиропотока трамваев

Стартовый mono-repo для Хакатона Московского транспорта 2026. Выполнены две начальные задачи: архитектура и контракт ML ↔ Backend, базовая структура с локально запускаемыми FastAPI и React.

Приложение показывает **демонстрационный прогноз** из backend: можно выбрать условный маршрут, остановку, дату и горизонт. Target ещё не определён; `predicted_load` сейчас означает синтетический индекс, не количество пассажиров и не процент заполнения.

Основной документ: [архитектура и контракт](docs/architecture.md). Примеры [request](docs/examples/forecast-request.json) и [response](docs/examples/forecast-response.json). Результаты проверок и ограничения: [verification.md](docs/verification.md).

## Что лежит в репозитории

| Путь               | Назначение                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `backend/`           | FastAPI, Pydantic, каталог, два заменяемых провайдера и проверки контракта |
| `frontend/`          | React, TypeScript, Vite, форма запроса и таблица ответа                                          |
| `db/`                | Начальная схема PostgreSQL, seed и инструкции                                                     |
| `docs/`              | Архитектура, схема компонентов Mermaid, JSON-примеры, JSON Schema, OpenAPI               |
| `mock_data/`         | Единый синтетический справочник для локального запуска                    |
| `docker-compose.yml` | PostgreSQL, backend и собранный frontend с Nginx                                                                |
| `.env.example`       | Настройки локальной разработки                                                                 |
| `.gitignore`         | Исключение окружений, node_modules, секретов и временных данных                 |

Схема взаимодействия и принятые ограничения подробно описаны в `docs/architecture.md`. Карта, Top-N, реальные данные и обучение модели не входят в эти две задачи.

## 1. Получить рабочую копию

Переданный ZIP содержит папку `mt-transport-mvp` с исходниками и файл `mt-transport-mvp.bundle` рядом с ней. Bundle — переносимый Git-репозиторий с начальным коммитом и веткой `main`. Он позволяет выполнить настоящее клонирование без GitHub.

После распаковки откройте терминал в папке с `.bundle`:

```bash
git clone mt-transport-mvp.bundle mt-transport-work
cd mt-transport-work
```

Также можно запустить распакованную папку с исходниками напрямую, но без клонирования в ней не будет `.git`. Для командной работы позже назначается общий remote; готового облачного URL в этом пакете нет. Локальный путь к bundle в `origin` — не общий remote команды.

Если команда уже разместила этот код на Git-сервере, клонируйте фактический URL её репозитория вместо bundle.

## 2. Требования

- Python **3.12**.
- Node.js **22.12+** и npm; проверка выполнена на Node 24.
- Git — для клонирования.
- Docker с Compose v2 — только для режима с контейнерами.
- Для первой установки Python/npm-пакетов и загрузки Docker-образов нужен доступ к соответствующим реестрам.

После установки зависимостей сам mock-сценарий не обращается к внешним сервисам. Swagger UI использует внешние CDN-ресурсы; для офлайн-чтения контракта есть локальные JSON Schema и OpenAPI.

## 3. Локальный запуск без Docker и PostgreSQL

Это самый короткий способ проверить обе задачи. Каталог читается из `mock_data/catalog.json`, прогноз возвращает Mock Predictor. `/health` сообщает `database: "disabled"`.

Откройте **два терминала** в корне рабочей копии. Создайте `.env` из примера один раз.

### Windows PowerShell

Терминал 1:

```powershell
Copy-Item .env.example .env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Активация окружения не требуется, поэтому менять ExecutionPolicy не нужно. Если `py` не установлен, используйте `python` после проверки, что это Python 3.12.

Терминал 2:

```powershell
cd frontend
npm ci
npm run dev
```

### Linux или macOS

Терминал 1:

```bash
cp .env.example .env
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Терминал 2:

```bash
cd frontend
npm ci
npm run dev
```

Откройте [приложение](http://localhost:5173), [Swagger](http://localhost:8000/docs) или [healthcheck](http://localhost:8000/health). Выберите маршрут и нажмите «Получить прогноз». Все данные таблицы приходят через `/api/forecast` из backend.

Месяц и год начинаются с первого числа выбранного месяца; сутки — с выбранной даты. Для года возвращаются 12 месячных интервалов, для месяца — дневные, для суток — часовые.

Остановка локальных серверов: `Ctrl+C` в каждом терминале. При повторном запуске окружение и зависимости заново создавать не нужно.

## 4. Запуск всех компонентов через Docker Compose

Из корня проекта, после создания `.env`:

```bash
docker compose up --build
```

Frontend: [localhost:5173](http://localhost:5173), backend: [localhost:8000/docs](http://localhost:8000/docs). Compose задаёт `CATALOG_BACKEND=postgres` для backend независимо от локального `CATALOG_BACKEND=memory` в примере `.env`. Данные БД сохраняются в volume.

Остановить контейнеры, сохранив данные:

```bash
docker compose down
```

Начальная схема и seed применяются автоматически только при создании пустой БД. Подробнее — [db/README.md](db/README.md). В этой поставке конфигурация Compose подготовлена; фактический запуск контейнеров в среде подготовки не проверялся, поскольку Docker недоступен.

## 5. Локальные приложения с PostgreSQL в Docker

Из корня:

```bash
docker compose up -d db
```

В `.env` установите `CATALOG_BACKEND=postgres`, оставьте `DB_HOST=127.0.0.1`, `DB_PORT=5432` и согласованные `POSTGRES_*`. Запустите backend/frontend командами из раздела 3. `/health` должен вернуть `database: "ok"`.

## 6. Проверить замену модели без изменения frontend

В корневом `.env` замените строку:

```dotenv
PREDICTOR_FACTORY=app.predictors.constant:build_predictor
```

Перезапустите **backend**. Изменение `.env` не обязано автоматически запускать перезагрузку Uvicorn. Frontend менять или пересобирать не нужно. Повторный запрос покажет `model_version: constant-demo-v0`, значение 42 во всех точках и прочерки вместо отсутствующих границ.

Для возврата к суточным пикам:

```dotenv
PREDICTOR_FACTORY=app.predictors.mock:build_predictor
```

При Compose изменение настройки применяется командой из корня:

```bash
docker compose up -d --force-recreate backend
```

Будущая реальная модель реализует тот же `Predictor`. Примеры провайдеров находятся в `backend/app/predictors/`; отдельного модуля реальной модели пока нет.

## 7. Команды проверки

Backend, из `backend/`:

```bash
# Linux/macOS
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

```powershell
# Windows PowerShell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend, из `frontend/`:

```bash
npm ci
npm run build
```

Сборка включает проверку TypeScript. Результат — `frontend/dist`; папка не хранится в Git. `npm run preview` открывает собранное приложение на порту 4173 и также проксирует запросы к запущенному backend.

Обновить примеры и схемы после согласованного изменения API, из корня:

```bash
# Linux/macOS
backend/.venv/bin/python backend/scripts/export_contract.py
```

```powershell
# Windows PowerShell
.\backend\.venv\Scripts\python.exe backend/scripts/export_contract.py
```

В Python источником истины служат `backend/app/schemas.py`; TypeScript-описание находится в `frontend/src/types.ts`. При изменении контракта обновляются обе стороны и JSON-артефакты. Автоматическая генерация TypeScript пока не подключена.

`requirements.txt`, `requirements-dev.txt` и `package-lock.json` фиксируют проверенные версии зависимостей. Файлы `.in` — исходные диапазоны для осознанного обновления; обычный запуск использует зафиксированные `.txt` и `npm ci`.

## 8. Если что-то не запускается

| Симптом                                                                   | Что проверить                                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Address already in use`                                                       | Для локального режима нужны свободные порты 8000 и 5173; остановите прежний экземпляр приложения |
| Frontend открыт, но нет маршрутов                            | Откройте`/health` backend; проверьте `BACKEND_PROXY_TARGET`, после его изменения перезапустите Vite                      |
| `/health` возвращает 503                                             | При`CATALOG_BACKEND=postgres` проверьте БД и `POSTGRES_*`; для быстрого mock-запуска верните `memory`                         |
| `ModuleNotFoundError`                                                          | Запускайте команды из`backend/` Python-интерпретатором созданного `.venv`                                                   |
| `npm ci` или Vite сообщают о версии Node                     | Нужен Node 22.12+                                                                                                                                                      |
| Пример query отклоняется с 422                                 | Укажите часовой пояс, правильные границы сетки и кодируйте`+` в URL                                                    |
| После изменения seed в SQL ничего не поменялось | Инициализация Docker не запускается повторно на существующем volume; см. инструкции в`db/README.md`          |

## 9. Работа команды

`main` содержит рабочий интегрированный каркас. Отдельные задачи выполняются в `feature/<short-name>`. Перед объединением запускаются проверки затронутого сценария. Изменение общего JSON согласуется между backend, frontend и ML до merge.

Trello остаётся источником статусов задач; данный пакет сам по себе не изменяет карточки. Архитектурные договорённости находятся в `docs/architecture.md`, команды запуска — здесь, HTTP-контракт — в Pydantic/OpenAPI.
