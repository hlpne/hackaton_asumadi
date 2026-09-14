# Передача DB-задачи руководителю

Ветка `feature/i-reznik/db-schema` уже опубликована. Коммит `dfc3cae` содержит
DB-доработку. Рабочая БД и изолированный сценарий успешно проверены на PostgreSQL 16.15;
подтверждения находятся в [db-verification.md](db-verification.md).

## 1. Дополнение документации в существующей ветке

Корневой README был исключён из исходного патча. Файл `db-review-docs.patch`
добавляет актуальные инструкции и порт 55432, обновляет описание БД и отчёт
полного теста. Патч изменяет только четыре Markdown-файла.
Прежние полные патчи поверх уже применённых DB-изменений не нужны.

Скачайте `db-review-docs.patch` в Downloads, откройте PowerShell:

```powershell
cd "C:\Users\igorp\OneDrive\Desktop\Хакатон\hackaton-asumadi-db-review"
git status
$reviewPatch = Join-Path $env:USERPROFILE "Downloads\db-review-docs.patch"
Test-Path "$reviewPatch"
git apply --check "$reviewPatch"
$LASTEXITCODE
```

Ожидается нужная ветка, отсутствие незавершённых изменений, `True` для файла
и код `0` после проверки. Если файл скачан в другую папку, измените путь.
Если `--check` сообщает ошибку, сохраните её текст и не применяйте патч принудительно.

При успешной проверке:

```powershell
git apply "$reviewPatch"
git diff --stat
git add README.md docs/db.md docs/db-verification.md docs/github-db-review.md
git diff --cached --name-status
git commit -m "docs: sync database instructions and verification"
git push
```

Новый коммит добавится в ту же удалённую ветку. Создавать ветку заново, заново
клонировать проект или использовать force push не требуется. `.env` в эти изменения
не входит. SQL, Compose и код приложения патч не меняет.

## 2. Открыть Pull Request

Откройте сравнение:

[main → feature/i-reznik/db-schema](https://github.com/hlpne/hackaton_asumadi/compare/main...feature/i-reznik/db-schema?expand=1)

Проверьте base `main` и compare `feature/i-reznik/db-schema`, затем нажмите
**Create pull request**. Если PR уже создан, откройте его: новые коммиты той же
ветки появятся в нём автоматически.

Заголовок: **PostgreSQL: схема MVP, тесты и инструкция запуска**.

Описание для копирования:

```text
Подготовлена DB-часть MVP: внутренняя схема из routes, stops, route_stops и forecasts,
команды управления БД, SQL-проверки и подробная инструкция для команды.

Проверено в Windows PowerShell и Docker на PostgreSQL 16.15:
- рабочая БД Healthy, данные сохраняются после перезапуска;
- 3 маршрута, 24 остановки, 48 связей;
- SQL-проверка завершилась DB_CHECK_OK;
- приёмка на новой БД: SEED_REPEAT_OK и DB_ACCEPTANCE_OK, контейнер проверки завершился с кодом 0.

Внешний порт команды — 55432, внутренний PostgreSQL — 5432.
Схема и запуск: docs/db.md. Результаты: docs/db-verification.md.
Принадлежность остановки маршруту/направлению проверяет backend; SQL-внешние ключи
обеспечивают существование справочных объектов. Это ограничение описано в документации.
Постоянный seed прогнозов относится к следующей задаче.

Прошу проверить изменения и объединить ветку после ревью.
```

Проверьте вкладку **Files changed**, приложите вывод приёмки и назначьте руководителя
ревьюером, если он доступен в списке. Объединение с main оставьте руководителю.
