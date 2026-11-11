import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth/AuthProvider';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Toast } from '../../../shared/ui/Toast';
import { MESES } from '../../comercial/fechas';
import { DatosPerfil, borradorDe, cambiosDe, revisarDatos, type BorradorDatos } from './DatosPerfil';
import { DireccionesPerfil } from './DireccionesPerfil';
import { AvisosPerfil } from './AvisosPerfil';
import { SeguridadPerfil } from './SeguridadPerfil';
import { erroresDe, perfilApi, type Perfil } from './perfilApi';
import './perfil.css';

/** "Cliente desde oct 2026" */
const desde = (iso: string) => { const d = new Date(iso); return `Cliente desde ${MESES[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}`; };
/** El nombre que se ve arriba: el de la empresa o nombres y apellidos. */
const nombreVisible = (p: Perfil['datos']) => (p.tipoPersona === 'empresa' && p.razonSocial ? p.razonSocial : `${p.nombres} ${p.apellidos}`);

/** W10 Mi perfil (CU-H02 · decisiones-recientes.md, sección E): Datos y Direcciones; a la derecha, Avisos y Seguridad. */
export function PerfilPage() {
  const { sesion, iniciar, salir } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorDatos | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Al volver de «Cambiar contraseña» llega su aviso.
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>((location.state as { aviso?: { titulo: string; texto: string } } | null)?.aviso ?? null);
  // Se borra de la navegación para que no vuelva a aparecer al recargar la página.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const cargar = useCallback(() => {
    setErrorCarga(null);
    perfilApi.ver()
      .then((p) => { setPerfil(p); setBorrador(borradorDe(p.datos)); })
      .catch((e) => setErrorCarga(e instanceof ApiError ? e.message : 'No pudimos cargar su perfil.'));
  }, []);
  useEffect(cargar, [cargar]);

  const cambios = perfil && borrador ? cambiosDe(perfil.datos, borrador) : {};
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = async () => {
    if (!perfil || !borrador || !hayCambios || guardando) return;
    const faltan = revisarDatos(perfil.datos, borrador);
    setErrores(faltan);
    if (Object.keys(faltan).length) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const { datos } = await perfilApi.guardarDatos(cambios);
      setPerfil({ ...perfil, datos });
      setBorrador(borradorDe(datos));
      setAviso({ titulo: 'Datos guardados', texto: 'El taller ve la versión actualizada.' });
      // El nombre de arriba (iniciales del menú) se actualiza sin volver a entrar.
      if (sesion) iniciar({ ...sesion, usuario: { ...sesion.usuario, nombre: nombreVisible(datos) } });
    } catch (e) {
      setErrores(erroresDe(e));
      setErrorGuardar(e instanceof ApiError ? e.message : 'No pudimos guardar sus datos. Intente de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = async () => {
    await salir();
    navigate('/acceso', { replace: true });
  };

  return (
    <>
      <div className="whead">
        <div>
          <div className="crumb">{perfil ? desde(perfil.clienteDesde) : ' '}</div>
          <h1>Mi perfil</h1>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="gw-btn gw-btn-ghost" onClick={cerrarSesion}>Cerrar sesión</button>
          <button type="button" className="gw-btn gw-btn-primary" onClick={guardar} disabled={!hayCambios || guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {aviso && <Toast title={aviso.titulo} onClose={() => setAviso(null)}>{aviso.texto}</Toast>}
      {errorGuardar && <Alert tone="danger" title="No se guardaron sus datos">{errorGuardar}</Alert>}
      {errorCarga && (
        <Alert tone="danger" title="No pudimos cargar su perfil">
          {errorCarga} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button>
        </Alert>
      )}
      {!perfil && !errorCarga && <p className="muted" role="status">Cargando su perfil…</p>}

      {perfil && borrador && (
        <div className="wcols">
          <div className="wl">
            <DatosPerfil
              perfil={perfil} borrador={borrador} errores={errores}
              onChange={(b, campo) => { setBorrador(b); setErrores(({ [campo]: _, ...r }) => r); setAviso(null); }}
              onCorreoPendiente={(correoPendiente) => {
                setPerfil({ ...perfil, correoPendiente });
                setAviso({ titulo: 'Revise su correo nuevo', texto: `Le enviamos un enlace a ${correoPendiente?.email}. El cambio se aplica cuando lo abra.` });
              }}
            />
            <DireccionesPerfil
              direcciones={perfil.direcciones}
              onCambio={(direcciones, texto) => { setPerfil({ ...perfil, direcciones }); if (texto) setAviso({ titulo: 'Direcciones actualizadas', texto }); }}
            />
          </div>
          <aside className="wr">
            <AvisosPerfil avisos={perfil.avisos} onCambio={(avisos) => setPerfil((p) => p && { ...p, avisos })} />
            <SeguridadPerfil ultimoIngreso={perfil.ultimoIngreso} />
          </aside>
        </div>
      )}
    </>
  );
}
