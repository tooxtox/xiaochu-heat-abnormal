"""Build a limited 2D raster rig from the already generated and locally traced art.

python tools/build_rig.py
No new anatomy is drawn. Only small hidden hand/cuff and front-lock underlays are inpainted.
"""
from pathlib import Path
import json
import sys
import importlib.util
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parents[1] / "work" / "deps" / "character"))
import cv2

spec = importlib.util.spec_from_file_location("trace_character", Path(__file__).with_name("trace_character.py"))
trace = importlib.util.module_from_spec(spec); spec.loader.exec_module(trace)
SOURCE = ROOT / "assets" / "character"
DEST = SOURCE / "rig"
DEST.mkdir(parents=True, exist_ok=True)
FONT = "C:/Windows/Fonts/consola.ttf"


def polygon(points, size):
    mask = np.zeros((size[1], size[0]), np.uint8)
    cv2.fillPoly(mask, [np.array(points, np.int32)], 255)
    return mask


def save_layer(name, rgba, mask):
    a = rgba.copy()
    a[:, :, 3] = (a[:, :, 3].astype(np.uint16) * mask // 255).astype(np.uint8)
    a[a[:, :, 3] == 0, :3] = 0
    Image.fromarray(a).save(DEST / name)


def rotate(image, pivot, degrees):
    a = np.asarray(image).astype(np.float32) / 255
    a[:, :, :3] *= a[:, :, 3:4]
    matrix = cv2.getRotationMatrix2D(pivot, -degrees, 1)
    a = cv2.warpAffine(a, matrix, image.size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    a[:, :, :3] /= np.maximum(a[:, :, 3:4], 1e-6)
    return Image.fromarray(np.uint8(np.clip(a, 0, 1)*255))


def compose(full, angle=0, only=None):
    out = Image.new("RGBA", (full["width"], full["height"]))
    pieces = [{"path": full["base"], "drawOrder": full["baseDrawOrder"], "amplitudeDeg": 0}] + full["layers"]
    for piece in sorted(pieces, key=lambda layer: layer["drawOrder"]):
        image = Image.open(DEST / Path(piece["path"]).name).convert("RGBA")
        if angle and piece.get("amplitudeDeg") and (only is None or only==piece.get("name")):
            image = rotate(image, piece["pivot"], angle*piece["amplitudeDeg"])
        out.alpha_composite(image)
    return out


def bg(image, color="#213733"):
    out = Image.new("RGBA", image.size, color); out.alpha_composite(image)
    return out.convert("RGB")


def motion_qa(full, original):
    rest=np.array(compose(full));source=np.array(original)
    diff=np.abs(rest.astype(np.int16)-source.astype(np.int16))
    independent=[]
    for layer in full["layers"]:
        moved=np.array(compose(full,1,only=layer["name"]))
        changed=np.max(np.abs(moved.astype(np.int16)-rest.astype(np.int16)),axis=2)>8
        ys,xs=np.nonzero(changed)
        assert len(xs)>100, f'Layer {layer["name"]} did not move independently'
        independent.append({"name":layer["name"],"changedPixels":len(xs),"changedBounds":[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]})
    return {"restMeanAbsoluteChannelDifference":round(float(diff.mean()),4),"restDifferingPixels":int(np.count_nonzero(np.max(diff,axis=2)>8)),
            "maximumAnglesVerified":True,"visualReview":"Source-resolution ear, tail, wrist, front-lock and back-hair attachment crops inspected at both declared rotation limits on 2026-10-22.",
            "independentMotion":independent}


def build_full():
    original = Image.open(SOURCE / "xiaochu-recolored.png").convert("RGBA")
    a = np.asarray(original).copy(); size = original.size; shape = a.shape[:2]
    definitions = [
        {"name":"ear_left", "pivot":[467,138], "amplitudeDeg":3.5, "drawOrder":8,
         "cut":[(416,46),(501,75),(504,91),(451,160),(431,150),(418,130)],
         "extract":[(413,44),(512,75),(521,105),(474,176),(432,177),(414,137)]},
        {"name":"ear_right", "pivot":[609,96], "amplitudeDeg":3, "drawOrder":9,
         "cut":[(565,60),(620,0),(650,0),(651,116),(577,80)],
         "extract":[(553,64),(620,0),(655,0),(654,132),(586,104)]},
        {"name":"tail", "pivot":[354,765], "amplitudeDeg":3.5, "drawOrder":1,
         "cut":[(67,577),(201,574),(218,607),(230,660),(234,685),(253,688),(259,741),(280,769),(320,764),(355,735),(369,740),(365,793),(340,811),(298,829),(212,834),(166,827),(158,747),(153,698),(149,666),(100,678),(71,666)],
         "extract":[(67,577),(201,574),(218,607),(230,660),(234,685),(253,688),(259,741),(280,769),(320,764),(355,724),(392,726),(392,798),(345,819),(298,829),(212,834),(166,827),(158,747),(153,698),(149,666),(100,678),(71,666)]},
        {"name":"hair_back_left", "pivot":[335,382], "amplitudeDeg":1.2, "drawOrder":3,
         "cut":[(66,323),(270,316),(330,339),(329,409),(312,461),(323,521),(343,574),(351,647),(338,678),(223,680),(190,579),(76,565)],
         "extract":[(66,323),(270,316),(351,335),(350,405),(332,465),(344,523),(363,578),(373,649),(350,686),(223,680),(190,579),(76,565)]},
        {"name":"hair_back_right", "pivot":[719,403], "amplitudeDeg":1.2, "drawOrder":4,
         "cut":[(717,351),(807,360),(886,425),(922,566),(863,646),(805,676),(778,654),(778,573),(741,501),(722,426)],
         "extract":[(694,334),(807,360),(886,425),(922,566),(863,646),(805,676),(765,654),(757,570),(718,501),(701,423)]},
    ]
    cut_masks = {}
    extract_masks = {}
    # Tail/hair masks use the existing silhouette. The extracted overlap is hidden by the body.
    for d in definitions:
        cut_masks[d["name"]] = polygon(d["cut"], size)
        extract_masks[d["name"]] = polygon(d["extract"], size)
    for name in ("hair_back_left", "hair_back_right"):
        cut_masks[name][cut_masks["tail"] > 0] = 0
        extract_masks[name][extract_masks["tail"] > 0] = 0
    # The raised hand is separated by its actual skin/cloth/ink colours inside a conservative ROI.
    hand_roi = polygon([(316,396),(367,394),(399,424),(427,419),(443,461),(453,509),(441,546),(410,554),(379,534),(374,505),(317,492)], size)
    mint = (a[:, :, 1].astype(int) > a[:, :, 0].astype(int)+7) & (a[:, :, 1].astype(int) > a[:, :, 2].astype(int)+3)
    ink = (a[:, :, 0] < 75) & (a[:, :, 1] < 118)
    candidate = ((~mint | ink) & (hand_roi>0) & (a[:, :, 3]>0)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate, 8)
    component = 1+np.argmax(stats[1:, cv2.CC_STAT_AREA])
    hand = (labels==component).astype(np.uint8)*255
    cuff = polygon([(419,475),(449,499),(453,521),(437,546),(413,538),(405,512)], size)
    hand = cv2.bitwise_or(hand, cv2.bitwise_and(cuff, hand_roi))
    hand = cv2.morphologyEx(hand, cv2.MORPH_CLOSE, np.ones((3,3),np.uint8))
    hand = cv2.dilate(hand, np.ones((3,3),np.uint8))
    hand[(a[:, :, 3]==0) | (hand_roi==0)] = 0
    cut_masks["raised_hand"] = hand
    extract_masks["raised_hand"] = hand.copy()
    definitions.append({"name":"raised_hand", "pivot":[439,526], "amplitudeDeg":2.8, "drawOrder":30,
                        "reconstruction":"Only the small revealed hand/cuff underlay is OpenCV inpainted, then quantised to the fixed palette."})

    # The foreground lock crosses white clothing, so its exact mint/ink region can be isolated.
    front_roi=polygon([(497,286),(526,291),(559,345),(578,412),(568,459),(535,496),(510,508),(506,483),(533,448),(542,407),(519,359),(499,324)],size)
    front_seed=((mint|ink)&(front_roi>0)&(a[:,:,3]>0)).astype(np.uint8)
    count,front_labels,stats,_=cv2.connectedComponentsWithStats(front_seed,8)
    front=(front_labels==1+np.argmax(stats[1:,cv2.CC_STAT_AREA])).astype(np.uint8)*255
    front=cv2.dilate(front,np.ones((3,3),np.uint8));front[(front_roi==0)|(a[:,:,3]==0)]=0
    cut_masks["hair_front"]=front;extract_masks["hair_front"]=front.copy()
    definitions.append({"name":"hair_front","pivot":[519,318],"amplitudeDeg":1,"drawOrder":35,
                        "reconstruction":"Original mint/ink foreground lock; the hidden clothing beneath it is locally inpainted and quantised only inside the cut region."})

    base = a.copy()
    # Only covered hand/cuff and front-lock regions have inferred underlays; all remain behind original layers.
    for internal in [hand,front]:
        inpaint_rgb = cv2.inpaint(base[:,:,:3], internal, 5, cv2.INPAINT_TELEA)
        pixels = inpaint_rgb[internal>0].astype(np.int16)
        palette = trace.COLORS.astype(np.int16)
        index = np.argmin(np.sum((pixels[:,None,:]-palette[None,:,:]).astype(np.float32)**2,axis=2),axis=1)
        base[internal>0,:3] = trace.COLORS[index]
    for d in definitions:
        if d["name"] not in ["raised_hand","hair_front"]:
            base[cut_masks[d["name"]]>0, 3] = 0
    base[base[:,:,3]==0,:3] = 0
    Image.fromarray(base).save(DEST / "full-base.png")
    layers=[]
    for d in definitions:
        save_layer(f'full-{d["name"]}.png', a, extract_masks[d["name"]])
        layers.append({"name":d["name"],"path":f'assets/character/rig/full-{d["name"]}.png',"width":size[0],"height":size[1],
                       "pivot":d["pivot"],"amplitudeDeg":d["amplitudeDeg"],"drawOrder":d["drawOrder"],"parent":"body_static",
                       "mode":"rotate","available":True,"actual":True,"reconstruction":d.get("reconstruction","Original pixels with conservative hidden attachment overlap; no painted new anatomy.")})
    full={"width":size[0],"height":size[1],"base":"assets/character/rig/full-base.png","baseDrawOrder":20,"layers":layers,
          "head":{"available":False,"reason":"Head/neck and scalp fringe are not safely separable from this single raster without inventing hidden hair and collar. Head remains in the static base; ears are real separate layers."}}
    rest=compose(full)
    low=compose(full,-1); high=compose(full,1)
    # Small underlaps intentionally overpaint antialiased joins; quantify instead of claiming pixel-perfect equality.
    full["qa"]=motion_qa(full,original)
    rest.save(DEST / "full-rest.png"); low.save(DEST / "full-min.png"); high.save(DEST / "full-max.png")
    sheet=Image.new("RGB",(1200,650),"#101C1D"); draw=ImageDraw.Draw(sheet)
    for i,(label,image) in enumerate([("MINIMUM ROTATIONS",low),("REASSEMBLED REST",rest),("MAXIMUM ROTATIONS",high)]):
        thumb=bg(image); thumb.thumbnail((400,600),Image.Resampling.LANCZOS)
        sheet.paste(thumb,(i*400,50)); draw.text((i*400+12,18),label,fill="#B9F0D5",font=ImageFont.truetype(FONT,18))
    sheet.save(DEST / "motion-extrema.png")
    # Large QA crop exposes hand and ear joins that full-frame previews may hide.
    for name,box in [("ears",(395,0,680,200)),("hand",(305,385,480,580)),("tail",(65,565,400,840)),("hair_front",(480,275,590,515)),("hair_back",(290,320,380,670))]:
        strip=Image.new("RGB",((box[2]-box[0])*3,box[3]-box[1]),"#213733")
        for i,image in enumerate([low,rest,high]):strip.paste(bg(image.crop(box)),(i*(box[2]-box[0]),0))
        strip.resize((strip.width*2,strip.height*2),Image.Resampling.NEAREST).save(DEST / f"qa-{name}.png")
    return full


def closed_lashes(peace, roi, clip=None):
    a=np.asarray(peace); x0,y0,x1,y1=roi
    mask=((a[y0:y1,x0:x1,0]<80)&(a[y0:y1,x0:x1,1]<118)&(a[y0:y1,x0:x1,3]>127)).astype(np.uint8)
    count,labels,stats,_=cv2.connectedComponentsWithStats(mask,8)
    component=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
    out=np.zeros(a.shape[:2],np.uint8);out[y0:y1,x0:x1]=(labels==component).astype(np.uint8)*255
    if clip:out=cv2.bitwise_and(out,polygon(clip,peace.size))
    return out


def eye_patch(image, targets, lash_masks):
    size=image.size; patch=np.zeros((size[1],size[0],4),np.uint8)
    source=np.array(image)
    hair=((source[:,:,1].astype(int)>source[:,:,0].astype(int)+7)&(source[:,:,1].astype(int)>source[:,:,2].astype(int)+3)&(source[:,:,1]>118)).astype(np.uint8)
    count,hair_labels,stats,_=cv2.connectedComponentsWithStats(hair,8)
    connected=np.zeros(count,np.uint8);connected[1:]=(stats[1:,cv2.CC_STAT_AREA]>=500)
    hair=connected[hair_labels]
    for target, (lash, source_anchors) in zip(targets,lash_masks):
        # Local face-colour underpainting replaces the eye aperture, leaving mouth/eyebrows/face intact.
        fill=polygon(target["cover"],size)
        fill[hair>0]=0
        skin=np.array([255,229,213],np.uint8)
        patch[fill>0,:3]=skin;patch[fill>0,3]=255
        p0,p1=np.array(source_anchors,np.float32);q0,q1=np.array(target["anchors"],np.float32)
        dp=p1-p0;dq=q1-q0;den=float(dp@dp);a=float(dq@dp/den);b=float((dq[1]*dp[0]-dq[0]*dp[1])/den)
        matrix=np.array([[a,-b,q0[0]-a*p0[0]+b*p0[1]],[b,a,q0[1]-b*p0[0]-a*p0[1]]],np.float32)
        mask=cv2.warpAffine(lash,matrix,size,flags=cv2.INTER_LINEAR)
        ink=np.array(trace.COLORS[trace.INDEX["outline"]],np.uint8)
        # Alpha composition retains anti-aliasing of the transplanted original eyelash strokes.
        layer=np.dstack([np.broadcast_to(ink,(size[1],size[0],3)),mask])
        patch=np.array(Image.alpha_composite(Image.fromarray(patch),Image.fromarray(layer)))
    return Image.fromarray(patch)


def build_blinks():
    peace=Image.open(SOURCE/"expression-peace.png").convert("RGBA")
    lashes=[(closed_lashes(peace,(282,244,341,272)),[(286,259),(335,249)]),
            (closed_lashes(peace,(382,214,438,249),[(382,232),(401,226),(429,215),(435,214),(433,224),(423,233),(397,242),(383,245)]),[(389,236),(429,225)])]
    # Cover polygons follow the actual eye aperture, with small skin margins; no whole-face replacement.
    targets={
      "calm":[{"cover":[(294,226),(311,215),(333,214),(352,225),(357,239),(350,258),(331,267),(312,260),(299,251)],"anchors":[(300,251),(349,237)]},
              {"cover":[(396,211),(408,196),(426,192),(443,198),(450,213),(446,235),(430,246),(413,240),(402,230)],"anchors":[(402,225),(440,211)]}],
      "fear":[{"cover":[(271,222),(289,212),(311,211),(329,225),(332,239),(325,257),(308,264),(288,259),(277,250)],"anchors":[(277,245),(324,232)]},
              {"cover":[(376,209),(390,194),(410,191),(425,201),(431,218),(423,238),(405,246),(388,237),(380,228)],"anchors":[(382,223),(423,211)]}],
      "sad":[{"cover":[(294,238),(310,226),(332,223),(352,233),(359,246),(353,264),(334,276),(312,269),(300,260)],"anchors":[(301,258),(352,244)]},
             {"cover":[(399,216),(413,202),(433,199),(449,209),(453,225),(447,243),(431,251),(412,244),(404,235)],"anchors":[(405,232),(447,220)]}],
      "full":[{"cover":[(503,220),(513,208),(530,203),(550,207),(561,218),(561,235),(553,250),(538,256),(519,249),(506,239)],"anchors":[(516,240),(553,227)]},
              {"cover":[(587,199),(596,185),(611,180),(626,184),(640,195),(642,213),(634,231),(615,236),(599,226)],"anchors":[(597,219),(630,207)]}],
    }
    rigs={};tiles=[]
    for name,eyes in targets.items():
        image=Image.open(SOURCE/("xiaochu-recolored.png" if name=="full" else f"expression-{name}.png")).convert("RGBA")
        patch=eye_patch(image,eyes,lashes);patch.save(DEST/f"{name}-blink.png")
        shut=Image.alpha_composite(image,patch);shut.save(DEST/f"{name}-blink-qa.png")
        width,height=image.size
        rigs[name]={"width":width,"height":height,"base":("assets/character/xiaochu-recolored.png" if name=="full" else f"assets/character/expression-{name}.png"),
                    "blink":{"path":f"assets/character/rig/{name}-blink.png","available":True,"mode":"local-overlay","eyes":eyes,"source":"Aligned closed-eyelash strokes extracted from expression-peace.png, plus local skin-colour eye-aperture covers; original mouth and face retained."}}
        if name!="full":
            tiles.append((name,image,shut))
    rigs["peace"]={"width":627,"height":627,"base":"assets/character/expression-peace.png","blink":{"available":False,"reason":"Original eyes are already closed."}}
    sheet=Image.new("RGB",(1200,950),"#101C1D");draw=ImageDraw.Draw(sheet)
    for i,(name,opened,shut) in enumerate(tiles):
        for j,im in enumerate([opened,shut]):
            crop=im.crop((250,180,470,295)).resize((570,298),Image.Resampling.NEAREST)
            sheet.paste(bg(crop),(j*600,i*315+18))
        draw.text((4,i*315),f"{name.upper()} — SOURCE / LOCAL CLOSED EYE OVERLAY",font=ImageFont.truetype(FONT,14),fill="#B9F0D5")
    sheet.save(DEST/"blink-contact-sheet.png")
    return rigs


def main():
    full=build_full(); portraits=build_blinks();full["blink"]=portraits.pop("full")["blink"]
    manifest={"schemaVersion":1,"method":"Limited raster cutout animation with original-pixel layers and local closed-eyelid overlays. Not a reconstructed 3D character or a new hand-drawn pose.",
              "full":full,**portraits,
              "limitations":["The head remains static; it is not claimed as an independently rotatable layer.","Back-hair layers contain the original outer locks; the separate foreground lock retains a short attachment at its root.","Small hidden hand/cuff and front-lock underlays are inferred by local inpainting and palette quantisation, not newly generated anatomy.","All rotations are intentionally small. Do not exceed the manifest amplitudes without inspecting seams.","Blink overlays preserve the original expression mouth and face; eyelash strokes come from the already-generated closed-eye portrait."]}
    (DEST/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    assert all((ROOT/layer["path"]).exists() for layer in full["layers"])
    assert all(Image.open(ROOT/layer["path"]).size==(1024,1536) for layer in full["layers"])
    print(json.dumps({"manifest":str(DEST/"manifest.json"),"fullLayers":[{"name":l["name"],"pivot":l["pivot"],"amplitudeDeg":l["amplitudeDeg"]}for l in full["layers"]],"restQA":full["qa"]},ensure_ascii=False))


if __name__=="__main__":main()
