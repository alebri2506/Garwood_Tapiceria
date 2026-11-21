// Pasarela de pago (decisiones J): Stripe Checkout. El cliente paga en la página segura de Stripe; GARWEB nunca ve ni
// guarda datos de tarjetas. Detrás de esta interfaz para poder cambiar de proveedor y para las pruebas (sin internet).
import Stripe from 'stripe';
import { env } from '../../config/env.js';

/** `url`: la página de Stripe (modo página). `clientSecret`: para mostrar el pago dentro de GARWEB (modo incrustado). */
export interface SesionPago { id: string; url: string | null; clientSecret: string | null }

/** Lo que dice la pasarela de una sesión de pago: si se cobró, cuánto y a qué cotización pertenece. */
export interface ResultadoPago {
  sesion: string;
  pagado: boolean;
  /** Id del cobro en la pasarela (único): evita registrar dos veces el mismo pago. */
  referencia: string | null;
  monto: number;
  metadata: Record<string, string>;
}

export interface Pasarela {
  /** `incrustado`: el formulario de Stripe se muestra dentro de W4 (al terminar vuelve a `exito`); si no, se abre su página. */
  crearSesion(e: { monto: number; descripcion: string; detalle?: string; email?: string | null; metadata: Record<string, string>; exito: string; cancelado: string; incrustado?: boolean }): Promise<SesionPago>;
  consultarSesion(id: string): Promise<ResultadoPago>;
  /** Aviso (webhook) firmado por la pasarela. null si no es un cobro terminado; lanza error si la firma no es válida. */
  leerAviso(cuerpo: Buffer, firma: string | undefined): Promise<ResultadoPago | null>;
}

const resultado = (s: Stripe.Checkout.Session): ResultadoPago => ({
  sesion: s.id,
  pagado: s.payment_status === 'paid',
  referencia: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
  monto: (s.amount_total ?? 0) / 100,
  metadata: (s.metadata ?? {}) as Record<string, string>,
});

export function pasarelaStripe(clave: string, secretoAviso: string | undefined): Pasarela {
  const stripe = new Stripe(clave);
  return {
    async crearSesion(e) {
      // {CHECKOUT_SESSION_ID} lo reemplaza Stripe: al volver, GARWEB consulta esa sesión.
      const volver = `${e.exito}&sesion={CHECKOUT_SESSION_ID}`;
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(e.monto * 100), product_data: { name: e.descripcion, ...(e.detalle ? { description: e.detalle } : {}) } } }],
        customer_email: e.email ?? undefined,
        metadata: e.metadata,
        payment_intent_data: { metadata: e.metadata },
        submit_type: 'pay',
        // Incrustado: el formulario va dentro de W4 y al terminar vuelve a GARWEB. Página: success y cancel por separado.
        ...(e.incrustado ? { ui_mode: 'embedded' as const, return_url: volver } : { success_url: volver, cancel_url: e.cancelado }),
        locale: 'es',
        // RG-10: el negocio cobra en USD. Sin esto Stripe ofrece pagar en la moneda del país del navegador (p. ej. soles).
        adaptive_pricing: { enabled: false },
      });
      return { id: s.id, url: s.url ?? null, clientSecret: s.client_secret ?? null };
    },
    async consultarSesion(id) {
      return resultado(await stripe.checkout.sessions.retrieve(id));
    },
    async leerAviso(cuerpo, firma) {
      if (!secretoAviso) throw new Error('Falta STRIPE_WEBHOOK_SECRET: no se pueden verificar los avisos de Stripe.');
      const evento = stripe.webhooks.constructEvent(cuerpo, firma ?? '', secretoAviso);
      if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
        return resultado(evento.data.object as Stripe.Checkout.Session);
      }
      return null;
    },
  };
}

/** Sin STRIPE_SECRET_KEY no hay pago en línea (la pantalla lo muestra deshabilitado). */
export const crearPasarela = (): Pasarela | null => (env.STRIPE_SECRET_KEY ? pasarelaStripe(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : null);
