"""Rebuild the editorial shot table from the selected audio's real 20 Hz features."""
import argparse
from collections import Counter
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MIN_SHOT, MAX_SHOT = 4., 9.5
MODES = {
    1: ['world','wide','hand','portrait'],
    2: ['hand','portrait','world','eye'],
    3: ['world','portrait','hand','eye'],
    4: ['abstract','hand','portrait','eye','abstract'],
    5: ['world','eye','portrait'],
    6: ['world','wide','portrait','world','eye','wide','abstract','portrait'],
    7: ['portrait','hand','eye','portrait'],
    8: ['portrait','abstract','eye','portrait'],
    9: ['world','portrait','eye','abstract','wide','eye','portrait'],
    10:['hand','portrait','abstract','world'],
    11:['world'],
}
MODE_ZH = {'world':'环境','wide':'全景','portrait':'人物中近景','eye':'眼部','hand':'手与终端','abstract':'抽象图形'}
INTENT = {
    1:['建立末日观测站','小初在终端前观察','输入与记录','确认观测者的平静目光'],
    2:['空返回与重试','发现异常','终端淹没空间','目光停顿'],
    3:['城市温度异常','恐惧开始显露','查看温度阈值','异常映入眼中'],
    4:['递归错误','删除指令','删除无效','无法移开视线','循环再次闭合'],
    5:['黑星占据视野','观测者的反应','承认无法观测'],
    6:['城市开始倾倒','人物与废墟的尺度','恐惧表情','继续失联的城市','目击崩塌','身处灾变','信号破碎','目光回到自身'],
    7:['回看小初','记忆中的小花','眼中的记录','从悲伤转向释然'],
    8:['临界时刻的面部反应','失控的核心','恐惧的目光','从惊惧转向决意'],
    9:['空间出现错误','追踪尚存信号','锁定目标','错误场穿越','人物试图抵达','再次确认目标','留下最后的决意'],
    10:['提交记忆档案','最后的目光','信号脱离观测者','只保留远去的传输'],
    11:['观测站暗去，回应未知'],
}


def plan_interval(start, end, count, candidates, scores, period, phase):
    """Dynamic programming selects real onset peaks with bounded, nonuniform holds."""
    inside = (candidates > start+1e-7) & (candidates < end-1e-7)
    times = np.r_[start,candidates[inside],end]
    reward = np.r_[0.,scores[inside],0.]
    target = (end-start)/count
    dp = np.full((count+1,len(times)),-np.inf)
    prior = np.full(dp.shape,-1,dtype=int)
    dp[0,0] = 0
    for step in range(1,count+1):
        for j in range(1,len(times)):
            if (step == count) != (j == len(times)-1):
                continue
            gaps = times[j]-times[:j]
            valid = (gaps >= MIN_SHOT-1e-7) & (gaps <= MAX_SHOT+1e-7)
            options = dp[step-1,:j] - .06*((gaps-target)/max(target,.01))**2
            options[~valid] = -np.inf
            k = int(np.argmax(options))
            if np.isfinite(options[k]):
                # A weak, unverified candidate-grid preference cannot replace measured peaks.
                distance = abs(((times[j]-phase+period/2)%period)-period/2)
                grid_bonus = .025*(1-distance/(period/2)) if j < len(times)-1 else 0
                dp[step,j] = options[k]+reward[j]+grid_bonus
                prior[step,j] = k
    if not np.isfinite(dp[count,-1]):
        raise ValueError(f'No {count}-shot onset plan for {start}–{end}; adjust count or hold bounds.')
    indices, j = [len(times)-1], len(times)-1
    for step in range(count,0,-1):
        j = int(prior[step,j]); indices.append(j)
    return times[indices[::-1]].round(6).tolist()


def robust_scale(values):
    ceiling = float(np.percentile(values,95))
    return np.clip(values/max(ceiling,1e-9),0,1)


def strong_loop_onsets(features):
    strengths = np.asarray(features['onsets'])
    detected = np.asarray(features['onsetTimes'])
    indices = np.rint(detected*features['featureRate']).astype(int)
    threshold = float(np.percentile(strengths[indices],65))
    return detected[strengths[indices]>=threshold].round(6).tolist(), threshold


