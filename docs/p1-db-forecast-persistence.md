# P1: технические долги схемы прогнозов

## Принятые решения

1. Согласованность `route_id` / `stop_id` / `direction_id` гарантирует PostgreSQL,
   а не только backend. Триггер `forecasts_route_stop_direction_guard` проверяет
   существование связи в `route_stops` и блокирует запись несовместимой комбинации.
   Для старых однозначных строк без `direction_id` направление восстанавливается
   автоматически. Неоднозначная связь отклоняется. Обратный триггер не позволяет
   удалить последнюю связь, на которую опирается сохранённый прогноз.
2. `GET /forecast` по-прежнему только вычисляет прогноз. `POST /forecast` принимает
   `ForecastRequest` в JSON, вычисляет и валидирует ответ тем же Model Adapter, затем
   атомарно выполняет upsert всех точек в `forecasts`.
3. Собственный runner ведёт `schema_migrations`: номер, имя, SHA-256 и время
   применения. Изменение уже применённого SQL обнаруживается как checksum mismatch.
4. `model_runs` реализован как реестр публичных метаданных версии модели.
   `forecasts.model_version` связан с ним внешним ключом. Повторное использование
   одной версии с другими `is_mock`, `value_unit` или `aggregation` отклоняется с
   обеих сторон: как при записи прогноза, так и при попытке изменить уже
   используемую строку `model_runs`. `interval_level` может отсутствовать у серии
   без интервалов; конфликтом считаются только разные ненулевые уровни.
5. `routes.geometry` на этом этапе **отложен осознанно**. Текущая геометрия имеет
   отдельные линии для направлений 0 и 1 и хранит OSM provenance. Одно поле в
   `routes` потеряло бы эту структуру. До подключения PostGIS/GeoJSON-нормализации
   источником остаётся `mock_data/osm_trams.json` и endpoint
   `GET /routes/{route_id}/geometry`. Будущая целевая сущность —
   `route_geometries(route_id, direction_id, geometry, source, source_version)`.

## Миграции

Файлы выполняются по номеру:

- `001_initial.sql` — базовые таблицы;
- `002_transit_schedule.sql` — расписание;
- `003_forecast_persistence.sql` — согласованность прогнозов, `model_runs`,
  поддержка `schedule`/`PT1M`, индекс сохранённых рядов.

Применить к существующему volume:

```bash
docker compose up -d --wait db
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh migrate
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh check
```

Повторный `migrate` выводит `Skipping ... (already applied)`. Старые БД без журнала
безопасно проходят повторяемые `001`/`002`, получают `003`, после чего все три
версии фиксируются в `schema_migrations`.

Для новой пустой БД `db/scripts/init.sh` вызывается стандартным PostgreSQL
docker-entrypoint, применяет миграции через runner и только затем загружает seed.

## Сохранение прогноза

Endpoint доступен только при `CATALOG_BACKEND=postgres`:

```http
POST /forecast
Content-Type: application/json
```

```json
{
  "route_id": "demo-17",
  "stop_id": "demo-17-s01",
  "direction_id": 0,
  "horizon": "day",
  "from": "2026-09-26T08:00:00+03:00",
  "to": "2026-09-26T10:00:00+03:00"
}
```

Ответ:

```json
{
  "contract_version": "1.0",
  "series_key": {
    "route_id": "demo-17",
    "stop_id": "demo-17-s01",
    "direction_id": 0
  },
  "horizon": "day",
  "resolution": "PT1H",
  "forecast_origin": "2026-09-26T08:00:00+03:00",
  "model_version": "mock-v0",
  "saved_points": 2
}
```

Повтор того же запроса обновляет совпавшие точки и не создаёт дубли. В режиме
`CATALOG_BACKEND=memory` endpoint отвечает `503 PERSISTENCE_DISABLED`; это защищает
локальный mock-запуск от ложного сообщения об успешном сохранении.

Если `stop_id` однозначно встречается только в одном направлении маршрута, backend
добавляет отсутствующий `direction_id` до вызова модели и возвращает фактически
сохранённый ключ. Для неоднозначной остановки `direction_id` обязателен. База данных
повторяет ту же проверку независимо от API.

## Проверка

```bash
docker compose -f db/compose.test.yml up --force-recreate \
  --abort-on-container-exit --exit-code-from check
```

Ожидаются `DB_CHECK_OK`, `DB_ACCEPTANCE_OK` и код `0`. Проверяются журнал миграций,
checksum, точное соответствие `route_stops`, защита удаления, регистрация
`model_runs`, поддержка `PT1M`/`schedule` и повторяемость seed.
