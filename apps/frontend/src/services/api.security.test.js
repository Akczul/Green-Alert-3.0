import { createTestStorage } from '../test/storage';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(()=>{vi.resetModules();vi.stubGlobal('localStorage',createTestStorage());localStorage.clear();});
afterEach(()=>{vi.unstubAllGlobals();});
it('logout POST usa el refresh capturado y JWT solo para logout global',async()=>{
  const {default:axios}=await import('axios');const original=axios.defaults.adapter;
  const calls=[];axios.defaults.adapter=async(config)=>{calls.push(config);return {data:{},status:200,statusText:'OK',headers:{},config};};
  try {
    const {logoutUser}=await import('./api');
    localStorage.setItem('ga_token','access');await logoutUser('refresh');await logoutUser('refresh',{allDevices:true});
    expect(calls[0].url).toBe('/api/auth/logout');expect(JSON.parse(calls[0].data)).toEqual({refreshToken:'refresh',allDevices:false});
    expect(calls[1].headers.Authorization).toBe('Bearer access');expect(JSON.parse(calls[1].data).allDevices).toBe(true);
  } finally {axios.defaults.adapter=original;}
});
it('un refresh en vuelo no restaura credenciales después del logout',async()=>{
  const {default:axios}=await import('axios');const original=axios.defaults.adapter;
  let resolveRefresh,started;const began=new Promise(resolve=>{started=resolve;});
  axios.defaults.adapter=(config)=>config.url.includes('/auth/refresh')?new Promise(resolve=>{resolveRefresh=()=>resolve({data:{data:{token:'nuevo',refreshToken:'nuevo-refresh'}},status:200,headers:{},config});started();}):Promise.resolve({data:{},status:200,headers:{},config});
  try {
    const {getPerfil,logoutUser}=await import('./api');
    localStorage.setItem('ga_token',`x.${window.btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+1}))}.x`);localStorage.setItem('ga_refresh_token','old-refresh');
    const pending=getPerfil();await began;await logoutUser('old-refresh');localStorage.clear();resolveRefresh();await pending;
    expect(localStorage.getItem('ga_token')).toBeNull();expect(localStorage.getItem('ga_refresh_token')).toBeNull();
  } finally {axios.defaults.adapter=original;}
});
