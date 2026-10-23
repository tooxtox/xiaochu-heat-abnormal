"""Locally trace/recolour the generated eyes and hand with the existing character pipeline."""
import hashlib
import json
import sys

sys.dont_write_bytecode = True
from trace_character import DEST, INDEX, PALETTE, Image, np, separate, write_svg, compare


def main():
    records = {}
    for name in ('eyes','hand'):
        source = DEST/f'{name}-original.png'
        original = Image.open(source).convert('RGBA')
        recolored, lineart, labels, alpha = separate(original)
        recolored.save(DEST/f'{name}-recolored.png')
        lineart.save(DEST/f'{name}-lineart.png')
        write_svg(DEST/f'{name}-traced.svg',labels,alpha)
        compare(original,lineart,recolored,f'{name}-compare.png',height=360)
        opaque = alpha>127
        if name == 'eyes':
            assert (alpha==255).all(), 'Opaque macro must remain completely opaque.'
            middle = alpha.shape[1]//2
            for left,right in ((0,middle),(middle,alpha.shape[1])):
                assert np.count_nonzero((labels[:,left:right]==INDEX['pink'])&opaque[:,left:right])>1000
        else:
            assert (alpha==0).any() and (alpha==255).any(), 'Hand cutout must retain both transparent and opaque pixels.'
            assert np.count_nonzero((labels==INDEX['mint'])&opaque)>100
            assert np.count_nonzero((labels==INDEX['skin'])&opaque)>1000
        records[name] = {
            'source':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'size':list(original.size),'alphaBbox':list(recolored.getbbox()),
            'sourceAlphaMin':int(np.array(original.getchannel('A')).min()),
            'sourceAlphaMax':int(np.array(original.getchannel('A')).max()),
            'outputAlphaMin':int(alpha.min()),'outputAlphaMax':int(alpha.max()),
            'opaquePixelFraction':round(float(np.mean(alpha==255)),6),
            'transparentPixelFraction':round(float(np.mean(alpha==0)),6),
            'outputs':[f'{name}-recolored.png',f'{name}-lineart.png',f'{name}-traced.svg',f'{name}-compare.png'],
            'promptRecord':'Normalized summary in docs/PROMPTS.md, not a verbatim prompt transcript.',
            'visualReview':('Both pink eyes and mint fringe retained; full-frame opaque macro.' if name=='eyes' else
                'One upturned hand, five visible fingers, ivory lace cuff and mint bows; forearm enters from lower right.'),
        }
    info = {'schemaVersion':1,'generator':'Built-in image_gen.imagegen',
        'localProcessing':'Existing trace_character.separate/write_svg/compare functions; semantic colour regions, source ink preservation and automatic local contours.',
        'alphaPolicy':'Same 224–251 alpha remap and largest-component foreground cleanup. Original opaque eyes stay alpha=255 throughout; hand glow is removed.',
        'palette':PALETTE,'assets':records,
        'limitations':'Generated fixed-pose details, not articulated fingers, eyelids or a replacement full character rig. Automatic tracing can simplify fine lace and thin lines.'}
    (DEST/'trace-details.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(records,ensure_ascii=False))


if __name__=='__main__':
    main()
