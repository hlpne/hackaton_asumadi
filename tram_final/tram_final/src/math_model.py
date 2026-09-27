from pathlib import Path
import sys
import json
import numpy as np
import pandas as pd

import os
base = Path(os.environ.get('TRAM_DATA','.'))
out = Path(os.environ.get('MATH_OUT','submission_math.csv'))
# MATH_VARIANT=main (по умолчанию) — основная версия: погодная поправка, маршрут 5 = 0 (его даёт ML);
# MATH_VARIANT=v1 — ранняя версия модели: без погодной поправки, маршрут 5 с 16.12 по правилу ниже.
VARIANT = os.environ.get('MATH_VARIANT','main')
RESTORE_7_50 = pd.Timestamp(os.environ.get('MATH_RESTORE_7_50','2025-11-15'))   # первые выходные с обычным движением 7 и 50
R5_SCALE = float(os.environ.get('MATH_R5_SCALE','1'))                            # множитель уровня маршрута 5
assert VARIANT in ('main','v1'), VARIANT
labels = pd.concat(
    [pd.read_csv(base/'labels'/f'labels_day_{part}.csv', sep=';', parse_dates=['date'])
     for part in ('train','test')],
    ignore_index=True,
)
routes = [1,5,7,11,12,17,25,26,28,50]
hist_routes = [x for x in routes if x != 5]
history_index = pd.MultiIndex.from_product(
    [hist_routes,pd.date_range('2025-01-01','2025-10-31'),range(24)],
    names=['route','date','hour'],
)
history = labels.set_index(['route','date','hour']).reindex(history_index, fill_value=0).reset_index()
history['dow'] = history.date.dt.dayofweek
history['off'] = history.dow >= 5
historical_extra_off = pd.to_datetime([
    '2025-01-01','2025-01-02','2025-01-03','2025-01-06','2025-01-07','2025-01-08',
    '2025-05-01','2025-05-02','2025-05-08','2025-05-09','2025-06-12','2025-06-13',
])
history.loc[history.date.isin(historical_extra_off),'off'] = True
history['shape_day'] = np.where(history.off, np.where(history.dow.eq(5),5,6), history.dow)

recent = history[history.date >= '2025-10-04'].copy()
old = history[history.date.between('2025-02-01','2025-05-31')].copy()
key = ['route','hour','dow']

# A short, robust profile captures the September-October operating regime.
new_profile = recent.groupby(key).boardings.agg(['mean','median'])
new_profile['prediction'] = .5*new_profile['mean'] + .5*new_profile['median']

# A small older component stabilizes individual hours without overriding October levels.
old_profile = old.groupby(key).boardings.mean()
new_level = recent.groupby(['route','dow']).boardings.mean()
old_level = old.groupby(['route','dow']).boardings.mean()
old_scale = (new_level/old_level).clip(.05,1.4)
profile = {}
for route in hist_routes:
    for dow in range(7):
        scale = float(old_scale.get((route,dow),1))
        for hour in range(24):
            fresh = float(new_profile.loc[(route,hour,dow),'prediction'])
            prior = float(old_profile.get((route,hour,dow),fresh))*scale
            profile[(route,dow,hour)] = max(0,.8*fresh+.2*prior)

# The 7 and 50 routes return to their normal weekend service on 15 November.
# Estimate demand from the pre-closure spring weekend pattern, anchored to
# October weekday ridership on the same route.
restored = {}
for route in (7,50):
    oct_workday = recent[(recent.route==route)&(recent.dow<5)].groupby('date').boardings.sum().mean()
    old_workday = old[(old.route==route)&(old.dow<5)].groupby('date').boardings.sum().mean()
    level = float(np.clip(oct_workday/old_workday,.75,1.35))
    for dow in (5,6):
        for hour in range(24):
            restored[(route,dow,hour)] = max(
                0,float(old_profile.get((route,hour,dow),0))*level
            )

def current(route,dow,hour):
    return profile[(route,dow,hour)]

def normal_weekend(route,dow,hour):
    if route in (7,50):
        return restored[(route,dow,hour)]
    return current(route,dow,hour)

def holiday(route,hour,kind):
    # On 3–4 November the temporary weekend diversion was still active.
    if kind in ('nov3','nov4') and route in (7,50):
        sunday = current(route,6,hour)
        saturday = current(route,5,hour)
    else:
        sunday = normal_weekend(route,6,hour)
        saturday = normal_weekend(route,5,hour)
    if kind == 'nov3':
        return .95*(.75*sunday+.25*saturday)
    if kind == 'nov4':
        return .86*(.85*sunday+.15*saturday)
    if kind == 'dec31':
        return .88*(.65*sunday+.35*saturday)
    raise ValueError(kind)

# October's profile already contains October's weather. Use conservative
# autumn-specific weather adjustments around that reference level.
archive = json.loads((Path(__file__).parent/'assets'/'weather.json').read_text(encoding='utf-8'))['daily']
weather = pd.DataFrame(archive).rename(columns={'time':'date'})
weather.date = pd.to_datetime(weather.date)
weather['temp_anom'] = weather.temperature_2m_mean-weather.temperature_2m_mean.rolling(21,center=True,min_periods=1).mean()
weather['wet'] = np.log1p(weather.precipitation_sum)
weather['snow'] = np.log1p(weather.snowfall_sum)
weather = weather.set_index('date')
weather_ref = weather.loc['2025-10-04':'2025-10-31',['temp_anom','wet','snow']].mean()

