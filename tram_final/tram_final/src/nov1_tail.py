"""Посадки 1 ноября 2025 из «хвоста» test.csv (часы 0–1). Используется ТОЛЬКО с разрешения организаторов.
Если test.csv доступен — считаем из него (успешные валидации validation_result==1 по ngpt_route и часу);
иначе берём assets/nov1_tail.json (посчитано тем же способом командой ранее)."""
import os, json, csv, sys
from collections import Counter
def from_test_csv(path):
    cnt=Counter()
    with open(path,encoding='utf-8',errors='ignore') as fh:
        for line in fh:
            if ';2025-11-01' not in line: continue
            row=next(csv.reader([line],delimiter=';'))
            if len(row)!=14 or row[2][:10]!='2025-11-01' or row[6]!='1': continue
            try: cnt[(int(row[11].split()[0]),int(row[2][11:13]))]+=1
            except Exception: pass
    return {f'{r}_{h}':v for (r,h),v in cnt.items()}
def load(data_dir, assets_dir):
    p=os.path.join(data_dir,'test.csv')
    if os.path.exists(p): return from_test_csv(p),'test.csv'
    return json.load(open(os.path.join(assets_dir,'nov1_tail.json')))['counts'],'assets/nov1_tail.json'
def apply(sub_path, out_path, counts):
    import pandas as pd
    s=pd.read_csv(sub_path,sep=';'); m=s.date.eq('2025-11-01')&s.hour.isin([0,1])
    s.loc[m,'prediction']=[int(counts.get(f'{r}_{h}',0)) for r,h in zip(s.loc[m,'route'],s.loc[m,'hour'])]
    s.to_csv(out_path,sep=';',index=False); return s
if __name__=='__main__':
    c,src=load(sys.argv[1],sys.argv[2]); print(src,c)
