import {PerspectiveCamera} from '../node_modules/three/build/three.module.js';
import {skyDome,createBlackStar} from './v18_city_3d.mjs';
import {makeCityLayout} from './v19_city_layouts.mjs';
import {updateDistrictCamera} from './v19_city_camera.mjs';
import {cityDamageLevel} from './v26_city_damage.mjs';

const DISTRICTS = {
  5: 'freight', 6: 'alley', 7: 'freight', 9: 'canal', 10: 'plaza', 11: 'fracture',
  12: 'alley', 14: 'skyline', 16: 'plaza', 19: 'canal', 20: 'plaza', 23: 'canal',
  25: 'alley', 29: 'fracture', 30: 'freight', 31: 'alley', 32: 'plaza', 33: 'skyline',
};
const LOOKS = {
  freight: { horizon: '#925047', zenith: '#28202c', rim: '#f4ae78', star: [10,25,-106], radius: 8.8 },
  plaza: { horizon: '#943d4c', zenith: '#211525', rim: '#f39486', star: [2,24,-106], radius: 13.6 },
  alley: { horizon: '#6e3d4c', zenith: '#201726', rim: '#e69987', star: [-7,30,-115], radius: 8.3 },
  canal: { horizon: '#536577', zenith: '#1c2539', rim: '#d6a4a5', star: [9,17,-105], radius: 9.8 },
  skyline: { horizon: '#4f6b78', zenith: '#162535', rim: '#c6adb0', star: [11,26,-112], radius: 10.1 },
  fracture: { horizon: '#933145', zenith: '#2b1425', rim: '#ff8581', star: [-4,24,-100], radius: 11.9 },
};

const FINALE_DISTRICTS = {24: 'plaza', 26: 'skyline', 27: 'fracture'};

export const districtForCue = (cue, detail=true) =>
  (detail?FINALE_DISTRICTS[cue.segment]:null)??DISTRICTS[cue.segment]??'freight';

export function createV19CityRoom({detail=false,finishedWindows=false,damageGrades=false,structuralDamage=false,smoke=false}={}){
  const districts = new Map();
  const starCamera = new PerspectiveCamera();
  return ({t,shot,music,camera,sceneCue}) => {
    const cue=sceneCue??{id:shot.scene,segment:shot.segment};
    const variant=districtForCue(cue,detail);
    const look=LOOKS[variant];
    const last=cue.segment===33;
    const starRed=detail&&!last&&(cue.id===5||shot.starFocus);
    const damage=damageGrades?cityDamageLevel(variant,cue,starRed):0;
    const red=starRed||damage===2;
    const key=`${variant}:${Number(red)}:${damage}`;
    let district=districts.get(key);
    if(!district){
      district=makeCityLayout(variant,{detail,red,finishedWindows,damage,structuralDamage,smoke});
      district.sky=skyDome();
      district.scene.add(district.sky);
      district.eclipse=createBlackStar(district.scene);
      const [x,y,z]=look.star;
      district.eclipse.object.position.set(x,red?Math.max(y,22):y,red?z+13:z);
      if(red)district.eclipse.object.children[0].material.color.set('#14090f');
      districts.set(key,district);
    }

    district.update?.(t,music,cue);
    district.scene.userData.subject=updateDistrictCamera(camera,{
      t,shot,music,cue,variant,route:district.route,anchors:district.anchors,
    })??null;
    const {object,disc,corona,tint}=district.eclipse;
    const focus=red&&(shot.starFocus||shot.mode==='abstract');
    const radius=red?(focus?22.5:18.5)+look.radius*.18:look.radius*(cue.segment===32?1.13:1);
    if(red&&shot.mode!=='eye'&&shot.mode!=='hand'){
      starCamera.position.copy(camera.position);
      starCamera.lookAt(object.position.x,object.position.y-radius*.65,object.position.z);
      camera.quaternion.slerp(starCamera.quaternion,focus?.86:shot.mode==='portrait'?.67:.47);
    }
    camera.updateMatrixWorld();
    const u=district.sky.material.uniforms;
    u.horizon.value.set(red?'#d43036':damage===1?'#b26a3a':last?'#315d66':look.horizon);
    u.zenith.value.set(red?'#760e22':damage===1?'#4e261e':look.zenith);
    u.time.value=t;
    district.sky.position.copy(camera.position);
    object.visible=!last&&(!damageGrades||starRed);
    object.scale.setScalar(radius);
    disc.rotation.set(1.23+.11*Math.sin(t*.22),-.14,.3*Math.sin(t*.075));
    corona.quaternion.copy(camera.quaternion);
    corona.material.uniforms.tint.value.set(red?'#ff654b':look.rim);
    corona.material.uniforms.heat.value=music.onset??0;
    for(let i=0;i<tint.length;i++){
      tint[i].color.set(red?(i%3===0?'#ff9466':'#fc4138'):(i%3===0?look.rim:look.horizon));
    }
    return district.scene;
  };
}
