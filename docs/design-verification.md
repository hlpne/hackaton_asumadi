# Проверка dark-first dispatcher UI

Дата автоматической проверки: 26 сентября 2026.

## Что подтверждено

- `npm run build` в `frontend` выполняет TypeScript-проверку и production-сборку.
- `npm test` выполняет 7 frontend logic-тестов: календарный месяц, 30-дневный
  диапазон, год, московские timestamp и места пересечения маршрутов.
- Backend-тесты: `92 passed, 2 skipped`; два artifact-теста пропускаются без
  необязательного CatBoost.
- `GET /model/metadata` отвечает валидированным `ModelMetadataResponse`.
- В frontend-исходниках нет `white`, `#fff` или `#ffffff` в свойствах фона:
  поверхности задаются semantic tokens.
- Состояние маршрута, направления, участка, остановки, horizon и даты сохраняется в URL.
- Yandex Maps получает `dark`/`light` theme из состояния приложения; fallback без ключа
  сохраняет интерактивную схему выбранного маршрута.
- Внешний порт PostgreSQL задаётся через `POSTGRES_HOST_PORT`; importer пережидает
  краткий перезапуск PostgreSQL после первичной инициализации volume.
- Ось Y графика подписана «Индекс загрузки», а смысл демонстрационного индекса и
  пороги приведены непосредственно над графиком.
- UI-фильтр оставляет 9 поддерживаемых маршрутов, не удаляя полный каталог из backend.
- API smoke-check месячного диапазона `26.09.2026–26.10.2026` вернул 30 дневных точек.
- Split View ограничен четырьмя окнами; состояние каждого окна записывается в URL.

## Повторяемые команды

Из корня проекта:

```powershell
cd frontend
npm ci
npm test
npm run build

cd ..\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
```

Если нужно выполнить также два теста реального `.cbm`, установите зависимости примера:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-model-example.txt
.\.venv\Scripts\python.exe -m pytest tests -q
```

## Обязательный screenshot review перед merge

Запустите проект по корневому `README.md`, затем проверьте в DevTools режимы
`1440 × 900` и `390 × 844`.

Для каждого размера сохраните dark и light screenshots:

1. `/#details` — карта, правая/нижняя панель, барабаны route/stop и график.
2. `/?split=4#details` — четыре карты, независимые параметры и drag-разделители.
3. `/#analytics` — большая карта сети, правая панель и меню пересечения маршрутов.
4. `/#model` — pipeline, метрики, признаки, ограничения и источники.
5. Перезагрузите страницу после смены темы: тема и URL-контекст должны сохраниться.
6. Пройдите интерфейс только клавиатурой: focus outline должен быть видимым.
7. Повторите `#details` без `VITE_YANDEX_MAPS_API_KEY`: должен появиться явный fallback.
8. Для месяца сравните даты `01.09.2026` и `26.09.2026`; кнопка обновления не смещается.

Screenshot review не автоматизирован в этом пакете и должен быть приложен к Pull Request.

## Статус данных модели

Архив не содержит утверждённого отчёта с WAPE, MAE, bias и разрезами backtest.
Поэтому `backend/data/model_metadata.json` использует
`status: validation_pending` и `null` для численных метрик. Это намеренная защита от
демонстрации вымышленных результатов. Для закрытия data-части задачи ML-команда должна
перенести значения из утверждённого отчёта в JSON и повторить backend-тесты.