def weather_factor(date,hour):
    row = weather.loc[date]
    effect = (
        .001*(row.temp_anom-weather_ref.temp_anom)
        -.008*(row.wet-weather_ref.wet)
        -.004*(row.snow-weather_ref.snow)
    )
    effect = float(np.clip(effect,-.04,.04))
    hour_weight = 1. if 6<=hour<=21 else .5 if hour in (5,22) else .2
    return float(np.exp(effect*hour_weight))

sample = pd.read_csv(base/'test_submission.csv',sep=';',parse_dates=['date'])
nov1_known = {
    (1,0):2,(7,0):109,(7,1):25,(11,0):108,(12,0):30,(12,1):3,
    (17,0):151,(17,1):30,(26,0):40,(26,1):3,(50,0):55,(50,1):6,
}
values = []; raw = {}
for row in sample.itertuples(index=False):
    route = int(row.route)
    date = pd.Timestamp(row.date)
    hour = int(row.hour)
    dow = date.dayofweek
    stamp = date.strftime('%Y-%m-%d')
    if route == 5:
        pred = 0.
    elif stamp == '2025-11-01':
        if route in (7,50):
            # This Saturday was a working day; both routes were running
            # that evening, despite ordinary pre-15-Nov weekend restrictions.
            pred = .7*current(route,4,hour)+.3*current(route,5,hour)
        else:
            pred = .6*current(route,4,hour)+.4*current(route,5,hour)
    elif stamp in ('2025-11-03','2025-11-04','2025-12-31'):
        kind = {'2025-11-03':'nov3','2025-11-04':'nov4','2025-12-31':'dec31'}[stamp]
        pred = holiday(route,hour,kind)
    elif dow in (5,6) and route in (7,50) and date >= RESTORE_7_50:
        pred = normal_weekend(route,dow,hour)
    else:
        pred = current(route,dow,hour)
    if stamp == '2025-11-02':
        pred *= .95
    elif stamp == '2025-12-29':
        pred *= .96
    elif stamp == '2025-12-30':
        pred *= .92
    raw[(route,stamp,hour)] = pred
    if route != 5 and VARIANT == 'main':
        pred *= weather_factor(date,hour)
    # (фактические значения 1.11 из хвоста test.csv НЕ используются — это данные прогнозного периода)
    values.append(max(0,int(np.rint(pred))))

if VARIANT == 'v1':
    # Маршрут 5 (запуск 16.12.2025, mos.ru): 6 450 посадок в будни; выходные ×0.6; первый день ×0.7;
    # 29.12 ×0.96, 30.12 ×0.828, 31.12 ×0.496 (по профилю обычной среды). Профиль часов — как у 7+50
    # (маршрут 5 идёт по их участкам). Коэффициенты — из ранней версии модели (v1).
    R5_LEVEL = 6450.*R5_SCALE
    r5_factor = {'2025-12-16':.7,'2025-12-29':.96,'2025-12-30':.828,'2025-12-31':.4962}
    idx = {k:i for i,k in enumerate(zip(sample.route.astype(int),sample.date.dt.strftime('%Y-%m-%d'),sample.hour.astype(int)))}
    for day in pd.date_range('2025-12-16','2025-12-31'):
        stamp = day.strftime('%Y-%m-%d')
        ref = '2025-12-24' if stamp == '2025-12-31' else stamp
        prof = np.array([raw[(7,ref,h)]+raw[(50,ref,h)] for h in range(24)])
        level = R5_LEVEL*r5_factor.get(stamp, .6 if day.dayofweek >= 5 else 1.)
        for hour in range(24):
            values[idx[(5,stamp,hour)]] = max(0,int(np.rint(level*prof[hour]/prof.sum())))

submission = sample[['route','date','hour']].copy()
submission['prediction'] = values
submission['date'] = submission.date.dt.strftime('%Y-%m-%d')
assert len(submission)==14640
assert submission[['route','date','hour']].duplicated().sum()==0
assert submission.prediction.ge(0).all()
assert set(submission.route)==set(routes)
assert submission.groupby(['route','date']).hour.nunique().eq(24).all()
assert submission.date.min()=='2025-11-01' and submission.date.max()=='2025-12-31'
if len(sys.argv)==3 and sys.argv[1]=='--emit-route':
    selected = submission[submission.route.eq(int(sys.argv[2]))]
    print(','.join(map(str,selected.prediction.tolist())))
    sys.exit(0)
out.parent.mkdir(parents=True,exist_ok=True)
submission.to_csv(out,sep=';',index=False,encoding='utf-8')
print('output',out)
print('rows',len(submission),'total',submission.prediction.sum())
print(submission.pivot_table(index=submission.date.str[:7],columns='route',values='prediction',aggfunc='sum').to_string())
print('route 5 first seven days',submission[submission.route.eq(5)&submission.date.between('2025-12-16','2025-12-22')].prediction.sum())
print('route 7 weekend before/after',submission[(submission.route.eq(7))&(submission.date.isin(['2025-11-08','2025-11-15']))].groupby('date').prediction.sum().to_dict())
print('route 50 weekend before/after',submission[(submission.route.eq(50))&(submission.date.isin(['2025-11-08','2025-11-15']))].groupby('date').prediction.sum().to_dict())
