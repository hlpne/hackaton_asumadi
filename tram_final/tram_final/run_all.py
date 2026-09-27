"""Полный конвейер финального решения (скор на платформе 0.90461).
  python run_all.py                       # обучение ML + артефакты + все шаги
  python run_all.py --use-artifacts       # без обучения: инференс сохранёнными моделями (LightGBM)
  python run_all.py --use-artifacts --engine onnx   # инференс через ONNX Runtime (Python)
  python run_all.py --use-artifacts --engine jvm    # инференс через ONNX Runtime в JVM (сначала mvn package в jvm/)
  python run_all.py --blend-weight 0.5 --dec-mean 0.0285   # прошлый финал 0.90447
  python run_all.py --final ramp --blend-weight 0.5 --dec-mean 0.0285   # ещё раньше: ML-гибрид + хвост 1.11 (0.90321)
  python run_all.py --no-nov1-tail        # без хвоста 1 ноября
Данные: переменная TRAM_DATA=путь к папке dataset (labels/, test_submission.csv, опционально test.csv)."""
import os, sys, subprocess, argparse, hashlib, shutil
ROOT=os.path.dirname(os.path.abspath(__file__)); SRC=os.path.join(ROOT,'src'); OUT=os.path.join(ROOT,'outputs'); ART=os.path.join(ROOT,'artifacts')
ap=argparse.ArgumentParser(); ap.add_argument('--use-artifacts',action='store_true'); ap.add_argument('--engine',default='lightgbm',choices=['lightgbm','onnx','jvm'])
ap.add_argument('--no-nov1-tail',action='store_true'); ap.add_argument('--final',default='blend',choices=['blend','ramp'])
ap.add_argument('--blend-weight',default='0.4',help='доля ML-гибрида в финальном ансамбле (0.4 — подобрано по скору на платформе: 0 / 0.4 / 0.5)')
# параметры, которые организаторы разрешили подбирать по скору на платформе (значения по умолчанию = финал 0.90461)
ap.add_argument('--r5-scale',type=float,default=1.0,help='множитель уровня маршрута 5 (ML: 6500 в будни, математика v1: 6450)')
ap.add_argument('--dec-mean',default='0.057',help='средняя декабрьская сезонная надбавка ML-гибрида (0.057 = полный сдвиг 1.0569; подобрано по скору: 0.0285 / 0.057 / 0.07125)')
ap.add_argument('--restore-7-50',default='2025-11-15',help='первые выходные с обычным движением 7 и 50')
ap.add_argument('--out',default=None,help='путь финального файла (по умолчанию outputs/submission_final.csv)')
a=ap.parse_args()
import datetime as _dt
DATA=os.environ.get('TRAM_DATA',os.path.join(ROOT,'..','..'))
_restr_end=(_dt.date.fromisoformat(a.restore_7_50)-_dt.timedelta(days=1)).isoformat()
env=dict(os.environ,TRAM_DATA=DATA,TRAM_DATA_DIR=DATA,TRAM_R5_LEVEL=str(6500*a.r5_scale),MATH_R5_SCALE=str(a.r5_scale),
         MATH_RESTORE_7_50=a.restore_7_50,TRAM_RESTRICT_END=_restr_end)
print('параметры: r5_scale',a.r5_scale,'dec_mean',a.dec_mean,'restore_7_50',a.restore_7_50,'blend_weight',a.blend_weight)
def run(*cmd,**kw): print('>>',' '.join(os.path.relpath(c,ROOT) if c.startswith(ROOT) else c for c in cmd)); subprocess.run([sys.executable,*cmd],check=True,env=dict(env,**kw))
def o(name): return os.path.join(OUT,name)
os.makedirs(OUT,exist_ok=True)
sys.path.insert(0,SRC); import nov1_tail
tail=None
if not a.no_nov1_tail:
    tail,src=nov1_tail.load(DATA,os.path.join(ROOT,'assets')); print('хвост 1.11 из',src)
def with_tail(src,dst):
    if tail is None: shutil.copy(src,dst)
    else: nov1_tail.apply(src,dst,tail)

# 1. ML: потоковая модель (LightGBM), обучение с сохранением артефактов или инференс из артефактов
ml=o('submission_ml_stream_anchor.csv')
if a.use_artifacts: run(os.path.join(SRC,'tram_ml','stream.py'),'predict','--engine',a.engine,'--artifacts',ART,'--out',ml)
else: run(os.path.join(SRC,'tram_ml','stream.py'),'train','--artifacts',ART,'--out',ml)
# 2. Математическая модель, основная версия (профиль 4 недель + весенний, календарные правила, погода)
math=o('submission_math.csv'); run(os.path.join(SRC,'math_model.py'),MATH_OUT=math)
# 3. Гибрид: сумма за день = 0.5*ML + 0.5*медиана 4 недель, профиль по часам — ML; праздники и ночь — математика
hier=o('submission_hybrid_hier.csv'); run(os.path.join(SRC,'make_hybrid_hier.py'),ml,math,hier)                    # 0.90194
# 4. Сезонность прошлых лет (data.mos.ru, 2019, 2022–2024): печать факторов и надбавка к Новому году
run(os.path.join(SRC,'seasonal_prior.py'),os.path.join(ROOT,'assets','data-62521-15-09-2026.csv'))
DEC_MEAN=a.dec_mean   # 1.0569 - 1: полный сезонный сдвиг декабря по data.mos.ru (подбор по скору на платформе)
ramp=o('submission_hier_seasonal_ramp.csv'); run(os.path.join(SRC,'apply_seasonal_ramp.py'),hier,ramp,DEC_MEAN)   # при --dec-mean 0.0285: 0.90320
ramp_tail=o('submission_hier_ramp_nov1tail.csv'); with_tail(ramp,ramp_tail)                                      # при --dec-mean 0.0285: 0.90321
# 5. Математическая модель v1: ранняя версия (без погоды, маршрут 5 по правилу) + уточнения основной версии
math_v1_raw=o('submission_math_v1_raw.csv'); run(os.path.join(SRC,'math_model.py'),MATH_OUT=math_v1_raw,MATH_VARIANT='v1')
math_tail=o('submission_math_nov1tail.csv'); with_tail(math,math_tail)
math_v1=o('submission_math_v1.csv'); run(os.path.join(SRC,'make_math_v1.py'),math_v1_raw,math_tail,math_v1)                # 0.90339
# 6. Финал: ансамбль ML-гибрида и математической модели v1 (вес 0.4 подобран по скору на платформе)
final=a.out or o('submission_final.csv')
if a.final=='ramp': shutil.copy(ramp_tail,final)
else: run(os.path.join(SRC,'blend.py'),ramp,math_v1,a.blend_weight,final)                                            # 0.90461
print('ГОТОВО:',final,'sha256',hashlib.sha256(open(final,'rb').read()).hexdigest()[:16])
