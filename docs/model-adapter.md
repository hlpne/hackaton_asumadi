# Model Adapter: подключение, запуск и приёмка

## 1. Что закрывает эта задача

HTTP-обработчики и `forecast_service.py` работают только с
`Predictor.predict(ForecastRequest) -> ForecastResponse`. Они не импортируют
CatBoost, не открывают файлы модели и не формируют ML-признаки.
`ForecastResponse.points` содержит `list[ForecastPoint]`; оболочка нужна для
существующего контракта v1 — единиц измерения, агрегации, origin, версии модели.
Замена оболочки на голый список сломала бы текущих потребителей API.

| Провайдер | Настройка `PREDICTOR_FACTORY` | Результат |
| --- | --- | --- |
| Основной mock | `app.predictors.mock:build_predictor` | Детерминированная синтетика, иллюстративные границы ±15% |
| Проверочный constant | `app.predictors.constant:build_predictor` | Всегда 42, границы `null` |
| Файл модели | `app.predictors.artifact:build_predictor` | `.cbm` или `.pkl`, выход приводится к тому же контракту |

Фабрика вызывается один раз при создании приложения (один раз на worker).
Замена файла или `.env` требует перезапуска backend. Обучение внутри HTTP-запроса
не выполняется. Вызовы файлового estimator сериализуются блокировкой; для больших
нагрузок batch inference и производительность оцениваются отдельной задачей.
Прогнозы по-прежнему рассчитываются провайдером; чтение/запись таблицы `forecasts`
этот этап не добавляет.

## 2. Быстрый запуск на Windows PowerShell

Все команды этого раздела выполняются **из корня проекта**. Нужен Python 3.12.
Если виртуальное окружение уже создано, первую команду пропустите.

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt -r backend/requirements-model-example.txt
.\backend\.venv\Scripts\python.exe backend/scripts/build_example_model.py
```

Скрипт создаёт три файла в `models/` и выводит `EXAMPLE_MODEL_OK`.
Он обучает маленькую CatBoost на значениях существующего mock и сохраняет один
estimator в двух форматах. Это технический пример, без оценки качества прогноза.
Повторный запуск перезаписывает только три файла `example.*`.

Если `.env` ещё нет, создайте его командой `Copy-Item .env.example .env`.
В существующем файле **замените** значение `PREDICTOR_FACTORY`, не добавляя дубль,
и задайте:

```dotenv
CATALOG_BACKEND=memory
PREDICTOR_FACTORY=app.predictors.artifact:build_predictor
MODEL_PATH=models/example.cbm
MODEL_METADATA_PATH=models/example.metadata.json
```

Пути отсчитываются от корня проекта, а не от текущей папки терминала.
Переменные окружения терминала имеют приоритет над `.env`: если раньше задавали
`$env:PREDICTOR_FACTORY` или `$env:MODEL_PATH`, удалите/обновите именно их.

Терминал 1, из корня:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Терминал 2, также из корня:

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/check_model_api.py --expected-model catboost-example-v1
$LASTEXITCODE
```

Ожидается по строке `PASS` для `day`, `month`, `year`, затем
`MODEL_ADAPTER_OK` и `0`. Скрипт проверяет API напрямую, поэтому локальный
fallback текущего frontend не может скрыть ошибку backend.
Проверочный каталог должен содержать seed-маршрут `demo-17` и его 8 остановок
в направлении 0; подходит `memory` или текущий demo seed PostgreSQL.

Остановите сервер `Ctrl+C`, замените в `.env` путь на `models/example.pkl`,
повторите запуск сервера и ту же команду проверки. Версия модели остаётся
`catboost-example-v1`, поскольку оба файла содержат одну обученную модель.
Frontend для этого теста не требуется; его можно запустить по корневому README.

## 3. Linux/macOS

Те же настройки `.env`, команды из корня проекта:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt -r backend/requirements-model-example.txt
backend/.venv/bin/python backend/scripts/build_example_model.py
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Во втором терминале:

```bash
backend/.venv/bin/python backend/scripts/check_model_api.py --expected-model catboost-example-v1
echo $?
```

Если окружение уже существует, не создавайте его заново. Проверка `.pkl`
выполняется той же сменой `MODEL_PATH` и перезапуском.

## 4. Запуск в Docker