def build(features, cues):
    rate = features['featureRate']
    times = np.asarray(features['times'])
    signals = {key:np.asarray(features[key]) for key in ('envelope','low','high','onsets')}
    onset = signals['onsets']
    peaks = np.array([i for i in range(1,len(onset)-1) if onset[i] >= .35 and onset[i] > onset[i-1] and onset[i] >= onset[i+1]])
    candidate_times = times[peaks]
    components = {'onsets':onset[peaks]}
    components['prominence'] = np.array([max(0,onset[i]-np.median(onset[max(0,i-15):i+16])) for i in peaks])
    half = round(rate*.6)
    for key in ('low','high','envelope'):
        values = signals[key]
        components[key+'-change'] = np.array([abs(np.mean(values[i:min(len(values),i+half)])-
            np.mean(values[max(0,i-half):i])) for i in peaks])
    components = {key:robust_scale(values) for key,values in components.items()}
    scores = (.38*components['onsets']+.20*components['prominence']+.17*components['low-change']+
              .17*components['high-change']+.08*components['envelope-change'])
    bpm = float(cues.get('bpmCandidate',92.285))
    period = 60/bpm
    phases = np.arange(0,period,1/rate)
    phase = float(phases[np.argmax([np.interp(np.arange(p,times[-1],period),times,onset).sum() for p in phases])])
    selected, duration = [], float(cues['duration'])
    for index, scene in enumerate(cues['scenes']):
        start, end = float(scene['start']), float(cues['scenes'][index+1]['start']) if index+1<len(cues['scenes']) else duration
        scene_id, modes = scene['id'], MODES[scene['id']]
        if scene_id == 10:
            # Narrative lock: once the last half begins, never cut back to the character.
            split = round(start+(end-start)*.5,6)
            edges = plan_interval(start,split,2,candidate_times,scores,period,phase)[:-1]
            edges += plan_interval(split,end,2,candidate_times,scores,period,phase)
        else:
            edges = plan_interval(start,end,len(modes),candidate_times,scores,period,phase)
        for local, mode in enumerate(modes):
            a,b = edges[local:local+2]
            frame = int(np.argmin(abs(times-a)))
            candidate = int(np.argmin(abs(candidate_times-a)))
            real_peak = abs(candidate_times[candidate]-a) < .00001
            fixed = abs(a-start)<.00001 or (scene_id==10 and abs(a-split)<.00001)
            dominant = max((key for key in components if key!='prominence'), key=lambda key:components[key][candidate])
            window = (times>=a)&(times<b)
            source = {'kind':'scene-boundary' if abs(a-start)<.00001 else ('transmission-narrative-lock' if fixed else 'detected-onset-peak'),
                      'featureFrame':frame,'onsetStrength':round(float(onset[frame]),5),
                      'salience':round(float(scores[candidate]),5) if real_peak and not fixed else None,
                      'gridVerified':False,'vocalAligned':False}
            if real_peak and not fixed:
                source['measuredPeakTime'] = float(candidate_times[candidate])
                source['normalizedComponents'] = {key:round(float(value[candidate]),5) for key,value in components.items()}
            expression = 'calm' if scene_id<=2 else ('sad' if scene_id==7 else ('peace' if scene_id==10 else 'fear'))
            if scene_id==7 and local==len(modes)-1:
                expression = 'peace'
            selected.append({'id':len(selected)+1,'start':a,'end':b,'scene':scene_id,
                'variant':{'wide':0,'world':0,'portrait':1,'eye':2,'hand':2,'abstract':0}[mode],
                'mode':mode,'expression':expression,'intent':INTENT[scene_id][local],
                'energy':round(float(np.mean(signals['envelope'][window])),5),
                'dominantFeature':dominant if not fixed else 'narrative-boundary',
                'sourceConfidence':'fixed-narrative-boundary' if fixed else 'audio-feature-candidate',
                'source':source})
    assert selected[0]['start']==0 and selected[-1]['end']==duration
    assert all(a['end']==b['start'] for a,b in zip(selected,selected[1:]))
    assert all(MIN_SHOT-1e-6 <= s['end']-s['start'] <= MAX_SHOT+1e-6 for s in selected)
    assert 45<=len(selected)<=60
    assert all(s['mode'] in ('abstract','world') for s in selected if s['scene']==10 and s['start']>=229)
    assert all(any(s['mode'] in ('portrait','eye') for s in selected if s['scene']==chapter) for chapter in (8,9))
    loop_onsets, loop_threshold = strong_loop_onsets(features)
    return {'schemaVersion':1,'duration':duration,'sourceAudio':'assets/audio/song.m4a',
        'sourceAudioSha256':features['sourceSha256'],'featureSource':'data/audio_features.json',
        'timingStatus':'audio-derived-editorial-candidates-not-manually-vocal-or-bar-aligned',
        'method':{'featureRateHz':rate,'measuredOnsetCandidates':len(peaks),
            'salienceWeights':{'onsets':.38,'prominence':.20,'low-change':.17,'high-change':.17,'envelope-change':.08},
            'energyChangeHalfWindowSeconds':.6,'selection':'Dynamic programming over actual onset peaks; bounded holds with a weak duration prior.',
            'minimumShotSeconds':MIN_SHOT,'maximumShotSeconds':MAX_SHOT,
            'candidateBpm':bpm,'candidatePhaseSeconds':phase,'bpmVerified':False,'gridPreferenceMaxScore':.025,
            'loopOnsets':{'thresholdPercentile':65,'thresholdPopulation':'Strengths at all detected onsetTimes only; not all sampled feature frames.',
                'populationCount':len(features['onsetTimes']),'thresholdStrength':round(loop_threshold,8),
                'selectedCount':len(loop_onsets),'indexRule':'round(time × featureRateHz)',
                'purpose':'DELETE/RETRY loop switches advance at strong measured onsets instead of a fixed frequency.',
                'verified':False},
            'transmissionLockSeconds':229.,'fixedSceneStarts':[s['start'] for s in cues['scenes']]},
        'loopOnsets':loop_onsets,
        'summary':{'shots':len(selected),'audioPeakCuts':sum(s['sourceConfidence']=='audio-feature-candidate' for s in selected),
            'fixedNarrativeStarts':sum(s['sourceConfidence']=='fixed-narrative-boundary' for s in selected),
            'modeCounts':dict(Counter(s['mode'] for s in selected))},'shots':selected}


