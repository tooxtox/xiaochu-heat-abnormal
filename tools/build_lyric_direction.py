"""Build scene art from the user's pasted bilingual text and independently checked line times."""
from pathlib import Path
import argparse, bisect, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8-sig'))
def write(name,data): (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offset',type=float,required=True)
    args=parser.parse_args()
    pairs=[row.split('\t',1) for row in (ROOT/'data/lyrics_user_supplied.tsv').read_text(encoding='utf-8').splitlines() if row.strip()]
    evidence=read('data/lyric_timing_source.json')
    matches=evidence['matches']
    assert len(pairs)==len(matches)==126
    duration=read('config.json')['duration']
    starts=[round(m['sourceTime']+args.offset,6) for m in matches]
    assert all(b>a for a,b in zip(starts,starts[1:]))
    # Ends without another nearby sung line are bounded explicitly. These are editorial
    # holds, not forced-aligned phoneme/word ends; they are reported as such.
    hold_ends={66:90.215,91:134.593,126:231.690}
    lines=[]
    for i,((jp,cn),start) in enumerate(zip(pairs,starts),1):
        end=hold_ends.get(i,starts[i] if i<len(starts) else duration-4)
        lines.append({'id':f'L{i:03d}','time':start,'end':round(end,6),'text':jp,'translation':cn,
                      'words':[],'wordTiming':'not-provided','translationWordTiming':'not-applicable',
                      'timing':'external-cover-lrc-audio-offset-verified',
                      'endTiming':'source-caption-clear-reference-not-vocal-end' if i in hold_ends else 'next-line-start'})
    write('data/lyrics.json',{'schemaVersion':2,'sourceType':'user-pasted-bilingual-text',
        'sourceNote':'126 Japanese lines and Chinese translations pasted directly by the user on 2026-10-23. Text retained including supplied spellings.',
        'timingSource':'https://music.163.com/api/song/lyric/v1?id=2702706957&lv=-1&kv=-1&tv=-1&yv=-1',
        'offsetSeconds':args.offset,'timingNote':'日文行级时间经同版音频偏移校准；入字为图形动画，未声明逐字演唱对齐。',
        'wordAlignmentVerified':False,'lines':lines})

    def at(n): return starts[n-1]
    groups=[
      (0,1,'INIT','NORMAL'),(at(1),2,'DEAD VARIABLES','OBSERVE'),
      (at(5),3,'FEAR / VASCULAR CURRENT','WARNING'),(at(9),4,'ERASE / PERSIST','WARNING'),
      (at(18),6,'BROKEN VOICE / CRESCENT','WARNING'),(at(23),9,'APPROACH I','CORRUPTED'),
      (at(32),6,'BURNING SALVATION','WARNING'),(at(37),4,'WHISPER / ANOMALY','WARNING'),
      (at(46),6,'UTOPIA / SHIPWRECK','WARNING'),(at(50),5,'BLACK STAR I','VOID'),
      (at(59),9,'FLASH / FAREWELL','CORRUPTED'),(at(61),6,'HISTORY INTO SAND','WARNING'),
      (at(63),2,'RETURN / DEAD VARIABLES','OBSERVE'),(at(65),5,'EYES / DISTANT STAR','VOID'),
      (hold_ends[66],7,'INTERLUDE / SMALL MEMORY','MEMORY'),
      (at(67),6,'GRIEF / CRYSTALLISATION','WARNING'),(at(69),2,'VALUATION / PRAYER','OBSERVE'),
      (at(71),4,'TURN AWAY / HEAR','WARNING'),(at(79),6,'SELF CONSCIOUS OCEAN','WARNING'),
      (at(83),5,'BLACK STAR II','VOID'),(hold_ends[91],10,'INTERLUDE / SIGNAL STUDY','NORMAL'),
      (at(92),2,'RECURSION / RETURN','OBSERVE'),(at(96),6,'CELLS / RETURN TO SEA','WARNING'),
      (at(98),7,'SWALLOW / GREY CLOUD','MEMORY'),(at(100),6,'BORROWED HONOUR','WARNING'),
      (at(102),7,'YOUR CLEAR EYES','MEMORY'),(at(104),7,'HANDS / IMPOSSIBLE DREAM','MEMORY'),
      (at(106),8,'CORE / HEAT ABNORMAL','CRITICAL'),(at(108),9,'REALITY / REFUSAL','CORRUPTED'),
      (at(113),6,'BROKEN VOICE / REPRISE','WARNING'),(at(118),9,'APPROACH II','CORRUPTED'),
      (at(126),5,'ARRIVAL / BLACK STAR','VOID'),(hold_ends[126],10,'THE LAST MESSAGE','NORMAL'),
      (238,11,'SHUTDOWN','SILENCE')]
    colors={1:'#9DE4C2',2:'#9DE4C2',3:'#ED8B50',4:'#ED8B50',5:'#C8CCD1',6:'#ED8B50',7:'#E9ACC8',8:'#D93B4A',9:'#D93B4A',10:'#9DE4C2',11:'#C8CCD1'}
    old_cues=read('data/cues.json')
    old_shots=read('data/shots.json')
    scenes=[{'id':sid,'segment':i+1,'start':round(time,6),'label':label,'state':state,'color':colors[sid],
             'timing':'lyric-line-semantic-edit' if time in starts else 'editorial-interlude-boundary'} for i,(time,sid,label,state) in enumerate(groups)]
    def scene_for(t):return scenes[max(0,bisect.bisect_right([s['start'] for s in scenes],t)-1)]

    # Cut at meaningful phrase changes, not at every fast repetition. Fill the two
    # instrumental passages with held eye/hand/world shots evaluated from song time.
    preferred={1:'portrait',2:'wide',3:'hand',4:'portrait',5:'eye',7:'world',9:'abstract',
      18:'portrait',20:'world',23:'abstract',27:'portrait',32:'world',34:'hand',37:'portrait',
      41:'abstract',46:'world',48:'wide',50:'world',54:'portrait',58:'eye',59:'eye',60:'world',
      61:'world',63:'portrait',65:'eye',66:'world',67:'portrait',69:'abstract',71:'portrait',
      75:'abstract',79:'world',81:'wide',83:'world',87:'portrait',91:'eye',92:'portrait',93:'wide',
      94:'hand',95:'portrait',96:'world',98:'wide',100:'world',102:'eye',104:'hand',106:'abstract',
      108:'abstract',110:'portrait',113:'portrait',115:'world',118:'abstract',122:'portrait',126:'world'}
    cuts={0:'wide',238:'world'}
    for n,mode in preferred.items():cuts[at(n)]=mode
    for time,sid,_,_ in groups:
        cuts.setdefault(time,{1:'wide',2:'portrait',3:'eye',4:'abstract',5:'world',6:'world',7:'wide',8:'abstract',9:'abstract',10:'world',11:'world'}[sid])
    for a,b,modes in [(hold_ends[66],at(67),['hand','portrait','eye']),
                      (hold_ends[91],at(92),['portrait','world','hand','portrait'])]:
        for k,mode in enumerate(modes,1):cuts[a+(b-a)*k/(len(modes)+1)]=mode
    # Very close cuts are consolidated, while exact semantic scene changes stay.
    scene_times={round(g[0],6) for g in groups};ordered=[]
    for t,mode in sorted(cuts.items()):
        if ordered and t-ordered[-1][0]<1.7 and round(t,6) not in scene_times:continue
        if ordered and t-ordered[-1][0]<1.3 and round(ordered[-1][0],6) not in scene_times:ordered.pop()
        ordered.append((round(t,6),mode))
    shots=[]
    for i,(start,mode) in enumerate(ordered,1):
        end=ordered[i][0] if i<len(ordered) else duration
        s=scene_for(start+.00001)
        expression='sad' if s['id']==7 else 'fear' if s['id'] in [3,4,5,6,8,9] else 'calm'
        shots.append({'id':i,'scene':s['id'],'segment':s['segment'],'start':start,'end':end,'mode':mode,
          'variant':i%2,'expression':expression,'intent':s['label'],'timing':'semantic-phrase-edit',
          'duration':round(end-start,6)})
    # Existing character effect algorithms are retained and now follow meaning.
    fx=[]
    for sh in shots:
        sid=sh['scene'];mode={1:'fade',2:'mono',3:'ghost',4:'blueprint',5:'defocus',6:'print',7:'memory',8:'thermal',9:'ghost',10:'fade',11:'fade'}[sid]
        if sid==9 and sh['mode']=='abstract':mode='thermal'
        fx.append({'start':sh['start'],'end':sh['end'],'mode':mode,'intensity':.72 if sid in [1,7,10] else .9,
          'intent':sh['intent'],'scope':'character-only','timing':'lyric-semantic-shot'})
    old_cues.update({'timingStatus':'lyric-line-semantic-edit-with-audio-verified-cover-offset','scenes':scenes,
      'events':[],'characterFx':fx})
    write('data/cues.json',old_cues)
    old_shots.update({'timingStatus':'126-lyric-lines-audio-offset-calibrated; graphic-word-entrances-not-vocal-aligned',
      'shots':shots,'method':{**old_shots.get('method',{}),'fixedSceneStarts':[s['start'] for s in scenes],
      'selection':'Lyric semantics with phrase cuts and held instrumental shots; no per-repetition camera flashing.',
      'minimumShotSeconds':min(s['duration'] for s in shots),'maximumShotSeconds':max(s['duration'] for s in shots),
      'lyricOffsetSeconds':args.offset}})
    write('data/shots.json',old_shots)

    repeats=[(9,16,'erase'),(23,30,'approach'),(37,44,'whisper'),(50,57,'star'),(71,77,'turn'),(83,90,'star'),(118,125,'approach')]
    def repetition(n):
        for a,b,kind in repeats:
            if a<=n<=b:return kind,n-a,b-a+1
        return None,0,0
    motifs={1:'recursion',2:'heat',3:'recursion',4:'recursion',5:'electric',6:'electric',7:'electric',8:'electric',
      17:'recursion',18:'bell-sand',19:'electric',20:'bell-sand',21:'blackstar-eye',31:'blackstar-eye',
      32:'salt-tear',33:'flag',34:'flag',35:'bell-sand',45:'electric',46:'ship',47:'ship',48:'ship',49:'ship',58:'blackstar-eye',
      59:'electric',60:'bell-sand',61:'bell-sand',62:'bell-sand',63:'recursion',64:'heat',65:'blackstar-eye',66:'blackstar-eye',
      67:'salt-tear',68:'salt-tear',69:'recursion',70:'recursion',78:'electric',79:'fish-ocean',80:'fish-ocean',81:'fish-ocean',82:'fish-ocean',91:'blackstar-eye',
      92:'recursion',93:'heat',94:'recursion',95:'recursion',96:'fish-ocean',97:'fish-ocean',98:'swallow',99:'swallow',100:'ship',101:'salt-tear',
      102:'blackstar-eye',103:'blackstar-eye',104:'swallow',105:'salt-tear',106:'heat',107:'heat',108:'heat',109:'heat',110:'heat',111:'heat',112:'electric',
      113:'bell-sand',114:'electric',115:'bell-sand',116:'blackstar-eye',117:'blackstar-eye',126:'blackstar-eye'}
    cues=[]
    for n,line in enumerate(lines,1):
        kind,k,total=repetition(n);sid=scene_for(line['time'])['id'];light=sid==7
        layout=['vertical','poster','bezier','ink-reveal'][(n-1)%4]
        anchor=[150,260];size=72;semantic={};translation_layout='ink-reveal';translation_anchor=[160,825];translation_size=27
        if layout=='vertical':size=72;translation_layout='vertical';translation_anchor=[525,290];translation_size=27
        if layout=='poster':anchor=[160,360];size=92;semantic={'columns':8,'rotation':-.045};translation_layout='vertical';translation_anchor=[830,275]
        if layout=='bezier':anchor=[130,680];size=54;semantic={'path':[[130,660],[700,810],[320,280],[860,350]]};translation_anchor=[150,840]
        if layout=='ink-reveal':anchor=[155,380];size=72;semantic={'width':730};translation_anchor=[170,720]
        motif=motifs.get(n)
        if kind:
            size=100;layout='poster';anchor=[150+(k%3)*65,330+(k%3)*105];semantic={'columns':8,'rotation':(-.06 if k%2 else .04)}
            translation_layout='ink-reveal';translation_anchor=[180+(k%3)*65,anchor[1]+130];translation_size=29
            motif={'erase':'recursion','approach':'blackstar-eye','whisper':'electric','star':'blackstar-eye','turn':'electric'}[kind]
            if kind=='star':layout='orbital';anchor=[1100,310];size=66;semantic={'radius':310+k*8,'sweep':1.65,'side':'lower'};translation_anchor=[190,410];translation_size=36
            if kind=='whisper':layout='split-columns';anchor=[160,350];size=86;semantic={'width':680};translation_anchor=[185,690]
        elif n in [8,33,49,62,68,78,82,96,99]:
            layout='road';anchor=[165,300];size=76;semantic={'width':800};translation_layout='road';translation_anchor=[240,425];translation_size=30
        elif n in [58,65,91,102]:
            layout='vertical';anchor=[125,260];size=62;semantic={'rows':9};translation_layout='vertical';translation_anchor=[420,265];translation_size=26
        elif n in [66,103,104,105]:
            layout='bezier';anchor=[140,710];size=55;semantic={'path':[[140,730],[410,350],[680,340],[1100,500]]};translation_layout='ink-reveal';translation_anchor=[145,845];translation_size=27
        elif n in [107,108,109,110,111,112]:
            layout='poster';anchor=[130,340];size=105;semantic={'columns':8,'rotation':-.065};translation_layout='vertical';translation_anchor=[1000,250];translation_size=28
        if motif:semantic.update({'motif':motif,'motifPlane':'both' if n in [49,68,98,107] else 'back'})
        # Keep eye-shot typography on the outer cheek margins.
        sh=next(s for s in shots if s['start']<=line['time']<s['end'])
        if sh['mode']=='eye':
            layout='vertical';anchor=[105,235];size=58;semantic.update({'rows':9});translation_layout='vertical';translation_anchor=[1670,240];translation_size=27
        life=line['end']-line['time'];enter=min(.38,life*.22);exit=min(.22,life*.18)
        main={'id':f'{line["id"]}-main','lineId':line['id'],'layout':layout,'plane':'front',
          'anchor':anchor,'size':size,'safeArea':[100,150,850,720],'font':'serif','colorRole':'teal' if light or sh['mode']=='eye' else 'paper','opacity':.96,
          'enter':{'type':'slam' if kind or n in [107,108] else 'rise','duration':max(.08,enter)},
          'exit':{'type':'rise','duration':max(.08,exit)},'hardCut':bool(kind or life<1.15),'semantic':semantic}
        cues.append(main)
        cues.append({'id':f'{line["id"]}-translation','lineId':line['id'],'field':'translation','layout':translation_layout,'plane':'front',
          'anchor':translation_anchor,'size':translation_size,'font':'cn','colorRole':'teal' if light or sh['mode']=='eye' else 'mint','opacity':.92,
          'safeArea':[90,145,780,700],'enter':{'duration':max(.08,enter*.8)},'exit':{'duration':max(.08,exit)},'hardCut':bool(kind or life<1.15),
          'semantic':{'width':720,'rows':9} if translation_layout!='road' else {}})
    echoes={1:'変数',5:'電撃',33:'救い',46:'未来',59:'閃光',63:'変数',79:'幸福',92:'変数',98:'燕',104:'手',107:'熱異常',109:'現実'}
    for n,word in echoes.items():
        line=lines[n-1];position=line['text'].index(word);life=line['end']-line['time']
        cues.append({'id':f'{line["id"]}-echo','lineId':line['id'],'tokenRange':[position,position+len(word)],
          'start':round(line['time']+life*.60,6),'end':line['end'],'layout':'poster','plane':'back','anchor':[980,590],
          'size':190,'font':'serif','colorRole':'teal' if scene_for(line['time'])['id']==7 else 'paper','opacity':.13,
          'safeArea':[80,120,600,650],'enter':{'type':'rise','duration':.16},'exit':{'duration':.12},
          'semantic':{'decorative':True,'columns':max(2,len(word)),'rotation':-.035}})
    write('data/lyric_direction.json',{'schemaVersion':1,'revision':'v5-scene-typography','textSource':'user-pasted-bilingual-text',
      'timingPolicy':'Line starts use exact-cover public LRC plus measured audio offset. Entrances are graphic choreography, not sung-word alignment.',
      'layouts':['vertical','orbital','road','poster','split-columns','bezier','ink-reveal'],
      'semanticMotifs':['recursion','electric','flag','ship','bell-sand','salt-tear','fish-ocean','swallow','heat','blackstar-eye'],
      'lyricTextSha256':hashlib.sha256((ROOT/'data/lyrics_user_supplied.tsv').read_bytes()).hexdigest(),'cues':cues})
    config=read('config.json');config['revision']='v5-scene-typography';write('config.json',config)
    report={'lines':len(lines),'translations':len(lines),'directionCues':len(cues),'sceneSegments':len(scenes),'shots':len(shots),
      'offsetSeconds':args.offset,'wordAlignmentVerified':False,'editorialLineEnds':hold_ends,
      'minimumShotSeconds':min(s['duration'] for s in shots),'maximumShotSeconds':max(s['duration'] for s in shots)}
    (ROOT/'work').mkdir(exist_ok=True)
    write('work/lyric-direction-build.json',report);print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