Сначала создайте `example.*` локально, как выше. При сборке модель не обучается.
Дополнительный Compose-файл устанавливает опциональные ML-зависимости и
монтирует `./models` в `/project/models` только для чтения.
В корневом `.env` используйте относительные пути `models/example.cbm`
и `models/example.metadata.json`; путь вида `C:\...` не является путём контейнера.

```bash
docker compose -f docker-compose.yml -f docker-compose.model.yml config
docker compose -f docker-compose.yml -f docker-compose.model.yml up -d --build --wait
docker compose -f docker-compose.yml -f docker-compose.model.yml logs --tail=100 backend
```

Команда `config` может показывать значения настроек подключения; весь её вывод
не нужно публиковать в PR. После запуска используйте `check_model_api.py` с хоста.
При смене `.cbm` на `.pkl`:

```bash
docker compose -f docker-compose.yml -f docker-compose.model.yml up -d --force-recreate --wait backend
```

Базовый `docker-compose.yml`, внешний порт PostgreSQL **55432** и SQL-схема
сохранены. Обычная сборка без override не устанавливает CatBoost.

## 5. Как подключить модель команды

1. Согласуйте target, единицу `value_unit` и агрегацию одного интервала.
2. Сохраните обученный estimator и preprocessing. Передайте вместе с ним версии
   Python/библиотек, описание признаков и поддерживаемых горизонтов.
3. Если модель принимает ровно признаки `tram-calendar-v1`, используйте готовый
   `artifact.py`. Для другой схемы скопируйте этот модуль в, например, `team_model.py`
   и реализуйте загрузку, признаки и преобразование результата внутри него.
4. Укажите `PREDICTOR_FACTORY=app.predictors.team_model:build_predictor`
   (для готового примера — `app.predictors.artifact:build_predictor`).
   Установите зависимости выбранной модели и перезапустите backend.
   `main.py`, каталог, HTTP-формат и frontend для замены провайдера не меняются.
5. Проверьте ответ через API и тесты. Проверка транспорта данных не подтверждает
   качество модели; её временная валидация и метрики относятся к ML-задаче.

Для готового адаптера рядом с файлом требуется JSON, указанный в
`MODEL_METADATA_PATH`. Пример **для реальной модели только после согласования
того, что она прогнозирует число посадок за интервал**:

```json
{
  "feature_schema": "tram-calendar-v1",
  "model_version": "team-boardings-v1",
  "value_unit": "boardings",
  "aggregation": "sum",
  "is_mock": false,
  "supported_horizons": ["day", "month", "year"]
}
```

Это пример метаданных, а не утверждение об уже выбранном target проекта.
В сгенерированном `example.metadata.json` остаются `demo_index`, `demo_mean`
и `is_mock=true`. Нельзя менять только флаг, выдавая синтетику за реальную модель.
Если модель обучена только для `day`, укажите только `day`; остальные горизонты
будут возвращать 503, пока их не поддержит модель или ваш адаптер агрегации.

### Признаки `tram-calendar-v1`

`feature_rows()` возвращает список строк в строго фиксированном порядке:

| Колонка | Тип и смысл |
| --- | --- |
| `route_id` | Категория, исходный ID маршрута |
| `stop_id` | Категория: JSON-строка ID; строка `null` для уровня маршрута |
| `direction_id` | Категория: строка `0`, `1` либо `null` |
| `horizon` | Категория `day`, `month`, `year` |
| `hour` | Час начала интервала, 0–23, Москва |
| `weekday` | День недели, понедельник 0, воскресенье 6 |
| `month` | Номер месяца, 1–12 |
| `day` | День месяца |
| `lead_hours` | Часы между началом интервала и `forecast_origin` |

Для обучения используйте ту же функцию, порядок `FEATURE_NAMES` и индексы
категорий `CAT_FEATURES=[0,1,2,3]`. CatBoost, обученная с именами признаков,
проверяется на совпадение имён при загрузке. Pickle-estimator без `feature_names_`
должен соблюдать этот порядок по договорённости с автором.

Одна строка признаков — один выходной интервал: час, календарный день или месяц.
Модель должна быть обучена на target соответствующего интервала. Значение в
начале месяца нельзя автоматически считать суммой или средним за месяц.
Нет универсального преобразования произвольной модели в этот пример: лаги,
погода, telemetry, mappings ID и preprocessing будущего baseline реализуются
в модуле провайдера. Возврат модели должен быть одномерным числовым рядом;
матрицы, отрицательные значения, NaN/Infinity и неправильная длина отклоняются.

