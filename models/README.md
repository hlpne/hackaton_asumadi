# Локальные артефакты моделей

`backend/scripts/build_example_model.py` создаёт здесь `example.cbm`,
`example.pkl` и `example.metadata.json`. Они исключены из Git и Docker build context.
Это модели на синтетических данных для проверки адаптера, не рабочий ML baseline.

Порядок подключения, формат признаков и проверка: [docs/model-adapter.md](../docs/model-adapter.md).
