"""Tram ML — потоковая (streaming) ML-модель прогноза посадок маршрут x дата x час.

Режим работы — день за днём:
  model = TramStreamModel(); model.fit('2025-10-31')        # обучение на истории до даты отсечки
  for day in дни прогноза:
      pred = model.predict_day(day)     # прогноз 24 часов по всем маршрутам
      model.observe(day, actual)        # если пришли факты — модель использует их дальше,
                                        # если нет — в лагах остаётся её собственный прогноз
Весь прогноз на ноябрь–декабрь = 61 шаг predict_day без фактов (рекурсивно).
Модель объёма: ансамбль LightGBM (3 конфигурации x 5 seed), цель — отклонение от лага того же
типа дня; признаки — лаги из потока, календарь, флаги событий сети. Профиль часов — LightGBM.
"""
import os, warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
HERE=os.path.dirname(os.path.abspath(__file__))
G=dict(__file__=os.path.join(HERE,'v4.py'))
for f in ['bt.py','bt2.py','shape4.py','make_sub.py']:
    exec(open(os.path.join(HERE,f),encoding='utf-8').read(), G)

class JvmBridge:
    """Инференс моделей в JVM: запускает `TramOnnxInference serve <artifacts>` и обменивается с ним
    матрицами признаков (float32, little-endian) через stdin/stdout. Признаки и постобработка — в Python,
    вычисление всех деревьев — в Java (ONNX Runtime for Java).
    Команда запуска: переменная TRAM_JVM_CMD (без режима и пути), по умолчанию
    java -jar jvm/target/tram-onnx-inference-1.0-jar-with-dependencies.jar"""
    def __init__(self, art_dir):
        import subprocess, shlex, atexit
        root=os.path.abspath(os.path.join(HERE,'..','..'))
        jar=os.path.join(root,'jvm','target','tram-onnx-inference-1.0-jar-with-dependencies.jar')
        env_cmd=os.environ.get('TRAM_JVM_CMD')
        base=shlex.split(env_cmd,posix=os.name!='nt') if env_cmd else ['java','-jar',jar]
        cmd=base+['serve',os.path.abspath(art_dir)]
        self.p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
        line=self.p.stdout.readline()
        if line.strip()!=b'READY': raise RuntimeError('JVM не запустилась: '+' '.join(cmd))
        self.calls=0; atexit.register(self.close)
    def predict(self, name, X):
        X=np.ascontiguousarray(np.asarray(X,dtype='<f4')); n,m=X.shape
        self.p.stdin.write(f'{name} {n} {m}\n'.encode()); self.p.stdin.write(X.tobytes()); self.p.stdin.flush()
        buf=self.p.stdout.read(4*n)
        if len(buf)!=4*n: raise RuntimeError('JVM вернула неполный ответ')
        self.calls+=1
        return np.frombuffer(buf,dtype='<f4').copy()
    def model(self, name):
        bridge=self
        class M:
            def predict(s,X): return bridge.predict(name,X)
        return M()
    def close(self):
        if self.p.poll() is None:
            try: self.p.stdin.write(b'quit\n'); self.p.stdin.flush(); self.p.wait(timeout=30)
            except Exception: self.p.kill()

