"""Precompute non-destructive character grades; runtime retains the actual cutout animation."""
from pathlib import Path
import json
import hashlib
import numpy as np
import cv2
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'assets/character/fx'

def grade(image,mode,detail=False):
    rgba=np.array(image.convert('RGBA'));rgb=rgba[:,:,:3].astype(np.float32);alpha=rgba[:,:,3]
    luma=rgb@np.array([.2126,.7152,.0722],np.float32)
    if mode=='mono':out=np.repeat(luma[:,:,None],3,axis=2)
    elif mode=='ink':
        value=np.clip((luma-160)*1.35+160,0,255)
        out=np.repeat(value[:,:,None],3,axis=2)
        yy,xx=np.indices(alpha.shape);dots=((xx%10-5)**2+(yy%10-5)**2)<=2
        out[dots]*=.77
    elif mode=='negative':
        value=np.clip((255-luma-100)*1.12+115,0,255)
        out=value[:,:,None]*np.array([.78,1,.92],np.float32)
        yy,xx=np.indices(alpha.shape);dots=((xx%10-5)**2+(yy%10-5)**2)<=2
        out[dots]*=.78
    elif mode=='soft':
        out=rgb*.55+luma[:,:,None]*.45
        # Premultiplied blur avoids dark fringes on transparent cutout edges.
        a=alpha.astype(np.float32)/255
        prem=np.dstack([out*a[:,:,None],a])
        blurred=cv2.GaussianBlur(prem,(0,0),2.5 if detail else 3.2)
        a=blurred[:,:,3]
        out=np.divide(blurred[:,:,:3],a[:,:,None],out=np.zeros_like(rgb),where=a[:,:,None]>.0001)
        alpha=np.clip(a*255,0,255).astype(np.uint8)
    else:raise ValueError(mode)
    rgba[:,:,:3]=np.clip(out,0,255).astype(np.uint8);rgba[:,:,3]=alpha;rgba[alpha==0,:3]=0
    return Image.fromarray(rgba)

def main():
    file=ROOT/'config.json';config=json.loads(file.read_text(encoding='utf-8'))
    original={k:v for k,v in config['images'].items() if not k.startswith('fx_')}
    DEST.mkdir(parents=True,exist_ok=True);maps={k:{} for k in ['mono','ink','negative','soft']};done={};records=[]
    for key,relative in original.items():
        source=ROOT/relative
        for mode in maps:
            target=DEST/f'{source.stem}-{mode}.png'
            if (relative,mode) not in done:
                im=grade(Image.open(source),mode,key in ('eyes','hand'));im.save(target)
                done[(relative,mode)]=target
                records.append({'source':relative,'mode':mode,'output':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
            fxkey=f'fx_{mode}_{key}';config['images'][fxkey]=str(target.relative_to(ROOT)).replace('\\','/');maps[mode][key]=fxkey
    config['fxAssets']=maps
    file.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
    (DEST/'manifest.json').write_text(json.dumps({'method':'Offline grayscale, ink/halftone, cold negative and premultiplied-alpha Gaussian defocus. Original art untouched.','records':records},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'uniqueImages':len(records),'resourceKeys':len(config['images']),'styles':list(maps)}))

if __name__=='__main__':main()
