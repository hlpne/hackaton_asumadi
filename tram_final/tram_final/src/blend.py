"""Финальный ансамбль: w * A + (1 - w) * B, округление половин вверх.
python blend.py <A.csv> <B.csv> <w> <out.csv>
В решении: A = ML-гибрид с сезонной надбавкой (декабрь в среднем +5,7 %), B = математическая модель v1 (0.90339),
w = 0.4 -> 0.90461 (при надбавке 2,85 % и w = 0.5 было 0.90447)."""
import sys
import numpy as np
import pandas as pd

a = pd.read_csv(sys.argv[1], sep=';')
b = pd.read_csv(sys.argv[2], sep=';')
w = float(sys.argv[3])
key = ['route', 'date', 'hour']
assert a[key].equals(b[key]) and len(a) == 14640
out = a[key].copy()
out['prediction'] = np.floor(w * a.prediction + (1 - w) * b.prediction + 0.5).astype(int)
out.to_csv(sys.argv[4], sep=';', index=False)
print(sys.argv[4], 'w =', w, 'сумма', int(out.prediction.sum()))