class TramStreamModel:
    def __init__(self, mode='anchor', half_life=30, seeds=(1,2,3,4,5), shape_blend=0.5, route5_level=6500):
        # mode='anchor'    — лаги только по последним ПОЛУЧЕННЫМ фактам (прямая стратегия, ошибка не копится);
        # mode='recursive' — лаги по фактам + собственным прогнозам предыдущих дней
        self.mode=mode; self.hl=half_life; self.seeds=seeds; self.b=shape_blend; self.r5=route5_level
        self.cfg=G['CONFIGS12']
    def fit(self, cutoff):
        G['HL']=self.hl
        self.cut=G['DI'][pd.Timestamp(cutoff)]
        self.models=[(cf['feats'],G['fit2'](cutoff,seeds=self.seeds,feats=cf['feats'],params=cf['params'],start='2025-01-02')) for cf in self.cfg]
        self.shape=G['shape_fit'](cutoff)
        self.S=G['Y'].copy(); self.S[:,self.cut+1:,:]=np.nan      # поток: факт до отсечки
        self.last_obs=self.cut
        return self
    # ---------- артефакты модели ----------
    def save_artifacts(self, out_dir):
        """LightGBM-модели в родном формате (.txt) + manifest.json с порядком признаков и схемой ансамбля."""
        import json
        os.makedirs(out_dir,exist_ok=True); man={'cutoff':str(G['DAYS'][self.cut].date()),'mode':self.mode,
            'half_life':self.hl,'shape_blend':self.b,'route5_level':self.r5,'volume_models':[],'shape_model':None}
        for ci,(feats,ms) in enumerate(self.models):
            files=[]
            for si,m in enumerate(ms):
                fn=f'volume_cfg{ci}_seed{self.seeds[si]}.txt'; m.save_model(os.path.join(out_dir,fn)); files.append(fn)
            man['volume_models'].append({'config':ci,'features':list(feats),'files':files})
        self.shape.save_model(os.path.join(out_dir,'shape.txt'))
        man['shape_model']={'file':'shape.txt','features':list(G['SF'])}
        man['postprocess']=('volume: pred = scale * (mean_config(mean_seed(model(x))) + B); '
                            'workday Saturday: average of two encodings (kind=0 / kind=1); hours 1-4 = 0; '
                            'shape: share = normalize(shape_model(x)); final = total_day * (b*share + (1-b)*own_share)')
        json.dump(man,open(os.path.join(out_dir,'manifest.json'),'w'),ensure_ascii=False,indent=2)
        return man
    def load_artifacts(self, art_dir, cutoff, engine='lightgbm'):
        """Инференс без обучения: загрузка сохранённых моделей.
        engine='lightgbm' — .txt (LightGBM), 'onnx' — ONNX Runtime в Python,
        'jvm' — ONNX Runtime в JVM (процесс Java из jvm/, см. JvmBridge)."""
        import json
        man=json.load(open(os.path.join(art_dir,'manifest.json')))
        if engine=='jvm':
            bridge=JvmBridge(art_dir)
            load=lambda f: bridge.model(f.replace('.txt','.onnx'))
            self.jvm=bridge
        elif engine=='onnx':
            import onnxruntime as ort
            class OnnxModel:
                def __init__(s,path): s.sess=ort.InferenceSession(path)
                def predict(s,X): return s.sess.run(None,{'input':np.asarray(X,dtype=np.float32)})[0].ravel()
            load=lambda f: OnnxModel(os.path.join(art_dir,'onnx',f.replace('.txt','.onnx')))
        else:
            import lightgbm as lgb
            load=lambda f: lgb.Booster(model_file=os.path.join(art_dir,f))
        self.models=[(vm['features'],[load(f) for f in vm['files']]) for vm in man['volume_models']]
        self.shape=load(man['shape_model']['file'])
        self.cut=G['DI'][pd.Timestamp(cutoff)]; self.S=G['Y'].copy(); self.S[:,self.cut+1:,:]=np.nan; self.last_obs=self.cut
        return self
    def _level(self, d):
        lim=self.last_obs+1 if self.mode=='anchor' else None
        F=G['day_features'](self.S,d,limit=lim); outs=[]
        for feats,ms in self.models:
            p=np.mean([m.predict(F[feats]) for m in ms],axis=0)+F.B.values
            if G['CAL'].wsat.values[d]:      # рабочая суббота: ансамбль двух кодировок типа дня
                Fb=F.copy(); Fb['kind']=1; Fb['off']=1; Fb['B']=Fb.L_sat.fillna(Fb.L_work)
                p=(p+np.mean([m.predict(Fb[feats]) for m in ms],axis=0)+Fb.B.values)/2
            outs.append(p)
        p=np.clip(np.mean(outs,axis=0)*F.scale.values,0,None); p[F.hour.isin([1,2,3,4]).values]=0
        out=np.zeros((G['R'],24)); out[F.route.values,F.hour.values]=p
        return out
    def predict_day(self, date):
        d=G['DI'][pd.Timestamp(date)]
        L=self._level(d)
        tmp=self.S.copy(); tmp[:,d,:]=L
        X=G['shape_rows'](tmp,[d]); sh=np.clip(self.shape.predict(X[G['SF']]),0,None)
        X['p']=sh; X['p']=X.p/X.groupby('route').p.transform('sum').replace(0,np.nan)
        own=X.y/X.tot.replace(0,np.nan)
        mix=(self.b*X.p+(1-self.b)*own).fillna(0).values*X.tot.values
        pred=np.zeros_like(L); pred[X.route.values,X.hour.values]=mix
        self.S[:,d,:]=pred                                  # собственный прогноз идёт в поток
        return pred
    def observe(self, date, actual):
        """actual: массив (маршруты x 24) фактических посадок за день — заменяет прогноз в потоке"""
        d=G['DI'][pd.Timestamp(date)]; self.S[:,d,:]=actual; self.last_obs=max(self.last_obs,d)
    def run(self, start, end, actuals=None):
        for day in pd.date_range(start,end):
            self.predict_day(day)
            if actuals is not None and day in actuals: self.observe(day,actuals[day])
        return self.S
    def write_submission(self, path, with_route5=True):
        r5=G['route5_coldstart'](self.S,wd_level=self.r5) if with_route5 else None
        return G['write_sub'](self.S,path,r5=r5)

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument('action',choices=['train','predict'],nargs='?',default='train')
    ap.add_argument('--engine',choices=['lightgbm','onnx','jvm'],default='lightgbm'); ap.add_argument('--artifacts',default=os.path.join(HERE,'..','..','artifacts')); ap.add_argument('--out',default=os.path.join(HERE,'..','..','outputs','submission_ml_stream_anchor.csv'))
    a=ap.parse_args(); os.makedirs(os.path.dirname(os.path.abspath(a.out)),exist_ok=True)
    m=TramStreamModel(mode='anchor',route5_level=float(os.environ.get('TRAM_R5_LEVEL',6500)))
    if a.action=='train': m.fit('2025-10-31'); m.save_artifacts(a.artifacts)
    else: m.load_artifacts(a.artifacts,'2025-10-31',engine=a.engine)
    m.run('2025-11-01','2025-12-31'); sub=m.write_submission(a.out)
    if a.action=='predict' and a.engine=='jvm': print('JVM-инференс: вызовов моделей',m.jvm.calls); m.jvm.close()
    print('ML готово:',a.out,'строк',len(sub),'сумма',int(sub.prediction.sum()))
