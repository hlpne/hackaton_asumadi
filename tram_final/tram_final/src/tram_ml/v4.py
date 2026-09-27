"""Tram ML v4: чистая ML-модель. Рекурсивный LightGBM: для каждого следующего дня
признаки-лаги считаются по собственным прогнозам модели (а не по фактам)."""
import os, json, numpy as np, pandas as pd, lightgbm as lgb
HERE=os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
DATA=os.environ.get('TRAM_DATA', os.path.join(HERE,'..','..'))
ROUTES=[1,7,11,12,17,25,26,28,50]; R=len(ROUTES)
DAYS=pd.date_range('2025-01-01','2025-12-31'); ND=len(DAYS); DI={d:i for i,d in enumerate(DAYS)}
def load_labels():
    a=pd.read_csv(os.path.join(DATA,'labels','labels_day_train.csv'),sep=';');b=pd.read_csv(os.path.join(DATA,'labels','labels_day_test.csv'),sep=';')
    d=pd.concat([a,b]); d['date']=pd.to_datetime(d.date); d=d[d.route.isin(ROUTES)]
    Y=np.full((R,ND,24),np.nan); last=DI[pd.Timestamp('2025-10-31')]
    Y[:,:last+1,:]=0
    ri={r:i for i,r in enumerate(ROUTES)}
    Y[d.route.map(ri).values,d.date.map(DI).values,d.hour.values]=d.boardings.values
    return Y
# ---------- календарь (производственный календарь РФ 2025, government.ru/news/52895) ----------
HOL=pd.to_datetime(['2025-01-01','2025-01-02','2025-01-03','2025-01-04','2025-01-05','2025-01-06','2025-01-07','2025-01-08',
 '2025-02-23','2025-03-08','2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-08','2025-05-09','2025-05-10','2025-05-11',
 '2025-06-12','2025-06-13','2025-06-14','2025-06-15','2025-11-02','2025-11-03','2025-11-04','2025-12-31'])
WORK_SAT=pd.to_datetime(['2025-11-01'])
PRE_HOL=pd.to_datetime(['2025-03-07','2025-04-30','2025-05-07','2025-06-11','2025-11-01','2025-12-30'])
# школьные каникулы Москвы (mskobr.ru 2024/25; 2025/26 рекомендованные даты)
SCHOOL=[('2025-01-01','2025-01-08'),('2025-02-15','2025-02-24'),('2025-04-05','2025-04-13'),('2025-05-24','2025-08-31'),('2025-10-25','2025-11-02'),('2025-12-31','2025-12-31')]
# события сети: трамваи 7 и 50 по выходным (ремонт Протопоповского пер., 06.09 - "до конца осени")
RESTRICT_ROUTES=[7,50]; RESTRICT=('2025-09-06',os.environ.get('TRAM_RESTRICT_END','2025-11-09'))   # в данных видно частичное возвращение 50 по выходным с середины октября
def calendar():
    c=pd.DataFrame(index=DAYS); c['dow']=DAYS.dayofweek
    c['off']=((c.dow>=5)|DAYS.isin(HOL))&~DAYS.isin(WORK_SAT)
    c['hol']=DAYS.isin(HOL).astype(int); c['hol_wd']=(DAYS.isin(HOL)&(c.dow<5)).astype(int)
    c['preh']=DAYS.isin(PRE_HOL).astype(int); c['wsat']=DAYS.isin(WORK_SAT).astype(int)
    # длина блока выходных, позиция в блоке, дней после длинного блока
    off=c.off.values; blen=np.zeros(ND,int); pos=np.zeros(ND,int); i=0
    while i<ND:
        if off[i]:
            j=i
            while j<ND and off[j]: j+=1
            blen[i:j]=j-i; pos[i:j]=np.arange(1,j-i+1); i=j
        else: i+=1
    after=np.full(ND,30); last_end=-99
    for i in range(ND):
        if off[i] and blen[i]>=3: last_end=i
        elif not off[i]: after[i]=min(30,i-last_end) if last_end>=0 else 30
    c['blen']=blen; c['bpos']=pos; c['after_long']=after
    c['school']=0
    for a,b in SCHOOL: c.loc[a:b,'school']=1
    w=json.load(open(os.path.join(HERE,'assets','weather.json')))['daily']
    W=pd.DataFrame(w); W.index=pd.to_datetime(W.time); c['temp']=W.temperature_2m_mean; c['prec']=W.precipitation_sum; c['snow']=W.snowfall_sum
    doy=DAYS.dayofyear.values; lat=np.radians(55.75); dec=np.radians(23.44)*np.sin(2*np.pi*(284+doy)/365)
    c['daylight']=24/np.pi*np.arccos(np.clip(-np.tan(lat)*np.tan(dec),-1,1))
    c['kind']=np.where(~c.off,0,np.where(c.dow==5,1,2))   # 0 рабочий, 1 выходная суббота, 2 воскресенье/праздник
    return c
CAL=calendar()
RESTR=np.zeros((R,ND),int)
for r in RESTRICT_ROUTES:
    m=(DAYS>=RESTRICT[0])&(DAYS<=RESTRICT[1])&CAL.off.values
    RESTR[ROUTES.index(r),m]=1
