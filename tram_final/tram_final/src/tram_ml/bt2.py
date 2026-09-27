exec(open(os.path.join(HERE,'v4.py'),encoding='utf-8').read())
import time, sys, warnings; warnings.filterwarnings('ignore')
Y=load_labels(); ALL=pd.read_pickle(os.path.join(HERE,'train_feats.pkl'))
def fit_from_cache(cutoff, seeds=(1,), rounds=600, params=None, feats=None, start='2025-01-20'):
    feats=feats or FEATS
    X=ALL[(ALL.d<=DI[pd.Timestamp(cutoff)])&(ALL.d>=DI[pd.Timestamp(start)])]; X=X[~X.hour.isin([1,2,3,4])]
    ds=lgb.Dataset(X[feats],X.y/X.scale,weight=X.scale,categorical_feature=['route'],free_raw_data=False)
    return [lgb.train({**PARAMS,**(params or {}),'seed':s},ds,rounds) for s in seeds]
def forecast_f(models, cutoff, end, feats=None):
    feats=feats or FEATS
    S=Y.copy(); c=DI[pd.Timestamp(cutoff)]; e=DI[pd.Timestamp(end)]; S[:,c+1:,:]=np.nan
    for d in range(c+1,e+1):
        F=day_features(S,d)
        p=np.mean([m.predict(F[feats]) for m in models],axis=0)*F.scale.values
        p=np.clip(p,0,None); p[F.hour.isin([1,2,3,4]).values]=0
        S[F.route.values,d,F.hour.values]=p
    return S
WIN4=[('2025-03-31','2025-05-31'),('2025-04-30','2025-06-30'),('2025-06-30','2025-08-31'),('2025-08-31','2025-10-31'),('2025-09-30','2025-10-31')]
def run(label, **kw):
    t=time.time(); out=[]
    fk={k:v for k,v in kw.items() if k=='feats'}
    for cut,end in WIN4:
        m=fit_from_cache(cut,**kw); S=forecast_f(m,cut,end,**fk); out.append(round(wape_score(Y,S,cut,end),4))
    print(label,out,round(np.mean(out),4),f'{time.time()-t:.0f}s',flush=True)
HL=None
def fit2(cutoff, seeds=(1,), rounds=600, params=None, feats=None, start='2025-01-20', target='resid'):
    feats=feats or FEATS
    X=ALL[(ALL.d<=DI[pd.Timestamp(cutoff)])&(ALL.d>=DI[pd.Timestamp(start)])]; yt=X.y/X.scale-X.B if target=='resid' else X.y/X.scale
    wt=X.scale if HL is None else X.scale*0.5**((DI[pd.Timestamp(cutoff)]-X.d)/HL)
    ds=lgb.Dataset(X[feats],yt,weight=wt,categorical_feature=['route'],free_raw_data=False)
    return [lgb.train({**PARAMS,**(params or {}),'seed':s},ds,rounds) for s in seeds]
def fc2(models, cutoff, end, feats=None, target='resid', Yin=None, frozen=False):
    feats=feats or FEATS; Yb=Y if Yin is None else Yin
    S=Yb.copy(); c=DI[pd.Timestamp(cutoff)]; e=DI[pd.Timestamp(end)]; S[:,c+1:,:]=np.nan
    for d in range(c+1,e+1):
        F=day_features(S,d,limit=(c+1 if frozen else None))
        p=np.mean([m.predict(F[feats]) for m in models],axis=0)
        if target=='resid': p=p+F.B.values
        if CAL.wsat.values[d]:
            # рабочая суббота: в истории таких дней нет -> ансамбль двух кодировок (рабочий день / суббота)
            Fb=F.copy(); Fb['kind']=1; Fb['off']=1; Fb['B']=Fb.L_sat.fillna(Fb.L_work)
            pb=np.mean([m.predict(Fb[feats]) for m in models],axis=0)+Fb.B.values
            p=(p+pb)/2
        p=np.clip(p*F.scale.values,0,None); p[F.hour.isin([1,2,3,4]).values]=0
        S[F.route.values,d,F.hour.values]=p
    return S
