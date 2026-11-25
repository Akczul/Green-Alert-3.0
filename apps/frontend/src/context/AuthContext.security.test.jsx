import { createTestStorage } from '../test/storage';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
const mocks=vi.hoisted(()=>({logoutUser:vi.fn(),getPerfil:vi.fn(),toast:vi.fn()}));
vi.mock('../services/api',()=>({getPerfil:mocks.getPerfil,logoutUser:mocks.logoutUser,loginUser:vi.fn(),registerUser:vi.fn(),oauthGoogle:vi.fn(),oauthFacebook:vi.fn()}));
vi.mock('./ToastContext',()=>({useToast:()=>({showToast:mocks.toast})}));
function Client(){const {user,logout}=useAuth();return <><span>{user?.nombre||'sin sesión'}</span><button onClick={()=>logout()}>salir</button><button onClick={()=>logout({allDevices:true})}>salir todos</button></>;}
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.stubGlobal('localStorage',createTestStorage());localStorage.clear();vi.clearAllMocks();localStorage.setItem('ga_token','access');localStorage.setItem('ga_refresh_token','refresh');mocks.getPerfil.mockResolvedValue({data:{data:{user:{nombre:'Persona'}}}});});
describe('logout real sin alterar diseño',()=>{
  it('espera revocación antes de limpiar la sesión y evita duplicar solicitudes',async()=>{
    let resolve;mocks.logoutUser.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');
    fireEvent.click(screen.getByText('salir'));fireEvent.click(screen.getByText('salir'));
    expect(mocks.logoutUser).toHaveBeenCalledTimes(1);expect(localStorage.getItem('ga_token')).toBe('access');
    resolve({});await screen.findByText('sin sesión');expect(localStorage.getItem('ga_refresh_token')).toBeNull();
    expect(mocks.logoutUser).toHaveBeenCalledWith('refresh',{allDevices:false});
  });
  it('fallo de red conserva credenciales y permite reintento sin afirmar éxito',async()=>{
    mocks.logoutUser.mockRejectedValue(new Error('red no disponible'));
    render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');fireEvent.click(screen.getByText('salir'));
    await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(screen.getByText('Persona')).toBeInTheDocument();expect(localStorage.getItem('ga_refresh_token')).toBe('refresh');
    expect(mocks.toast.mock.calls.at(-1)[1]).toBe('error');
    mocks.logoutUser.mockResolvedValueOnce({});fireEvent.click(screen.getByText('salir'));
    await screen.findByText('sin sesión');expect(mocks.logoutUser).toHaveBeenCalledTimes(2);
  });
  it('salir de todos los dispositivos usa la operación global autorizada',async()=>{
    mocks.logoutUser.mockResolvedValue({});render(<AuthProvider><Client/></AuthProvider>);await screen.findByText('Persona');
    fireEvent.click(screen.getByText('salir todos'));await screen.findByText('sin sesión');
    expect(mocks.logoutUser).toHaveBeenCalledWith('refresh',{allDevices:true});
  });
});
