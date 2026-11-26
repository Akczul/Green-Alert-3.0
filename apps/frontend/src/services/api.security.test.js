import { createTestStorage } from '../test/storage';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// jsdom no acepta cookies __Host- en http; se simula el valor que el navegador expondría.
beforeEach(()=>{vi.resetModules();vi.stubGlobal('localStorage',createTestStorage());localStorage.clear();Object.defineProperty(document,'cookie',{configurable:true,get:()=>'otra=1; __Host-ga_csrf=csrf-prueba',set:()=>{}});});
afterEach(()=>{vi.unstubAllGlobals();delete document.cookie;});
it('logout POST viaja con cookies, cabecera web y CSRF; nunca envía tokens desde JavaScript',async()=>{
  const {default:axios}=await import('axios');const original=axios.defaults.adapter;
  const calls=[];axios.defaults.adapter=async(config)=>{calls.push(config);return {data:{},status:200,statusText:'OK',headers:{},config};};
  try {
    const {logoutUser}=await import('./api');
    await logoutUser();await logoutUser({allDevices:true});
    expect(calls[0].url).toBe('/api/auth/logout');expect(JSON.parse(calls[0].data)).toEqual({allDevices:false});
    expect(calls[0].withCredentials).toBe(true);expect(calls[0].headers['X-GreenAlert-Client']).toBe('web');
    expect(calls[0].headers['X-CSRF-Token']).toBe('csrf-prueba');
    expect(calls[1].headers.Authorization).toBeUndefined();expect(JSON.parse(calls[1].data).allDevices).toBe(true);
  } finally {axios.defaults.adapter=original;}
});
it('las escrituras llevan el token CSRF vigente y las lecturas no lo necesitan',async()=>{
  const {default:axios}=await import('axios');const original=axios.defaults.adapter;
  const calls=[];axios.defaults.adapter=async(config)=>{calls.push(config);return {data:{},status:200,statusText:'OK',headers:{},config};};
  try {
    const {getPerfil,updatePerfil}=await import('./api');
    await getPerfil();await updatePerfil({nombre:'X'});
    expect(calls[0].headers['X-CSRF-Token']).toBeUndefined();
    expect(calls[1].headers['X-CSRF-Token']).toBe('csrf-prueba');
    expect(calls.every(c=>!c.headers.Authorization)).toBe(true);
  } finally {axios.defaults.adapter=original;}
});
it('un refresh en vuelo no restaura la sesión después del logout',async()=>{
  const {default:axios}=await import('axios');const original=axios.defaults.adapter;
  let resolveRefresh,started;const began=new Promise(resolve=>{started=resolve;});
  axios.defaults.adapter=(config)=>config.url.includes('/auth/refresh')?new Promise(resolve=>{resolveRefresh=()=>resolve({data:{data:{session:'cookie',accessTokenExpiresAt:new Date(Date.now()+900000).toISOString()}},status:200,headers:{},config});started();}):Promise.resolve({data:{},status:200,headers:{},config});
  try {
    const {getPerfil,logoutUser}=await import('./api');
    localStorage.setItem('ga_user','{"nombre":"Persona"}');localStorage.setItem('ga_access_exp',new Date(Date.now()+1000).toISOString());
    const pending=getPerfil();await began;await logoutUser();localStorage.clear();resolveRefresh();await pending;
    expect(localStorage.getItem('ga_user')).toBeNull();expect(localStorage.getItem('ga_access_exp')).toBeNull();
  } finally {axios.defaults.adapter=original;}
});
