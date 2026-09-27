"""Вариант сезонного фактора с нарастанием к Новому году: та же средняя надбавка за декабрь, что в half
(+2.85 % по обычным дням), но распределённая линейно — от 0 с 15.11 до максимума к 26.12 (дальше держится)."""
import sys, os, numpy as np, pandas as pd
hier,out=sys.argv[1],sys.argv[2]; dec_mean=float(sys.argv[3]) if len(sys.argv)>3 else 0.0285
H=pd.read_csv(hier,sep=';'); d=pd.to_datetime(H.date)
SPECIAL=pd.to_datetime(['2025-11-01','2025-11-02','2025-11-03','2025-11-04','2025-12-29','2025-12-30','2025-12-31'])
reg=~d.isin(SPECIAL)&H.route.ne(5)
if os.environ.get('INCL_2930'): reg=reg|(d.isin(pd.to_datetime(['2025-12-29','2025-12-30']))&H.route.ne(5))
import os
t0=pd.Timestamp(os.environ.get('RAMP_START','2025-11-15')); t1=pd.Timestamp(os.environ.get('RAMP_END','2025-12-26'))
ramp=np.clip((d-t0).dt.days/(t1-t0).days,0,1)
decm=reg&(d.dt.month==12)
w=H.prediction.where(decm,0)
k=dec_mean*w.sum()/(w*ramp).sum()          # средняя по объёму надбавка в декабре = dec_mean
f=np.where(reg,1+k*ramp,1.0)
p=H.prediction*f
nov=reg&(d.dt.month==11)
print('peak uplift',round(k,4),'Nov mean',round((H.prediction[nov]*(f[nov]-1)).sum()/H.prediction[nov].sum(),4),'Dec mean',round((H.prediction[decm]*(f[decm]-1)).sum()/H.prediction[decm].sum(),4))
O=H[['route','date','hour']].copy(); O['prediction']=np.round(p).astype(int); O.to_csv(out,sep=';',index=False); print(out,int(O.prediction.sum()))
