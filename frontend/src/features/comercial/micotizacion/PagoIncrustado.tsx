import { useMemo } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { Icon } from '../../../shared/ui/Icon';
import type { MiCotizacion } from './miCotizacionApi';

// W4 · pago del adelanto DENTRO de GARWEB (Stripe Checkout incrustado · decisiones J.5). Los campos de la tarjeta los
// dibuja Stripe en su recuadro seguro: GARWEB nunca ve ni guarda la tarjeta. Alrededor va nuestro diseño: qué paga, por
// qué y qué pasa después. Al terminar, Stripe vuelve a W4 (?pago=ok&sesion=…) y ahí se confirma el cobro como antes.

/** La clave PÚBLICA de Stripe (pk_…): sin ella W4 abre la página de Stripe, como antes. */
export const CLAVE_PUBLICA: string = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
let stripe: Promise<Stripe | null> | null = null;
const cargarStripe = () => (stripe ??= loadStripe(CLAVE_PUBLICA, { locale: 'es' }));

const dolares = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function PagoIncrustado({ c, clientSecret, onVolver }: { c: MiCotizacion; clientSecret: string; onVolver(): void }) {
  const opciones = useMemo(() => ({ clientSecret }), [clientSecret]);
  const varios = c.muebles.length > 1;
  const uno = c.muebles[0]!;
  const titulo = varios ? `${c.muebles.length} muebles` : `${uno.cantidad > 1 ? `${uno.cantidad} × ` : ''}${uno.tipo}`;
  const telas = c.muebles.flatMap((m) => m.telas);
  const saldo = Math.max(0, c.total - c.adelanto);

  return (
    <section className="card w4-pay" aria-labelledby="w4-pay-t">
      <div className="w4-pay-hd">
        <div>
          <span className="ov">Pago seguro del adelanto</span>
          <h2 id="w4-pay-t">Pague {dolares(c.adelanto)} y generamos su pedido</h2>
        </div>
        <button type="button" className="gw-btn gw-btn-ghost gw-btn-sm" onClick={onVolver}>← Volver a la cotización</button>
      </div>

      <div className="w4-pay-g">
        {/* Nuestro resumen: qué está pagando y qué pasa después. */}
        <div className="stack w4-pay-res">
          <div className="w4-pay-mu">
            <span className="w4-pay-th">{uno.foto && !varios ? <img src={uno.foto} alt="" /> : <Icon name="sofa" size={26} />}</span>
            <div style={{ minWidth: 0 }}>
              <b>{titulo}</b>
              <small>Cotización {c.codigo}{varios ? '' : ` · ${uno.servicio.toLowerCase()}`}</small>
            </div>
          </div>
          {telas.length > 0 && (
            <div className="w4-pay-tel">
              {telas.slice(0, 6).map((t) => (
                <span key={`${t.nombre}-${t.numeroColor}`}><i style={{ background: t.colorHex ?? 'var(--surface-sunken)' }} aria-hidden="true" />{t.nombre}{t.numeroColor ? ` · color ${t.numeroColor}` : ''}</span>
              ))}
              {telas.length > 6 && <span className="muted">y {telas.length - 6} más</span>}
            </div>
          )}

          <dl className="w4-pay-cta">
            <div><dt>Total de la cotización</dt><dd>{dolares(c.total)}</dd></div>
            <div className="w4-pay-hoy"><dt>Paga hoy · adelanto {c.adelantoPct} %</dt><dd>{dolares(c.adelanto)}</dd></div>
            <div><dt>Saldo al recibir {varios ? 'sus muebles' : `su ${uno.tipo.toLowerCase()}`}</dt><dd>{dolares(saldo)}</dd></div>
          </dl>

          <ol className="w4-pay-pasos" aria-label="Qué pasa después del pago">
            <li><b>Pago aprobado</b><span>Le llega el recibo por correo.</span></li>
            <li><b>Su pedido se genera</b><span>Lo sigue desde Mis pedidos.</span></li>
            <li><b>{c.traslado === 'delivery' ? 'Elige el día del recojo' : 'Trae su mueble al taller'}</b><span>{c.traslado === 'delivery' ? 'Con las horas libres del camión.' : 'De lunes a sábado.'}</span></li>
          </ol>

          <p className="w4-pay-seg"><Icon name="lock" size={15} /> Los datos de su tarjeta los procesa Stripe, la pasarela de pago. GARWEB nunca los ve ni los guarda.</p>
        </div>

        {/* El formulario de Stripe (tarjeta), dentro de nuestra página. */}
        <div className="w4-pay-form">
          <EmbeddedCheckoutProvider stripe={cargarStripe()} options={opciones}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </section>
  );
}
