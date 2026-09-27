"""Проверка потоковой модели на истории 2025 (обучение только на данных до отсечки)."""
import os, json, numpy as np, pandas as pd
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'stream.py'),encoding='utf-8').read().split("if __name__=='__main__':")[0])
Y=G['Y']; DI=G['DI']; ROUTES=G['ROUTES']
def wape(y,p): return float(np.abs(y-p).sum()/y.sum())
res={}
import sys
MODES=sys.argv[1:] or ['anchor']
for mode in MODES:
  for cut,end,lab in [('2025-09-30','2025-10-31','октябрь'),('2025-08-31','2025-10-31','сентябрь-октябрь'),('2025-06-30','2025-08-31','июль-август')]:
      c,e=DI[pd.Timestamp(cut)],DI[pd.Timestamp(end)]
      m=TramStreamModel(mode=mode).fit(cut); S=m.run(pd.Timestamp(cut)+pd.Timedelta(days=1),end)
      y=Y[:,c+1:e+1]; p=S[:,c+1:e+1]
      r={'score_61d_no_actuals':round(1-wape(y,p),4)}
      # потоковый режим с фактами: каждый день прогноз на следующий день, затем приходит факт
      m2=TramStreamModel(mode=mode).fit(cut)
      acts={d:Y[:,DI[d]] for d in pd.date_range(pd.Timestamp(cut)+pd.Timedelta(days=1),end)}
      P=np.zeros_like(y)
      for i,d in enumerate(acts):
          P[:,i]=m2.predict_day(d); m2.observe(d,acts[d])
      r['one_day_ahead_score']=round(1-wape(y,P),4)
      r['wape_by_route_recursive']={str(rt):round(wape(y[i],p[i]),4) for i,rt in enumerate(ROUTES)}
      res[mode+' | '+lab]=r; print(mode,lab,{k:v for k,v in r.items() if k!='wape_by_route_recursive'},flush=True)
os.makedirs('reports',exist_ok=True)
json.dump(res,open(f'reports/stream_backtest_{"_".join(MODES)}.json','w'),ensure_ascii=False,indent=2)
