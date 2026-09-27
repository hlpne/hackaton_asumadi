# LightGBM-модель почасового профиля (доля часа в сутках) — чистое ML
SF=['route','hour','dowx','kind','hol','preh','daylight','restr']
def shape_rows(Yarr, days):
    rows=[]
    for d in days:
        cal=CAL.iloc[d]
        for ri in range(R):
            F=pd.DataFrame({'hour':np.arange(24)}); F['route']=ri; F['d']=d
            F['y']=Yarr[ri,d,:]; F['tot']=np.nansum(Yarr[ri,d,:]); F['restr']=RESTR[ri,d]
            rows.append(F)
    X=pd.concat(rows,ignore_index=True)
    c=CAL.iloc[X.d.values].reset_index(drop=True)
    for k in ['kind','hol','preh','daylight','temp','prec','snow']: X[k]=c[k].values
    X['dowx']=np.where(c.hol.values==1,6,c.dow.values)
    return X
def shape_fit(cutoff, half_life=90, rounds=400):
    c=DI[pd.Timestamp(cutoff)]; X=shape_rows(Y,range(0,c+1)); X=X[X.tot>500]
    age=c-X.d; w=X.tot*0.5**(age/half_life)
    ds=lgb.Dataset(X[SF],X.y/X.tot,weight=w,categorical_feature=['route','dowx'])
    return lgb.train(dict(objective='l1',learning_rate=0.05,num_leaves=63,min_data_in_leaf=50,verbose=-1,seed=1),ds,rounds)
def apply_shape(m, S, cutoff, end, blend=0.7):
    c=DI[pd.Timestamp(cutoff)]; e=DI[pd.Timestamp(end)]; S2=S.copy()
    X=shape_rows(S,range(c+1,e+1))
    p=np.clip(m.predict(X[SF]),0,None); p[X.hour.isin([1,2,3,4]).values]=0
    X['p']=p; X['p']=X.p/X.groupby(['route','d']).p.transform('sum').replace(0,np.nan)
    own=X.y/X.tot.replace(0,np.nan)
    sh=(blend*X.p+(1-blend)*own).fillna(0)
    S2[X.route.values,X.d.values,X.hour.values]=sh.values*X.tot.values
    return S2
