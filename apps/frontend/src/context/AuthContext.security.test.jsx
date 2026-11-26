import { createTestStorage } from '../test/storage';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
const mocks=vi.hoisted(()=>({logoutUser:vi.fn(),getPerfil:vi.fn(),loginUser:vi.fn(),toast:vi.fn()}));
// Sesión por cookies HttpOnly: el cliente solo guarda la pista no secreta 'ga_user' y la expiración.
vi.mock('../services/api',()=>({getPerfil:mocks.getPerfil,logoutUser:mocks.logoutUser,loginUser:mocks.loginUser,registerUser:vi.fn(),oauthGoogle:vi.fn(),oauthFacebook:vi.fn(),exchangeOAuthCode:vi.fn(),
  rememberSession:(user,exp)=>{localStorage.setItem('ga_user',JSON.stringify(user));if(exp)localStorage.setItem('ga_access_exp',exp);},
  hasSessionHint:()=>Boolean(localStorage.getItem('ga_user')),
  forgetSession:()=>{for(const k of ['ga_user','ga_access_exp','ga_token','ga_refresh_token'])localStorage.removeItem(k);}}));
vi.mock('./ToastContext',()=>({useToast:()=>({showToast:mocks.toast})}));
function Client(){const {user,logout,login}=useAuth();return <><span>{user?.nombre||'sin sesión'}</span><button onClick={()=>logout()}>salir</button><button onClick={()=>logout({allDevices:true})}>salir todos</button><button onClick={()=>login('a@b.co','frase larga de acceso')}>entrar</button></>;}
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.stubGlobal('localStorage',createTestStorage());localStorage.clear();vi.clearAllMocks();localStorage.setItem('ga_user',JSON.stringify({nombre:'Persona'}));mocks.getPerfil.mockResolvedValue({data:{data:{user:{nombre:'Persona'}}}});});
describe('logout real sin alterar diseño',()=>{
  it('espera revocación antes de limpiar la sesión y evita duplicar solicitudes',async()=>{
    let resolve;mocks.logoutUser.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');
    fireEvent.click(screen.getByText('salir'));fireEvent.click(screen.getByText('salir'));
    expect(mocks.logoutUser).toHaveBeenCalledTimes(1);expect(localStorage.getItem('ga_user')).not.toBeNull();
    resolve({});await screen.findByText('sin sesión');expect(localStorage.getItem('ga_user')).toBeNull();
    expect(mocks.logoutUser).toHaveBeenCalledWith({allDevices:false});
  });
  it('fallo de red conserva la sesión y permite reintento sin afirmar éxito',async()=>{
    mocks.logoutUser.mockRejectedValue(new Error('red no disponible'));
    render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');fireEvent.click(screen.getByText('salir'));
    await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(screen.getByText('Persona')).toBeInTheDocument();expect(localStorage.getItem('ga_user')).not.toBeNull();
    expect(mocks.toast.mock.calls.at(-1)[1]).toBe('error');
    mocks.logoutUser.mockResolvedValueOnce({});fireEvent.click(screen.getByText('salir'));
    await screen.findByText('sin sesión');expect(mocks.logoutUser).toHaveBeenCalledTimes(2);
  });
  it('salir de todos los dispositivos usa la operación global autorizada',async()=>{
    mocks.logoutUser.mockResolvedValue({});render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');
    fireEvent.click(screen.getByText('salir todos'));await screen.findByText('sin sesión');
    expect(mocks.logoutUser).toHaveBeenCalledWith({allDevices:true});
  });
  it('el inicio de sesión web nunca persiste tokens en almacenamiento accesible por JavaScript',async()=>{
    localStorage.clear();
    mocks.loginUser.mockResolvedValue({data:{data:{session:'cookie',accessTokenExpiresAt:'2030-01-01T00:00:00.000Z',user:{nombre:'Nueva'}}}});
    render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('sin sesión');
    fireEvent.click(screen.getByText('entrar'));await screen.findByText('Nueva');
    expect(localStorage.getItem('ga_token')).toBeNull();expect(localStorage.getItem('ga_refresh_token')).toBeNull();
    expect(Object.keys(localStorage.dump?.() ?? {}).join()).not.toMatch(/token/);
  });
});
