import os
HERE=os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
exec(open(os.path.join(HERE,'v4.py'),encoding='utf-8').read())
import time, sys
Y=load_labels()
t=time.time()
ALL=[]
for d in range(DI[pd.Timestamp('2025-01-02')], DI[pd.Timestamp('2025-10-31')]+1):
    F=day_features(Y,d); F['y']=Y[F.route.values,d,F.hour.values]; ALL.append(F)
ALL=pd.concat(ALL,ignore_index=True); ALL.to_pickle(os.path.join(HERE,'train_feats.pkl')); print('feats',time.time()-t, ALL.shape)