### Сериализация

Для CatBoost: `model.save_model("models/team.cbm", format="cbm")`.
Адаптер использует `CatBoostRegressor.load_model(..., format="cbm")`.
Для pickle: `pickle.dump(model_or_pipeline, stream, protocol=5)` в бинарный файл.
Объект должен иметь `predict(rows)` и возвращать одно число для каждой строки.
Pipeline должен включать нужное кодирование категорий и обратное преобразование
target, если оно использовалось; готовый адаптер этого за него не делает.

Загружайте `.pkl` только от доверенного автора: распаковка может выполнять Python-код.
Окружение загрузки должно соответствовать окружению обучения; расширение `.pkl`
не гарантирует совместимость между версиями или форматами joblib/cloudpickle.
Модели не принимаются через HTTP и не добавляются в Git.

Основания: [CatBoost load_model](https://catboost.ai/docs/en/concepts/python-reference_catboostregressor_load_model),
[порядок признаков CatBoost](https://catboost.ai/docs/en/concepts/python-reference_catboostregressor_predict),
[сохранение моделей и ограничения pickle](https://scikit-learn.org/stable/model_persistence.html).

## 6. Тесты и ожидаемый результат

Перед тестами используйте `PREDICTOR_FACTORY=app.predictors.mock:build_predictor`
в `.env` либо переменной окружения терминала и `CATALOG_BACKEND=memory`.
Тесты сами подменяют provider в отдельных приложениях. Это исключает загрузку
вашего рабочего артефакта при импорте глобального приложения `app.main`.

Из `backend/`, Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Linux/macOS:

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

С CatBoost установленной из `requirements-model-example.txt`: **85 passed**.
Без опциональной CatBoost: **83 passed, 2 skipped**; пропущены именно два теста
реальных файлов. Для приёмки `.cbm/.pkl` установите опциональный requirements
и повторите тесты — пропуски не подтверждают работу этих форматов.

Проверяются старые API-контракты, фабрика, однократная загрузка, значения и сетка,
nullable-интервалы, оба файловых формата, все горизонты, февраль високосного года,
согласованность `/forecast`, `/forecast/map`, `/forecast/top-overload`, отклонение
некорректного выхода. Файлы для тестов создаются во временной папке;
пользовательские `models/` и БД не изменяются.

## 7. Ошибки и возврат к mock

| Симптом | Действие |
| --- | --- |
| `MODEL_PATH is required` | Укажите обе MODEL-настройки и перезапустите backend |
| Файл не найден | Проверьте путь от корня проекта; в Docker — путь контейнера |
| `ModuleNotFoundError: catboost` | Установите optional requirements или используйте Compose override |
| `Model features do not match` | Согласуйте тренировочную схему с `feature_rows`, либо создайте свой модуль |
| API 502 `INVALID_PREDICTION` | Выход модели нарушает контракт; проверьте логи и результат estimator |
| API 503 `PREDICTOR_UNAVAILABLE` | Ошибка inference или неподдерживаемый горизонт; backend не подменяет результат mock |
| На странице прогноз есть, проверка API падает | Существующий frontend может включать локальный fallback; ориентируйтесь на прямую проверку API |
| `Address already in use` | Остановите прежний backend или задайте другой порт и `--base-url` проверке |

Ошибки загрузки/конфигурации останавливают запуск приложения. Readiness показывает
готовность каталога, но не проверяет качество и все режимы inference модели.
Детали исключений провайдера не выдаются клиенту.

Для возврата установите `PREDICTOR_FACTORY=app.predictors.mock:build_predictor`
и перезапустите локальный backend. MODEL-пути при этом не используются.
В Docker примените **только базовый Compose**, иначе override снова выберет artifact:

```bash
docker compose -f docker-compose.yml up -d --build --force-recreate --wait backend
```

Проверьте `check_model_api.py --expected-model mock-v0` тем же Python из окружения.
Для constant — `--expected-model constant-demo-v0`. Ожидается `MODEL_ADAPTER_OK`.

## 8. Границы выполненного этапа

Схема БД, seed, HTTP-контракт и frontend не изменены. Вторая задача включает
отдельную доработку графика и UI, описанную в [next-frontend-task.md](next-frontend-task.md).
Текущий пример не добавляет actual, интервальную модель, кеш прогнозов или ML baseline.
Результаты выполнения и ограничения среды: [model-adapter-verification.md](model-adapter-verification.md).
