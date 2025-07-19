import React from 'react';

interface ScreenTunerProps {
  pos: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  onClose: () => void;
}

const Slider: React.FC<{label:string, value:number, onChange:(v:number)=>void}> = ({label,value,onChange}) => (
  <div style={{display:'flex',flexDirection:'column',marginBottom:8}}>
    <label style={{color:'#fff',fontSize:'0.8em'}}>{label}: {value.toFixed(2)}</label>
    <input type="range" min={-20} max={20} step={0.1} value={value}
      onChange={e=>onChange(parseFloat(e.target.value))}
      style={{width:180}}/>
  </div>
);

const ScreenTuner:React.FC<ScreenTunerProps> = ({pos,onChange,onClose})=>{
  const [x,y,z] = pos;
  const update = (idx:number,val:number)=>{
    const next:[number,number,number]=[x,y,z];
    next[idx]=val;
    onChange(next);
  };
  return (
    <div style={{position:'fixed',top:20,left:20,background:'rgba(0,0,0,0.9)',padding:16,border:'2px solid #555',borderRadius:8,zIndex:3000000600,color:'#fff',fontFamily:'sans-serif'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,alignItems:'center'}}>
        <strong>Screen Tuner</strong>
        <button onClick={onClose} style={{background:'transparent',color:'#fff',border:'none',cursor:'pointer'}}>✖</button>
      </div>
      <Slider label="X" value={x} onChange={v=>update(0,v)}/>
      <Slider label="Y" value={y} onChange={v=>update(1,v)}/>
      <Slider label="Z" value={z} onChange={v=>update(2,v)}/>
    </div>
  );
};

export default ScreenTuner; 