"""CNN (PyTorch) для прогноза посадок маршрут × день × час в режиме anchor (прямой многогоризонтный прогноз).
Вход: «картинка» последних 28 дней × 24 часа (посадки, тип дня, флаг ограничений) + признаки целевого дня.
Выход: 24 часа целевого дня = scale * (B + delta), B — профиль последних дней того же типа."""
import os, sys, time, numpy as np, pandas as pd, torch, torch.nn as nn
torch.set_num_threads(2)
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'tram_ml')
os.environ.setdefault('TRAM_DATA', os.path.join(HERE, '..', '..', '..', '..'))
G = dict(__file__=os.path.join(HERE, 'v4.py'))
exec(open(os.path.join(HERE, 'v4.py'), encoding='utf-8').read(), G)
Y = G['load_labels'](); CAL = G['CAL']; RESTR = G['RESTR']; DI = G['DI']; R = G['R']; ND = G['ND']
KIND = CAL.kind.values; DOW = CAL.dow.values; WSAT = CAL.wsat.values
W = 28; H = 61
TAB_COLS = ['hol', 'hol_wd', 'preh', 'wsat', 'school']
TABC = CAL[TAB_COLS].values.astype(np.float32)
BLEN = np.clip(CAL.blen.values / 5, 0, 2).astype(np.float32); BPOS = np.clip(CAL.bpos.values / 5, 0, 2).astype(np.float32)

def scale_of(ri, c):
    return max(np.nansum(Y[ri, c - W + 1:c + 1]) / W, 100.) / 24.

def image(ri, c):
    """каналы × 28 дней × 24 часа для отсечки c (последний известный день)"""
    s = scale_of(ri, c); days = np.arange(c - W + 1, c + 1)
    x = np.zeros((5, W, 24), np.float32)
    x[0] = Y[ri, days] / s
    k = KIND[days].copy(); k[WSAT[days] == 1] = 0
    for j in range(3): x[1 + j] = (k == j)[:, None]
    x[4] = RESTR[ri, days][:, None]
    return x, s

def baseline(ri, c, d):
    """профиль последних дней того же типа, что и день d (в окне до c), в долях scale"""
    s = scale_of(ri, c); days = np.arange(c - W + 1, c + 1)
    k = KIND[days].copy(); k[WSAT[days] == 1] = 0
    kd = 0 if WSAT[d] else KIND[d]
    if kd == 0:
        m = (k == 0) & (DOW[days] == DOW[d])
        if m.sum() == 0: m = k == 0
    else:
        m = (k == kd) & (RESTR[ri, days] == RESTR[ri, d])
        if m.sum() == 0: m = k == kd
        if m.sum() == 0: m = k == 2
    idx = days[m][-3:]
    return (Y[ri, idx].mean(0) / s).astype(np.float32)

def tab(ri, c, d):
    kd = 0 if WSAT[d] else KIND[d]
    v = np.zeros(3 + 7 + len(TAB_COLS) + 2 + 2 + R + 1, np.float32); o = 0
    v[o + kd] = 1; o += 3
    v[o + DOW[d]] = 1; o += 7
    v[o:o + len(TAB_COLS)] = TABC[d]; o += len(TAB_COLS)
    v[o] = BLEN[d]; v[o + 1] = BPOS[d]; o += 2
    v[o] = RESTR[ri, d]; v[o + 1] = (d - c) / H; o += 2
    v[o + ri] = 1; o += R
    v[o] = RESTR[ri, c]
    return v
NTAB = len(tab(0, 60, 61))

class TramCNN(nn.Module):
    def __init__(s, ch=24):
        super().__init__()
        s.enc = nn.Sequential(nn.Conv2d(5, ch, (3, 3), padding=1), nn.GELU(),
                              nn.Conv2d(ch, ch, (3, 3), padding=1), nn.GELU(),
                              nn.Conv2d(ch, ch, (W, 1)), nn.GELU())            # свёртка по всем 28 дням -> ch × 1 × 24
        s.tab = nn.Sequential(nn.Linear(NTAB, ch), nn.GELU())
        s.dec = nn.Sequential(nn.Conv1d(2 * ch + 1, ch, 3, padding=1), nn.GELU(),
                              nn.Conv1d(ch, ch, 3, padding=1), nn.GELU(), nn.Conv1d(ch, 1, 1))
    def forward(s, img, t, b):
        e = s.enc(img).squeeze(2)                                   # N × ch × 24
        tt = s.tab(t)[:, :, None].expand(-1, -1, 24)
        z = torch.cat([e, tt, b[:, None, :]], 1)
        return b + s.dec(z).squeeze(1)                              # N × 24, в долях scale

