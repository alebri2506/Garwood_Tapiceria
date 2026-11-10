import { useSearchParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Tabs } from '../../../shared/ui/Tabs';
import { RegistroActividad } from '../auditoria/RegistroActividad';

// La pestaña se guarda en la URL (?tab=actividad) para poder enlazarla, p. ej. desde A14 › Relacionado.
const PESTANAS = [
  { clave: 'usuarios', label: 'Usuarios' },
  { clave: 'roles', label: 'Roles y permisos' },
  { clave: 'actividad', label: 'Registro de actividad' },
];

/** A20 Usuarios, roles y auditoría (CU-S03, S04, S06 · decisiones D.1 y D.2). */
export function UsuariosPage() {
  const [params, setParams] = useSearchParams();
  const activa = Math.max(0, PESTANAS.findIndex((p) => p.clave === params.get('tab')));
  const elegir = (i: number) => setParams(i === 0 ? {} : { tab: PESTANAS[i]!.clave }, { replace: true });

  return (
    <>
      <TopAdmin crumb="Seguridad y Administración · módulo transversal" titulo="Usuarios, roles y auditoría">
        <Tabs label="Secciones" items={PESTANAS} active={activa} onChange={elegir} />
      </TopAdmin>
      {PESTANAS[activa]!.clave === 'actividad' ? (
        <RegistroActividad />
      ) : (
        // CU-S03 y S04: se implementan en el paso 7 de Seguridad y parámetros.
        <EmptyState icon="info" title={PESTANAS[activa]!.label}>Esta sección aún no está implementada.</EmptyState>
      )}
    </>
  );
}
