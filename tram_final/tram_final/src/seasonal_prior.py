"""Сезонный фактор ноября и декабря из открытых данных прошлых лет (data.mos.ru, набор 62521,
«Пассажиропоток по видам транспорта», трамвай). Используются ТОЛЬКО 2019, 2022–2024 (2020–2021 — ковид);
строки 2025 года за ноябрь–декабрь не используются.
Уровень месяца = пассажиропоток / число «эквивалентных будней» (суббота 0.58, воскресенье/праздник 0.47 —
отношения из данных трамваев 2025). Отношение уровней Nov/Oct и Dec/Oct -> медиана по годам,
поправка на снижение доли 9 маршрутов в сети (-0.6 %/мес по данным янв–окт 2025)."""
import sys, numpy as np, pandas as pd
SRC=sys.argv[1]
df=pd.read_csv(SRC,sep=';',skiprows=[1],encoding='utf-8').iloc[:,:5]; df.columns=['code','year','month','type','pax']
mon={'Январь':1,'Февраль':2,'Март':3,'Апрель':4,'Май':5,'Июнь':6,'Июль':7,'Август':8,'Сентябрь':9,'Октябрь':10,'Ноябрь':11,'Декабрь':12}
t=df[df.type.astype(str).str.contains('Трамв')].copy(); t['m']=t.month.map(mon)
T=t.pivot_table(index='year',columns='m',values='pax',aggfunc='sum')
HOL={2019:['2019-11-04'],2022:['2022-11-04'],2023:[],2024:['2024-11-04','2024-12-30','2024-12-31'],2025:['2025-11-03','2025-11-04','2025-12-31']}
WS={2024:['2024-11-02','2024-12-28'],2025:['2025-11-01']}
def neq(y,m):
    d=pd.date_range(f'{y}-{m:02d}-01',periods=pd.Period(f'{y}-{m:02d}').days_in_month)
    hol=pd.to_datetime(HOL.get(y,[])); ws=pd.to_datetime(WS.get(y,[]))
    return np.where(d.isin(ws),1.0,np.where(d.isin(hol)|(d.dayofweek==6),0.47,np.where(d.dayofweek==5,0.58,1.0))).sum()
YEARS=[2019,2022,2023,2024]
nov=np.median([(T.loc[y,11]/neq(y,11))/(T.loc[y,10]/neq(y,10)) for y in YEARS])
dec=np.median([(T.loc[y,12]/neq(y,12))/(T.loc[y,10]/neq(y,10)) for y in YEARS])
drift=0.994
print({'nov_over_oct':round(nov*drift,4),'dec_over_oct':round(dec*drift**2,4)})
