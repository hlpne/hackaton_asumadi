"""Математическая модель v1 (скор на платформе 0.90339 = файл submission_improved.csv).
База — ранняя версия модели (math_model.py, MATH_VARIANT=v1: без погоды, маршрут 5 с 16.12;
на её основе был файл со скором 0.89986).
Поверх неё — уточнения из основной версии (math_model.py, погода + хвост 1.11):
  * 1.11, часы 0–1, все маршруты (хвост 1 ноября — с разрешения организаторов);
  * 1.11 маршруты 7 и 50 — рабочая суббота, маршруты работали;
  * 3–4.11 маршруты 7 и 50 — объезд по выходным ещё действовал (восстановление с 15.11).
python make_math_v1.py <v1_raw.csv> <main_with_tail.csv> <out.csv>"""
import sys
import pandas as pd

v1 = pd.read_csv(sys.argv[1], sep=';')
main = pd.read_csv(sys.argv[2], sep=';')
key = ['route', 'date', 'hour']
assert v1[key].equals(main[key]) and len(v1) == 14640
tail = v1.date.eq('2025-11-01') & v1.hour.isin((0, 1))
working_saturday = v1.date.eq('2025-11-01') & v1.route.isin((7, 50))
diversion = v1.date.isin(('2025-11-03', '2025-11-04')) & v1.route.isin((7, 50))
mask = tail | working_saturday | diversion
out = v1.copy()
out.loc[mask, 'prediction'] = main.loc[mask, 'prediction']
assert out.loc[out.route.eq(5) & out.date.lt('2025-12-16'), 'prediction'].eq(0).all()
out.to_csv(sys.argv[3], sep=';', index=False)
print(sys.argv[3], 'заменено ячеек', int(mask.sum()), 'сумма', int(out.prediction.sum()))
