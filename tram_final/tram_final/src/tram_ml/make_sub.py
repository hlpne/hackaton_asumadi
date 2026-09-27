# сборка submission из прогноза модели S (маршруты x дни x часы)
def route5_coldstart(S, start='2025-12-16', wd_level=8000, sat_ratio=0.55, sun_ratio=0.45):
    """Трамвай 5 запущен 16.12.2025 (mos.ru/mayor/themes/13888050). Истории нет, поэтому:
    почасовой профиль и тип дня — из прогноза модели для маршрута 50 (тот же коридор),
    уровень — внешний параметр запуска."""
    r50=ROUTES.index(50); out=np.zeros((ND,24))
    for d in range(DI[pd.Timestamp(start)], ND):
        prof=S[r50,d,:];
        if prof.sum()<=0: continue
        k=KIND[d]; lvl=wd_level if k==0 else (wd_level*sat_ratio if k==1 else wd_level*sun_ratio)
        out[d]=prof/prof.sum()*lvl
        if d==DI[pd.Timestamp(start)]: out[d]*=0.7
    return out
def write_sub(S, path, r5=None):
    sub=pd.read_csv(os.path.join(DATA,'test_submission.csv'),sep=';')
    d=pd.to_datetime(sub.date).map(DI).values; h=sub.hour.values
    p=np.zeros(len(sub))
    for i,r in enumerate(ROUTES):
        m=sub.route.values==r; p[m]=S[i,d[m],h[m]]
    if r5 is not None:
        m=sub.route.values==5; p[m]=r5[d[m],h[m]]
    p=np.nan_to_num(p); p[np.isin(h,[1,2,3,4])]=0
    sub['prediction']=np.round(np.clip(p,0,None)).astype(int)
    assert len(sub)==14640 and sub.prediction.min()>=0
    sub.to_csv(path,sep=';',index=False); return sub