KIND=CAL.kind.values; DOW=CAL.dow.values
def prev_days(d, cond, n, limit=None):
    e=d if limit is None else min(d,limit)
    idx=np.where(cond[:e])[0]; return idx[-n:]
def day_features(S, d, limit=None):
    """признаки для дня d по ряду S (факт до отсечки, дальше собственные прогнозы)"""
    rows=[]
    cal=CAL.iloc[d]
    work=(KIND==0)&(CAL.wsat.values==0); sat=KIND==1; sun=KIND==2
    lw=prev_days(d,work,5,limit); lwd=prev_days(d,work&(DOW==DOW[d]),3,limit)
    e=d if limit is None else min(d,limit)
    lvl28=np.nansum(S[:,max(0,e-28):e,:],axis=(1,2))/min(28,e)   # среднесуточный объём маршрута
    lvl7=np.nansum(S[:,max(0,e-7):e,:],axis=(1,2))/min(7,e)
    feats=[]
    for ri in range(R):
        norm=RESTR[ri]==0
        ls_n=prev_days(d,sat&norm,3,limit); lu_n=prev_days(d,sun&norm,3,limit)
        ls_a=prev_days(d,sat,3,limit); lu_a=prev_days(d,sun,3,limit)
        s=max(lvl28[ri],100)/24
        # маршрут только что вышел из режима ограничений (7, 50 после ремонта): последние «нормальные»
        # выходные были летом -> пересчитываем их на текущий уровень будней (отношение будней сейчас/тогда)
        fs=fu=1.0
        if RESTR[ri,d]==0 and RESTR[ri,max(0,d-75):d].any():
            tot=np.nansum(S[ri],axis=1); now=tot[lw].mean()
            def _then(idx):
                win=[i for i in range(max(0,idx[0]-7),min(idx[-1]+8,d)) if work[i]]
                return tot[win].mean() if win else now
            if len(ls_n): fs=now/max(_then(ls_n),1)
            if len(lu_n): fu=now/max(_then(lu_n),1)
        f=dict(
          L_work=S[ri,lw,:].mean(0)/s, L_wdow=S[ri,lwd,:].mean(0)/s,
          L_sat=S[ri,ls_n,:].mean(0)/s*fs, L_sun=S[ri,lu_n,:].mean(0)/s*fu,
          L_sat_any=S[ri,ls_a,:].mean(0)/s, L_sun_any=S[ri,lu_a,:].mean(0)/s)
        F=pd.DataFrame(f); F['hour']=np.arange(24); F['route']=ri; F['scale']=s
        F['trend']=lvl7[ri]/max(lvl28[ri],1); F['restr']=RESTR[ri,d]
        F['lag_school']=CAL.school.values[max(0,e-28):e].mean()
        feats.append(F)
    F=pd.concat(feats,ignore_index=True)
    for k in ['dow','hol','hol_wd','preh','wsat','blen','bpos','after_long','school','temp','prec','snow','daylight','kind']:
        F[k]=cal[k]
    F['off']=int(cal.off); F['d']=d
    k=int(cal.kind)
    if k==0: B=F.L_wdow.where(F.L_wdow.notna(),F.L_work)
    elif k==1: B=F.L_sat
    else: B=F.L_sun
    F['B']=B.fillna(F.L_work)
    return F
FEATS=['route','hour','dow','off','kind','hol','hol_wd','preh','wsat','blen','bpos','after_long','school','temp','prec','snow','daylight','restr','trend',
       'L_work','L_wdow','L_sat','L_sun','L_sat_any','L_sun_any']
PARAMS=dict(objective='l1',learning_rate=0.03,num_leaves=63,min_data_in_leaf=40,feature_fraction=0.8,bagging_fraction=0.8,bagging_freq=1,lambda_l2=1.0,verbose=-1)
def train(Y, cutoff, seeds=(1,2,3), rounds=900, start='2025-02-01'):
    c=DI[pd.Timestamp(cutoff)]; X=[]
    for d in range(DI[pd.Timestamp(start)], c+1):
        F=day_features(Y,d); F['y']=Y[F.route.values,d,F.hour.values]; X.append(F)
    X=pd.concat(X,ignore_index=True); X=X[~X.hour.isin([1,2,3,4])]
    ds=lgb.Dataset(X[FEATS],X.y/X.scale,weight=X.scale,categorical_feature=['route'],free_raw_data=False)
    return [lgb.train({**PARAMS,'seed':s},ds,rounds) for s in seeds]
def forecast(models, Y, cutoff, end):
    S=Y.copy(); c=DI[pd.Timestamp(cutoff)]; e=DI[pd.Timestamp(end)]
    S[:,c+1:,:]=np.nan
    for d in range(c+1,e+1):
        F=day_features(S,d)
        p=np.mean([m.predict(F[FEATS]) for m in models],axis=0)*F.scale.values
        p=np.clip(p,0,None); p[F.hour.isin([1,2,3,4]).values]=0
        S[F.route.values,d,F.hour.values]=p
    return S
def wape_score(Y,S,cutoff,end):
    c=DI[pd.Timestamp(cutoff)]; e=DI[pd.Timestamp(end)]
    y=Y[:,c+1:e+1,:]; p=S[:,c+1:e+1,:]; return 1-np.abs(y-p).sum()/y.sum()
