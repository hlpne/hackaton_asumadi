# База продукта

Полная схема, значения полей, запуск для Windows/Linux/macOS, обновление БД,
проверки и устранение ошибок: **[docs/db.md](../docs/db.md)**.

PostgreSQL 16 хранит внутренние справочники и таблицу готовых прогнозов.
Исходные файлы телематики и валидаций не относятся к этой схеме.

| Путь | Назначение |
|---|---|
| `migrations/001_initial.sql` | Четыре таблицы, ключи, ограничения и индексы |
| `seed/002_demo.sql` | 3 маршрута, 24 остановки, 48 связей и 648 почасовых demo-прогнозов |
| `seed/generate_seed.py` | Детерминированный генератор SQL и общего `mock_data/catalog.json` |
| `scripts/manage.sh` | Применить SQL, загрузить seed, проверить БД, открыть psql |
| `tests/check.sql` | Проверка связей и ограничений с откатом тестовых строк |
| `tests/status.sql` | Версия сервера, таблицы и количество строк |
| `compose.test.yml` | Изолированная приёмка на пустом PostgreSQL 16 |
| `scripts/acceptance.sh` | Повторное применение схемы/seed и запуск SQL-проверок |

Все следующие команды выполняются **из корня проекта**:

```bash
docker compose up -d --wait db
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh status
docker compose exec -T db sh /opt/transport/db/scripts/manage.sh check
```

Ожидаемый результат последней команды: `DB_CHECK_OK`, код завершения `0`.

Полная приёмка на отдельной пустой БД одной командой:

```bash
docker compose -f db/compose.test.yml up --force-recreate --abort-on-container-exit --exit-code-from check
```

Ожидается `DB_ACCEPTANCE_OK` и код завершения `0`.
Тест не использует рабочий volume и не занимает порт 5432 на компьютере.

Скрипты первой инициализации выполняются только при пустом volume. Для существующей
БД команды обновления приведены в `docs/db.md`; удалять volume для обновления не нужно.
Секреты из окружения команды не выводят. Файл `.env` в Git не добавляется.
