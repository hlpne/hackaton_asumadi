# База продукта

PostgreSQL 16 хранит справочники и, в следующем этапе, готовые прогнозы. Исходные файлы телематики и валидаций не относятся к этой схеме.

- `migrations/001_initial.sql` — начальная схема.
- `seed/002_demo.sql` — воспроизводимый демонстрационный справочник.
- `seed/generate_seed.py` — общий генератор SQL и `mock_data/catalog.json`.

При первом запуске Compose оба SQL-файла выполняются по порядку. Скрипты `docker-entrypoint-initdb.d` запускаются **только при пустом volume**, а не при каждом старте контейнера. Изменение SQL-файла само по себе не обновляет существующую базу.

Поднять только БД из корня проекта:

```bash
docker compose up -d db
```

Проверить подключение (демонстрационные имя пользователя и БД):

```bash
docker compose exec db psql -U transport -d transport -c "SELECT count(*) FROM stops;"
```

При необходимости повторно применить начальную схему и обновить seed без удаления volume:

```bash
docker compose exec db psql -v ON_ERROR_STOP=1 -U transport -d transport -f /docker-entrypoint-initdb.d/001_initial.sql
docker compose exec db psql -v ON_ERROR_STOP=1 -U transport -d transport -f /docker-entrypoint-initdb.d/002_demo.sql
```

`CREATE TABLE IF NOT EXISTS` не меняет уже существующие колонки. Для дальнейших изменений добавляйте отдельную нумерованную миграцию; механизм автоматических обновлений существующей схемы в задачи 1–2 не входит.

В текущем каркасе `PostgresCatalog` читает справочники, а `/health` выполняет `SELECT 1`. Прогноз вычисляется через адаптер и возвращается сразу. Запись прогнозов, выбор последнего запуска модели и кеширование будут отдельными задачами.
