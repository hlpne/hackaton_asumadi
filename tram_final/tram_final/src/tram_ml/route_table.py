import os,sys,numpy as np,pandas as pd
exec(open('stream.py',encoding='utf-8').read().split("if __name__=='__main__':")[0])
Y=G['Y'];DI=G['DI'];ROUTES=G['ROUTES']
cut,end,hl,b,tag=sys.argv[1],sys.argv[2],int(sys.argv[3]),float(sys.argv[4]),sys.argv[5]
c,e=DI[pd.Timestamp(cut)],DI[pd.Timestamp(end)]; st=pd.Timestamp(cut)+pd.Timedelta(days=1)
S=TramStreamModel(mode='anchor',half_life=hl,shape_blend=b).fit(cut).run(st,end)
y=Y[:,c+1:e+1]; p=S[:,c+1:e+1]
rows=[]
for i,r in enumerate(ROUTES):
    a=y[i].sum(); er=np.abs(y[i]-p[i]).sum(); rows.append((r,int(a),round(er,1),round(er/a,6)))
rows.insert(1,(5,0,0.0,np.nan))
T=pd.DataFrame(rows,columns=['route','actual','error','WAPE']).set_index('route')
T.loc['ВСЕ']=[int(y.sum()),round(np.abs(y-p).sum(),1),round(np.abs(y-p).sum()/y.sum(),6)]
T['score']=(1-T.WAPE).round(4)
# по типам дней
kind=G['KIND'][c+1:e+1]; hol=G['CAL'].hol.values[c+1:e+1]
lab=np.where(hol==1,'праздник',np.where(kind==0,'будни',np.where(kind==1,'суббота','воскресенье')))
K=pd.DataFrame([(k,int(y[:,lab==k].sum()),round(np.abs(y-p)[:,lab==k].sum(),1)) for k in ['будни','суббота','воскресенье','праздник'] if (lab==k).any()],columns=['тип дня','actual','error']).set_index('тип дня')
K['WAPE']=(K.error/K.actual).round(4)
# по часам (группы)
hrs={'0-4':range(0,5),'5-9':range(5,10),'10-15':range(10,16),'16-19':range(16,20),'20-23':range(20,24)}
H=pd.DataFrame([(k,int(y[:,:,list(v)].sum()),round(np.abs(y-p)[:,:,list(v)].sum(),1)) for k,v in hrs.items()],columns=['часы','actual','error']).set_index('часы'); H['WAPE']=(H.error/H.actual).round(4)
os.makedirs('reports',exist_ok=True)
T.to_csv(f'reports/wape_by_route_{tag}.csv',sep=';'); K.to_csv(f'reports/wape_by_daytype_{tag}.csv',sep=';'); H.to_csv(f'reports/wape_by_hours_{tag}.csv',sep=';')
pd.set_option('display.width',200)
print('###',tag,cut,end); print(T.to_string()); print(K.to_string()); print(H.to_string())
