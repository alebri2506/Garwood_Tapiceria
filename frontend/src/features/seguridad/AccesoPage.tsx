import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import { LoginForm } from './components/LoginForm';
import { RegistroForm } from './components/RegistroForm';
import { RecuperarForm } from './components/RecuperarForm';
import { RestablecerForm } from './components/RestablecerForm';
import { CambiarContrasenaForm } from './components/CambiarContrasenaForm';
import { ConfirmarCorreo } from '../historial/perfil/ConfirmarCorreo';
import { CambiarMiContrasena } from '../historial/perfil/CambiarMiContrasena';
import './components/acceso.css';

type Modo = 'login' | 'registro' | 'restablecer' | 'cambiar' | 'confirmar-correo' | 'mi-contrasena';

const PESTANAS: { modo: Modo; texto: string; ruta: string }[] = [
  { modo: 'login', texto: 'Iniciar sesión', ruta: '/acceso' },
  { modo: 'registro', texto: 'Crear cuenta', ruta: '/registro' },
];

/** G1 Acceso — común a todos los roles. */
export function AccesoPage({ modo }: { modo: Modo }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [recuperando, setRecuperando] = useState(false);
  const irA = (m: Modo) => {
    setRecuperando(false);
    navigate(PESTANAS.find((p) => p.modo === m)!.ruta);
  };

  return (
    <div className="acceso">
      <section className="acceso-hero">
        <div className="acceso-brand">
          <b>GARWEB</b>
          <span>Tapicería de Interiores Garwood LLC</span>
        </div>
        <div className="acceso-claim">
          <h1>Una sola entrada para todos.</h1>
          <p>Clientes y personal del taller ingresan con el mismo formulario, con su correo o usuario y su contraseña.</p>
        </div>
        <div className="acceso-rule" />
      </section>

      <main className="acceso-panel">
        <div className="card acceso-card">
          {modo === 'mi-contrasena' ? (
            <CambiarMiContrasena />
          ) : modo === 'confirmar-correo' ? (
            <ConfirmarCorreo token={params.get('token')} />
          ) : modo === 'cambiar' ? (
            <CambiarContrasenaForm />
          ) : modo === 'restablecer' ? (
            <RestablecerForm token={params.get('token')} />
          ) : recuperando ? (
            <RecuperarForm onVolver={() => irA('login')} />
          ) : (
            <>
              <div className="ctx">
                <Icon name="quote" size={20} />
                <span><b>¿Es cliente nuevo?</b> Cree su cuenta gratis para pedir cotizaciones y seguir sus pedidos.</span>
              </div>
              <div className="seg" role="tablist">
                {PESTANAS.map((p) => (
                  <button
                    key={p.modo}
                    type="button"
                    role="tab"
                    aria-selected={modo === p.modo}
                    className={modo === p.modo ? 'on' : undefined}
                    onClick={() => irA(p.modo)}
                  >
                    {p.texto}
                  </button>
                ))}
              </div>
              {modo === 'login' ? (
                <LoginForm onOlvido={() => setRecuperando(true)} />
              ) : (
                <RegistroForm onIrLogin={() => irA('login')} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
