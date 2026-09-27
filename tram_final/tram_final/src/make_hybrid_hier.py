"""Иерархический гибрид: сумма за день = 0.5 * ML + 0.5 * медиана 4 последних таких же дней недели (факт до 31.10),
профиль по часам — ML; особые дни (1–4.11, 29–31.12) и часы 1–4 — математика; маршрут 5 — ML.
Для выходных 7/50 после окончания ремонта медианы октября нет (они не ходили) — берётся ML."""
import os, sys, numpy as np, pandas as pd
ml_path, math_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
DATA=os.environ.get('TRAM_DATA','.')
lab=pd.concat([pd.read_csv(os.path.join(DATA,'labels',f'labels_day_{p}.csv'),sep=';') for p in ('train','test')])
lab['date']=pd.to_datetime(lab.date)
T=lab.groupby(['route','date']).boardings.sum().unstack(0).fillna(0)
T=T.reindex(pd.date_range('2025-01-01','2025-10-31')).fillna(0)
HOL=pd.to_datetime(['2025-01-01','2025-01-02','2025-01-03','2025-01-04','2025-01-05','2025-01-06','2025-01-07','2025-01-08','2025-02-23','2025-03-08','2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-08','2025-05-09','2025-05-10','2025-05-11','2025-06-12','2025-06-13','2025-06-14','2025-06-15'])
A=pd.read_csv(ml_path,sep=';'); M=pd.read_csv(math_path,sep=';')
assert A[['route','date','hour']].equals(M[['route','date','hour']])
A['d']=pd.to_datetime(A.date); A['dow']=A.d.dt.dayofweek
tot=A.groupby(['route','date']).prediction.transform('sum')
med={}
for r in T.columns:
    for dw in range(7):
        days=[x for x in T.index if x.dayofweek==dw and x not in HOL][-4:]
        med[(r,dw)]=float(np.median(T.loc[days,r]))
m4=np.array([med.get((r,dw),np.nan) for r,dw in zip(A.route,A.dow)])
use_ml=A.route.eq(5)|(A.route.isin([7,50])&(A.dow>=5))|np.isnan(m4)|(m4<=0)
D=np.where(use_ml,tot,0.5*tot+0.5*np.nan_to_num(m4))
prof=np.where(tot>0,A.prediction/tot.replace(0,np.nan),0)
p=pd.Series(np.nan_to_num(D*prof),index=A.index)
SPECIAL=['2025-11-01','2025-11-02','2025-11-03','2025-11-04','2025-12-29','2025-12-30','2025-12-31']
sp=A.date.isin(SPECIAL); night=A.hour.isin([1,2,3,4]); r5=A.route.eq(5)
p[sp]=M.prediction[sp]; p[night]=M.prediction[night]; p[r5]=A.prediction[r5]
H=A[['route','date','hour']].copy(); H['prediction']=np.round(np.clip(p,0,None)).astype(int)
assert len(H)==14640; H.to_csv(out,sep=';',index=False); print(out,int(H.prediction.sum()))