def write_docs(plan,path):
    shots = plan['shots']
    rows = ['| 镜头 | 章 | 起止秒 | 时长 | 景别 / 模式 | 事件 | 切入依据 |','|---|---|---|---|---|---|---|']
    for shot in shots:
        confidence = '固定叙事边界' if shot['sourceConfidence']=='fixed-narrative-boundary' else '真实起音峰候选'
        rows.append(f"| {shot['id']:02} | {shot['scene']:02} | {shot['start']:.3f}–{shot['end']:.3f} | {shot['end']-shot['start']:.3f} | {MODE_ZH[shot['mode']]} | {shot['intent']} | {confidence} |")
    text = f'''# 音频特征镜头计划

本表由 `python tools/refine_shots.py` 从选定的真实音轨特征重新生成，保存到 `data/shots.json`。保持 11 章原始起点与歌曲零点，覆盖 0–{plan['duration']:.6f} 秒，全片 {len(shots)} 镜，无空隙或重叠。镜头不再按 6.2 秒等间隔安排。

切入候选来自 20 Hz 数据中的真实谱起音峰。评分由起音强度 38%、局部突出度 20%、前后各 0.6 秒的低频变化 17%、高频变化 17%、包络变化 8% 组成，各项按 95 分位归一化。动态规划在每镜 4–9.5 秒的范围内选择有足够变化的候选，并加入很弱的时长偏好。本次共有 {plan['method']['measuredOnsetCandidates']} 个原始起音峰候选，最终 {plan['summary']['audioPeakCuts']} 个章内切入使用测得的起音峰；其余 {plan['summary']['fixedNarrativeStarts']} 个为章节或传输叙事边界。

约 {plan['method']['candidateBpm']:.3f} BPM 的拍网仅给最多 0.025 分的弱偏好；相位从同一音轨起音强度拟合。BPM、相位、小节首拍及乐句均未人工确认。这里的“起音”可能属于鼓、乐器或混合声，不代表已识别人声、歌词或音节。20 Hz 测量间隔为 50 ms，选定切点仍须在试听中校准。

模式接口为 `world`（环境）、`wide`（全景）、`portrait`（人物中近景）、`eye`（眼部）、`hand`（手与终端）、`abstract`（抽象图形）；它们是交给渲染器的构图意图。08、09 章都安排人物近景和眼部，避免只用居中全身。01–03 章围绕观测站、终端与小初的观察反应推进。最后信息章在 229 秒锁定为传输，之后只保留抽象信号与环境，不再切回角色。

`energy` 是该镜头内归一化 RMS 包络均值；`dominantFeature` 指切点附近最突出的标准化特征，不表示音源分类。`sourceConfidence` 区分真实起音候选与固定叙事边界；每个候选附有测量帧、起音强度、评分及未验证标记。固定章界不假装精确落在起音峰上。

`loopOnsets` 单独从全部检测峰的强度总体中取第 65 分位阈值，再保留达到阈值的实际检测时间，用于 DELETE / RETRY 的事件计数切换。这里的总体是检测峰，不是所有 20 Hz 采样帧；具体阈值和数量保存在 JSON 的 `method.loopOnsets`。这些事件同样没有人声或人工拍点验证。

本计划没有补造歌曲全文或人声时间轴，也不能替代实际渲染后的构图、裁切及闪烁检查。已有第一版粗剪的 QA 不自动证明这份新镜头计划的成片通过。

'''+ '\n'.join(rows)+'\n'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf8')


def self_test():
    candidates = np.array([4.,5.,6.,10.,11.,15.,16.])
    scores = np.array([1.,.1,.1,2.,.1,1.,.1])
    plan = plan_interval(0,20,4,candidates,scores,.65,0)
    assert plan == [0.,4.,10.,15.,20.], plan
    assert all(4<=b-a<=9.5 for a,b in zip(plan,plan[1:]))
    strong, threshold = strong_loop_onsets({'onsets':[0,.1,.9,.2,.8,0],'onsetTimes':[1,2,3,4],'featureRate':1})
    assert strong == [2.,4.] and .2 < threshold < .9, (strong,threshold)
    print('Shot planning self-test passed: strong peaks chosen, nonuniform holds, exact interval coverage.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'data/shots.json')
    parser.add_argument('--docs',type=Path,default=ROOT/'docs/SHOTS.md')
    parser.add_argument('--self-test',action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test(); return
    features = json.loads((ROOT/'data/audio_features.json').read_text(encoding='utf8'))
    cues = json.loads((ROOT/'data/cues.json').read_text(encoding='utf-8-sig'))
    plan = build(features,cues)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
    write_docs(plan,args.docs)
    print(json.dumps(plan['summary'],ensure_ascii=False))
    print('starts:',','.join(str(s['start']) for s in plan['shots']))


if __name__ == '__main__':
    main()