def run2(label, wins=None, **kw):
    t=time.time(); out=[]
    fk={k:v for k,v in kw.items() if k in('feats','target')}
    for cut,end in (wins or WIN4):
        m=fit2(cut,**kw); S=fc2(m,cut,end,**fk); out.append(round(wape_score(Y,S,cut,end),4))
    print(label,out,round(np.mean(out),4),f'{time.time()-t:.0f}s',flush=True)
F1=[f for f in FEATS+['lag_school','B'] if f!='trend']
F3=[f for f in F1 if f not in ('daylight','temp')]
CONFIGS=[dict(feats=F1,params=dict(num_leaves=15,min_data_in_leaf=100)),
         dict(feats=F3,params=dict(num_leaves=15,min_data_in_leaf=100)),
         dict(feats=F1,params=dict(num_leaves=31,min_data_in_leaf=60))]
def ens_forecast(cut,end,seeds=(1,2,3),configs=CONFIGS,Yin=None,frozen=False):
    Ss=[]
    for cf in configs:
        m=fit2(cut,seeds=seeds,feats=cf['feats'],params=cf['params'],start='2025-01-02')
        Ss.append(fc2(m,cut,end,feats=cf['feats'],Yin=Yin,frozen=frozen))
    return np.mean(Ss,axis=0), Ss
F4=[f for f in F1 if f not in ('daylight','temp','school','lag_school')]
CONFIGS2=[dict(feats=F3,params=dict(num_leaves=15,min_data_in_leaf=100)),
          dict(feats=F4,params=dict(num_leaves=15,min_data_in_leaf=100)),
          dict(feats=F3,params=dict(num_leaves=31,min_data_in_leaf=60))]
F5=[f for f in F3 if f not in ('prec','snow')]; F6=[f for f in F4 if f not in ('prec','snow')]
CONFIGS5=[dict(feats=F5,params=dict(num_leaves=15,min_data_in_leaf=100)),
          dict(feats=F6,params=dict(num_leaves=15,min_data_in_leaf=100)),
          dict(feats=F5,params=dict(num_leaves=31,min_data_in_leaf=60))]
from sklearn.ensemble import HistGradientBoostingRegressor
def fit_hgb(cutoff, seeds=(1,), feats=None, start='2025-01-02', **kw):
    X=ALL[(ALL.d<=DI[pd.Timestamp(cutoff)])&(ALL.d>=DI[pd.Timestamp(start)])]; X=X[~X.hour.isin([1,2,3,4])]
    yt=X.y/X.scale-X.B; ok=yt.notna().values; X=X[ok]; yt=yt[ok]
    ms=[]
    for s in seeds:
        m=HistGradientBoostingRegressor(loss='absolute_error',learning_rate=0.05,max_iter=500,max_leaf_nodes=31,min_samples_leaf=100,l2_regularization=1.0,
            categorical_features=[feats.index('route')],random_state=s)
        m.fit(X[feats].fillna(np.nan),yt,sample_weight=X.scale); ms.append(m)
    return ms
def ens_forecast_multi(cut,end,seeds=(1,2),frozen=False,use_hgb=True,use_lgb=True):
    Ss=[]
    for cf in CONFIGS5:
        if use_lgb:
            m=fit2(cut,seeds=seeds,feats=cf['feats'],params=cf['params'],start='2025-01-02'); Ss.append(fc2(m,cut,end,feats=cf['feats'],frozen=frozen))
    if use_hgb:
        for fe in [CONFIGS5[0]['feats'],CONFIGS5[1]['feats']]:
            m=fit_hgb(cut,seeds=seeds,feats=fe); Ss.append(fc2(m,cut,end,feats=fe,frozen=frozen))
    return np.mean(Ss,axis=0), Ss

CONFIGS12=[dict(feats=[f for f in c['feats'] if f!='after_long'],params=c['params']) for c in CONFIGS5]
