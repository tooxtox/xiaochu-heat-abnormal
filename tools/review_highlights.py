"""Build review sheets from a finished encoded highlight and its adjacent QA mapping.

Uses the existing OpenCV/Pillow dependencies. Generation is not visual approval:
after opening every sheet, explicitly use --mark-inspected to record that review.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from make_motion_review import project_path, sha256

OFFSETS = (.15,.75,1.5,2.75)


def samples_for(clips,fps):
    samples=[]
    for clip in clips:
        a,b=clip['outputStartSeconds'],clip['outputEndSeconds']
        if b<=a or any(offset>=b-a for offset in OFFSETS):
            raise ValueError('Every clip must include all requested sample offsets.')
        for offset in OFFSETS:
            frame=round((a+offset)*fps)
            actual=frame/fps
            if not a<=actual<b:
                raise ValueError('Sample frame falls outside its mapped clip.')
            samples.append({'clip':clip['index'],'offsetSeconds':offset,'frame':frame,
                'highlightTime':actual,'mappedSourceTime':clip['sourceStartSeconds']+actual-a})
    return samples


def self_test():
    clips=[{'index':i+1,'outputStartSeconds':i*3,'outputEndSeconds':(i+1)*3,
            'sourceStartSeconds':10+i*12} for i in range(11)]
    samples=samples_for(clips,60)
    assert len(samples)==44 and samples[0]['frame']==9 and samples[-1]['frame']==1965
    assert abs(samples[-1]['mappedSourceTime']-132.75)<1e-8
    try:
        samples_for([dict(clips[0],outputEndSeconds=2)],60)
    except ValueError:
        pass
    else:
        raise AssertionError('Too-short clip was accepted.')
    print('Review-sheet self-test passed:44 mapped samples,frame rounding,clip-boundary rejection. No media read.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',default='export/v5-lyric-highlights.mp4')
    parser.add_argument('--qa',help='Adjacent .qa.json by default; clip mapping is read here.')
    parser.add_argument('--prefix',help='Output page prefix; defaults to input stem plus -review.')
    parser.add_argument('--mark-inspected',action='store_true',help='Only after viewing all existing pages; checks their hashes before recording review.')
    parser.add_argument('--note',default='',help='Concrete observations from the completed page inspection.')
    parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.self_test:
        self_test();return
    source=project_path(args.input)
    qa_path=project_path(args.qa) if args.qa else source.with_suffix('.qa.json')
    qa=json.loads(qa_path.read_text(encoding='utf-8-sig'))
    if not qa.get('passed'):
        raise ValueError('Only a finished highlight with passed encoding QA can be reviewed.')
    if project_path(qa['output'])!=source:
        raise ValueError('Input differs from the movie named by the QA mapping.')
    digest=sha256(source)
    if qa.get('outputSha256') and digest!=qa['outputSha256']:
        raise ValueError('Highlight hash differs from its encoding QA report.')
    fps=float(qa['expected']['fps'])
    samples=samples_for(qa['clips'],fps)
    if args.mark_inspected:
        review=qa.get('visualReview',{})
        if review.get('highlightSha256')!=digest or len(review.get('samples',[]))!=len(samples):
            raise ValueError('Generate current decoded sample pages before marking inspection.')
        for page in review['pages']:
            if sha256(project_path(page['path']))!=page['sha256']:
                raise ValueError('Review page changed since sample generation.')
        review.update(status='inspected',inspectedAt=datetime.now(timezone.utc).isoformat(),
                      inspectedSamples=len(samples),note=args.note,
                      inspectionMethod='Agent viewed every listed decoded-frame contact sheet.')
        qa_path.write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({'status':'inspected','samples':len(samples),'pages':len(review['pages']),'qa':str(qa_path)}))
        return
    import cv2
    from PIL import Image,ImageDraw,ImageFont
    prefix=project_path(args.prefix) if args.prefix else source.with_name(source.stem+'-review')
    prefix.parent.mkdir(parents=True,exist_ok=True)
    font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',15)
    header_font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',19)
    cap=cv2.VideoCapture(str(source))
    if not cap.isOpened():
        raise ValueError('Cannot decode the finished highlight.')
    if abs(cap.get(cv2.CAP_PROP_FPS)-fps)>1e-6:
        raise ValueError('Decoded FPS differs from the QA mapping.')
    pages=[]
    try:
        for page_start in range(0,len(qa['clips']),4):
            count=min(4,len(qa['clips'])-page_start)
            sheet=Image.new('RGB',(1920,50+314*count),'#090C13');draw=ImageDraw.Draw(sheet)
            draw.text((15,14),f"{qa['revision'].upper()} / ACTUAL ENCODED FRAMES / PAGE {page_start//4+1}",font=header_font,fill='#9DE4C2')
            for row in range(count):
                for column in range(4):
                    sample=samples[(page_start+row)*4+column]
                    cap.set(cv2.CAP_PROP_POS_FRAMES,sample['frame'])
                    ok,pixels=cap.read()
                    actual=round(cap.get(cv2.CAP_PROP_POS_FRAMES))-1
                    if not ok or actual!=sample['frame']:
                        raise ValueError(f"Missing exact decoded frame {sample['frame']}; got {actual}.")
                    if pixels.shape[:2]!=(1080,1920):
                        raise ValueError('Highlight is not 1920×1080.')
                    image=Image.fromarray(cv2.cvtColor(pixels,cv2.COLOR_BGR2RGB)).resize((480,270),Image.Resampling.LANCZOS)
                    x,y=column*480,50+row*314
                    sheet.paste(image,(x,y))
                    draw.text((x+10,y+275),f"CLIP {sample['clip']:02} / +{sample['offsetSeconds']:.2f}s / FRAME {sample['frame']:04}",font=font,fill='#9DE4C2')
                    draw.text((x+10,y+295),f"HIGHLIGHT {sample['highlightTime']:.3f}s / SOURCE {sample['mappedSourceTime']:.3f}s",font=font,fill='#C8CCD1')
            output=prefix.with_name(prefix.name+f'-{page_start//4+1:02}.png')
            sheet.save(output)
            pages.append({'path':str(output),'sha256':sha256(output),'clips':count,'pictures':count*4})
    finally:
        cap.release()
    qa['visualReview']={'status':'samples-generated-awaiting-inspection',
        'generatedAt':datetime.now(timezone.utc).isoformat(),'highlightSha256':digest,
        'sampleCount':len(samples),'inspectedSamples':0,'offsetsSeconds':list(OFFSETS),
        'scope':f"{len(samples)} decoded frames from {len(qa['clips'])} encoded excerpts; not continuous watching or a full-song visual review. Does not independently establish vocal/lyric alignment.",
        'sampleMethod':'Seek exact highlight frame indices; read clip/source mapping from the encoding QA JSON.',
        'pages':pages,'samples':samples}
    qa_path.write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'status':qa['visualReview']['status'],'pictures':len(samples),'pages':pages,'qa':str(qa_path)}))


if __name__=='__main__':
    main()
