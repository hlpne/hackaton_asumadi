# Контрольный прогон перед загрузкой (финал 0.90461)

Параметры модели по умолчанию (`run_all.py`):

| Параметр | Значение |
|---|---|
| Доля ML-гибрида в ансамбле | 0,4 |
| Средняя декабрьская надбавка | 0.057 |
| Множитель маршрута 5 | 1,0 |
| Первые выходные с обычным движением 7 и 50 | 15.11 |

Пакет скопирован в чистую папку, перед запуском удалены все модели (`artifacts/*.txt`, `manifest.json`, `artifacts/onnx/*.onnx`) и все файлы в `outputs/`. Данные — исходные `labels/labels_day_train.csv`, `labels/labels_day_test.csv`, `test_submission.csv`.

| Шаг | Команда | Результат |
|---|---|---|
| 1. Обучение с нуля + прогноз | `python run_all.py` | 1 мин 48 с; `submission_final.csv` sha256 `05d73ac9bff3364c…` — побайтно совпадает с отправленным файлом 0.90461 |
| 2. Модели совпадают с поставленными | сравнение `artifacts/*.txt` | побайтно совпадают |
| 3. Прогноз, LightGBM из артефактов | `python run_all.py --use-artifacts` | sha256 `05d73ac9bff3364c…` |
| 4. Проверка в JVM | `java … TramOnnxInference validate artifacts` | max \|ONNX(JVM) − LightGBM\| = 1,19·10⁻⁷, OK |
| 5. Прогноз, ONNX Runtime в Python | `python run_all.py --use-artifacts --engine onnx` | sha256 `f1e4c9d9b78bf9a4…` |
| 6. Прогноз, инференс в JVM | `python run_all.py --use-artifacts --engine jvm` | 991 вызов моделей, 214 056 строк; sha256 `f1e4c9d9b78bf9a4…` (= ONNX в Python) |

## Файлы для загрузки

| Файл | Движок инференса ML | Отличие от файла 0.90461 |
|---|---|---|
| `submission_nov_dec_2025.csv` | LightGBM (Python) | 0 ячеек — побайтно тот же файл |
| `submission_nov_dec_2025_jvm_onnx.csv` | ONNX Runtime в JVM | 2 ячейки на ±1 (округление float32) |

## Проверка формата

- 14 640 строк; колонки `route;date;hour;prediction`.
- Порядок и ключи строк совпадают с `test_submission.csv`, дублей нет.
- Прогнозы — целые числа ≥ 0, пропусков нет.
- Даты 2025-11-01 … 2025-12-31, маршруты 1, 5, 7, 11, 12, 17, 25, 26, 28, 50.
- Сумма прогноза: 12 793 413 (в JVM-файле 12 793 411).
