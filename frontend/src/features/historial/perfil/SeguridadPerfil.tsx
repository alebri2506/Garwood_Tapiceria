import { Link } from 'react-router-dom';
import { DIAS, MESES } from '../../comercial/fechas';

const dos = (n: number) => String(n).padStart(2, '0');
/** E.4.2: "hoy 09:12", "ayer 17:42" o "lun 9 nov, 15:30" (hora de este equipo). */
export function cuandoIngreso(iso: string, ahora = new Date()) {
  const d = new Date(iso);
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === ahora.toDateString()) return `hoy ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  const anio = d.getFullYear() === ahora.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${DIAS[d.getDay()]!.slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]!.slice(0, 3)}${anio}, ${hora}`;
}

/** W10 › Seguridad (decisiones E.4): cambiar contraseña (pantalla aparte, estilo G1) y último ingreso. */
export function SeguridadPerfil({ ultimoIngreso }: { ultimoIngreso: string | null }) {
  return (
    <section className="card stack" aria-labelledby="pf-seg">
      <h2 id="pf-seg" style={{ fontSize: 18 }}>Seguridad</h2>
      <Link to="/cliente/perfil/contrasena" className="gw-btn gw-btn-secondary gw-btn-block">Cambiar contraseña</Link>
      <p className="audit">{ultimoIngreso ? `Último ingreso: ${cuandoIngreso(ultimoIngreso)}` : 'Este es su primer ingreso.'}</p>
    </section>
  );
}
