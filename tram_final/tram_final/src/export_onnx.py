"""Экспорт LightGBM-артефактов в ONNX (для инференса в JVM через ONNX Runtime / DJL) и сверка точности.
Вход: artifacts/manifest.json + *.txt; выход: artifacts/onnx/*.onnx, artifacts/onnx/validation.json,
artifacts/onnx/sample_features_*.csv (строки признаков для проверки в Java)."""
import os, sys, json, numpy as np, pandas as pd, lightgbm as lgb
import onnxruntime as ort
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART=os.path.join(ROOT,'artifacts'); OUT=os.path.join(ART,'onnx'); os.makedirs(OUT,exist_ok=True)
man=json.load(open(os.path.join(ART,'manifest.json')))
feats_cache=pd.read_pickle(os.path.join(ROOT,'src','tram_ml','train_feats.pkl'))
rng=np.random.default_rng(0); sample=feats_cache.iloc[rng.choice(len(feats_cache),2000,replace=False)]
report={}
def export(txt,cols,X):
    b=lgb.Booster(model_file=os.path.join(ART,txt))
    onx=convert_lightgbm(b,initial_types=[('input',FloatTensorType([None,len(cols)]))],target_opset=15,zipmap=False)
    fn=txt.replace('.txt','.onnx'); open(os.path.join(OUT,fn),'wb').write(onx.SerializeToString())
    sess=ort.InferenceSession(os.path.join(OUT,fn))
    xf=X[cols].to_numpy(dtype=np.float32)
    po=sess.run(None,{'input':xf})[0].ravel(); pl=b.predict(X[cols].astype(float))
    report[fn]={'features':cols,'max_abs_diff':float(np.max(np.abs(po-pl))),'mean_abs_pred':float(np.mean(np.abs(pl)))}
    return fn
for vm in man['volume_models']:
    for f in vm['files']: export(f,vm['features'],sample)
    sample[vm['features']].head(20).to_csv(os.path.join(OUT,f"sample_features_cfg{vm['config']}.csv"),index=False)
# профиль по часам: строки признаков shape-модели
sys.path.insert(0,os.path.join(ROOT,'src','tram_ml'))
G=dict(__file__=os.path.join(ROOT,'src','tram_ml','v4.py'))
for f in ['v4.py','shape4.py']: exec(open(os.path.join(ROOT,'src','tram_ml',f),encoding='utf-8').read(),G)
Y=G['load_labels'](); G['Y']=Y
Xs=G['shape_rows'](Y,range(G['DI'][pd.Timestamp('2025-10-01')],G['DI'][pd.Timestamp('2025-10-31')]+1))
export(man['shape_model']['file'],man['shape_model']['features'],Xs)
Xs[man['shape_model']['features']].head(20).to_csv(os.path.join(OUT,'sample_features_shape.csv'),index=False)
json.dump(report,open(os.path.join(OUT,'validation.json'),'w'),indent=1)
worst=max(v['max_abs_diff'] for v in report.values())
print('ONNX моделей:',len(report),'максимальное расхождение с LightGBM:',worst)
