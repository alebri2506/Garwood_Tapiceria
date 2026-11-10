import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopAdmin } from '../../../app/layout/AdminLayout';
import { ApiError } from '../../../shared/api/http';
import { Alert } from '../../../shared/ui/Alert';
import { Tabs } from '../../../shared/ui/Tabs';
import { RegistroActividad } from '../auditoria/RegistroActividad';
import { RolesTab } from './RolesTab';
import { UsuariosTab } from './UsuariosTab';
import { usuariosApi, type ListaUsuarios } from './usuariosApi';
import './usuarios.css';

// La pestaña se guarda en la URL (?tab=actividad) para poder enlazarla, p. ej. desde A14 › Relacionado.
const PESTANAS = ['usuarios', 'roles', 'actividad'] as const;

/** A20 Usuarios, roles y auditoría (CU-S03, S04, S06 · decisiones D.1 y D.2). */
export function UsuariosPage() {
  const [params, setParams] = useSearchParams();
  const activa = Math.max(0, PESTANAS.indexOf(params.get('tab') as (typeof PESTANAS)[number]));
  const elegir = (i: number) => setParams(i === 0 ? {} : { tab: PESTANAS[i]! }, { replace: true });

  const [datos, setDatos] = useState<ListaUsuarios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => {
    usuariosApi.listar()
      .then((d) => { setDatos(d); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No pudimos cargar los usuarios.'));
  }, []);
  useEffect(cargar, [cargar]);

  const items = [{ label: 'Usuarios', count: datos?.usuarios.filter((u) => u.activo).length }, { label: 'Roles y permisos' }, { label: 'Registro de actividad' }];

  return (
    <>
      <TopAdmin crumb="Seguridad y Administración · módulo transversal" titulo="Usuarios, roles y auditoría">
        <Tabs label="Secciones" items={items} active={activa} onChange={elegir} />
      </TopAdmin>
      {activa === 0 && (
        <>
          {error && (
            <Alert tone="danger" title="No pudimos cargar los usuarios">
              {error} <button type="button" className="gw-btn gw-btn-secondary gw-btn-sm" onClick={cargar}>Reintentar</button>
            </Alert>
          )}
          {!datos && !error && <p className="muted" role="status">Cargando usuarios…</p>}
          {datos && <UsuariosTab datos={datos} recargar={cargar} />}
        </>
      )}
      {activa === 1 && <RolesTab />}
      {activa === 2 && <RegistroActividad />}
    </>
  );
}
