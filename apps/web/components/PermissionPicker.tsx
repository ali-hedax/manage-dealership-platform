'use client';
import {PERMISSION_GROUPS,PERMISSION_LABELS,type Permission} from '@manage/shared';
export function PermissionPicker({value,onChange,disabled=false}:{value:Permission[];onChange:(v:Permission[])=>void;disabled?:boolean}){
 return <div className="permission-grid">{PERMISSION_GROUPS.map(g=><fieldset key={g.title} disabled={disabled}><legend>{g.title}</legend>{g.permissions.map(p=><label key={p} className="permission-option"><input name="permission" type="checkbox" value={p} checked={value.includes(p)} onChange={e=>onChange(e.target.checked?[...value,p]:value.filter(v=>v!==p))}/><span>{PERMISSION_LABELS[p]}</span></label>)}</fieldset>)}</div>;
}