def build(cut, H=H, start='2025-01-29'):
    """обучающие примеры: все отсечки c < cut и горизонты h, для которых цель d = c + h <= cut.
    Картинки окна хранятся один раз на (маршрут, отсечку), примеры ссылаются на них по индексу."""
    ce = DI[pd.Timestamp(cut)]; c0 = DI[pd.Timestamp(start)]
    imgs, scs, pos = [], [], {}
    for c in range(c0, ce):
        for ri in range(R):
            x, s = image(ri, c); pos[(ri, c)] = len(imgs); imgs.append(x); scs.append(s)
    K, T, B, Yt, S, Wt = [], [], [], [], [], []
    for c in range(c0, ce):
        for h in range(1, H + 1):
            d = c + h
            if d > ce: break
            for ri in range(R):
                k = pos[(ri, c)]; K.append(k); T.append(tab(ri, c, d)); B.append(baseline(ri, c, d))
                Yt.append(Y[ri, d] / scs[k]); S.append(scs[k]); Wt.append(0.5 ** ((ce - d) / 45))
    f = lambda a: torch.tensor(np.array(a, dtype=np.float32))
    return f(imgs), torch.tensor(K), f(T), f(B), f(Yt), f(S), f(Wt)

def fit(cut, seed=1, epochs=10, bs=512, lr=2e-3, H=H, verbose=True, data=None):
    torch.manual_seed(seed); np.random.seed(seed)
    IMG, K, T, B, Yt, S, Wt = data if data is not None else build(cut, H)
    mask = torch.ones(24); mask[1:5] = 0
    m = TramCNN(); opt = torch.optim.AdamW(m.parameters(), lr=lr, weight_decay=1e-4)
    n = len(K); steps = epochs * ((n + bs - 1) // bs)
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps)
    for ep in range(epochs):
        perm = torch.randperm(n); tot = 0.
        for i in range(0, n, bs):
            j = perm[i:i + bs]
            p = m(IMG[K[j]], T[j], B[j])
            # L1 в абсолютных посадках (вес = scale) ≈ WAPE, плюс затухание по давности
            w = S[j] * Wt[j]
            loss = ((p - Yt[j]).abs() * mask * w[:, None]).sum() / w.sum() / 20
            opt.zero_grad(); loss.backward(); opt.step(); sch.step(); tot += loss.item() * len(j)
        if verbose: print(f'  seed {seed} epoch {ep + 1}/{epochs} loss {tot / n:.4f}', flush=True)
    return m

@torch.no_grad()
def forecast(models, cut, end):
    """anchor: всё окно — факты до cut; прогноз на дни cut+1..end"""
    c = DI[pd.Timestamp(cut)]; e = DI[pd.Timestamp(end)]
    out = np.full((R, ND, 24), np.nan)
    for d in range(c + 1, e + 1):
        I = torch.tensor(np.array([image(ri, c)[0] for ri in range(R)]))
        T = torch.tensor(np.array([tab(ri, c, d) for ri in range(R)]))
        Bb = torch.tensor(np.array([baseline(ri, c, d) for ri in range(R)]))
        p = np.mean([mm(I, T, Bb).numpy() for mm in models], 0)
        s = np.array([scale_of(ri, c) for ri in range(R)])
        p = np.clip(p * s[:, None], 0, None); p[:, 1:5] = 0
        out[:, d] = p
    return out

if __name__ == '__main__':
    cut, end = sys.argv[1], sys.argv[2]; seeds = [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else '1').split(',')]
    ep = int(os.environ.get('EPOCHS', 10))
    t = time.time(); data = build(cut); print('samples', len(data[1]), flush=True); ms = [fit(cut, s, epochs=ep, data=data) for s in seeds]; print('train', round(time.time() - t), 's', flush=True)
    P = forecast(ms, cut, end); np.save(f'S_cnn_{cut}.npy', P)
    c, e = DI[pd.Timestamp(cut)], DI[pd.Timestamp(end)]
    y = Y[:, c + 1:e + 1]; print('CNN score', round(1 - np.abs(y - P[:, c + 1:e + 1]).sum() / y.sum(), 4))
