# Прогноз пассажиропотока трамваев

Стартовый mono-repo для Хакатона Московского транспорта 2026. Выполнены две начальные задачи: архитектура и контракт ML ↔ Backend, базовая структура с локально запускаемыми FastAPI и React.

Приложение показывает **демонстрационный прогноз** из backend: можно выбрать условный маршрут, остановку, дату и горизонт. Target ещё не определён; `predicted_load` сейчас означает синтетический индекс, не количество пассажиров и не процент заполнения.

Основной документ: [архитектура и контракт](docs/architecture.md). Примеры [request](docs/examples/forecast-request.json) и [response](docs/examples/forecast-response.json). Результаты проверок и ограничения: [verification.md](docs/verification.md).

DB-задача: [подробная схема, запуск и тесты](docs/db.md),
[подтверждённый Docker-прогон](docs/db-verification.md) и
[инструкция отправки на ревью](docs/github-db-review.md).
В Compose сохранён внешний порт команды **55432**; backend внутри Docker использует `db:5432`.

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

Для командной работы клонируйте общий репозиторий:

```bash
git clone https://github.com/hlpne/hackaton_asumadi.git
cd hackaton_asumadi
```

Для просмотра незамерженной задачи перейдите в соответствующую ветку команды.
Распакованный архив можно запускать отдельно, но для отправки изменений используйте
клон репозитория и патч. Повторный `git init` и загрузка `.bundle` в репозиторий не нужны.

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

Начальная схема и seed применяются автоматически только при создании пустой БД.
Порядок обновления без удаления данных — в [docs/db.md](docs/db.md).
Запуск PostgreSQL 16.15, сохранность данных после restart и SQL-проверки подтверждены
участником; подробности и границы проверки — в [отчёте](docs/db-verification.md).

## 5. Локальные приложения с PostgreSQL в Docker

Из корня:

```bash
docker compose up -d db
```

В `.env` установите `CATALOG_BACKEND=postgres`, `DB_HOST=127.0.0.1`,
**`DB_PORT=55432`** и согласованные `POSTGRES_*`. Это порт подключения с компьютера
к контейнеру в текущей конфигурации команды. Внутри Compose backend продолжает
использовать `DB_PORT=5432`. Запустите backend/frontend командами из раздела 3.
`/health` должен вернуть `database: "ok"`.

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

БД, из корня проекта, одинаково в PowerShell и Linux/macOS:

```bash
docker compose up -d --wait db
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh status
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh check
```

Ожидается `DB_CHECK_OK`. Для изолированной приёмки новой БД:

```bash
docker compose -f db/compose.test.yml up --force-recreate --abort-on-container-exit --exit-code-from check
```

Ожидается `DB_ACCEPTANCE_OK` и код завершения `0`. Рабочие данные не затрагиваются.
Подготовка Docker, сохранность volume и диагностика описаны в [docs/db.md](docs/db.md).

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

`requirements.txt`, `requirements-dev.txt` и `package-lock.json` фиксируют проверенные версии зависимостей. Для запуска backend используется `requirements.txt`, а для разработки и тестов — `requirements-dev.txt`; frontend устанавливается через `npm ci`.

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
