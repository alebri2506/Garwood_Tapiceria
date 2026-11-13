-- Reglas del inventario y del pedido en la base (convención de la tesis: estados y opciones como varchar con CHECK).
-- Parámetros: nuevo tipo "opcion" (unidades de telas y medidas del mueble en A14).
ALTER TABLE "parametro" DROP CONSTRAINT "parametro_tipo_check";
ALTER TABLE "parametro" ADD CONSTRAINT "parametro_tipo_check"
  CHECK ("tipo" IN ('entero', 'decimal', 'porcentaje', 'monto', 'horario', 'texto', 'opcion'));

ALTER TABLE "material" ADD CONSTRAINT "material_stock_check" CHECK ("stock_fisico" >= 0 AND "stock_minimo" >= 0);
ALTER TABLE "material" ADD CONSTRAINT "material_precio_check" CHECK ("precio" IS NULL OR "precio" >= 0);

ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_canal_check" CHECK ("canal" IN ('telefono', 'whatsapp'));
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_tipo_check" CHECK ("tipo" IN ('stock', 'telas'));
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_dias_check" CHECK ("dias_min" >= 0 AND "dias_max" >= "dias_min");

ALTER TABLE "pedido" ADD CONSTRAINT "pedido_estado_check" CHECK ("estado" IN (
  'Generado', 'Esperando mueble', 'Esperando material', 'Listo para producir', 'En producción', 'En pausa', 'Terminado',
  'En reparto', 'Listo para retiro', 'Entregado', 'Cerrado', 'Cancelado'));

ALTER TABLE "reserva_material" ADD CONSTRAINT "reserva_material_cantidad_check" CHECK ("cantidad" > 0 AND "retirado" >= 0);
ALTER TABLE "encargo_tela" ADD CONSTRAINT "encargo_tela_estado_check" CHECK ("estado" IN ('por_encargar', 'encargada', 'llego'));
ALTER TABLE "encargo_tela" ADD CONSTRAINT "encargo_tela_cantidad_check" CHECK ("cantidad" > 0 AND "precio" >= 0);
ALTER TABLE "compra" ADD CONSTRAINT "compra_estado_check" CHECK ("estado" IN ('por_llegar', 'llego'));
ALTER TABLE "compra_linea" ADD CONSTRAINT "compra_linea_cantidad_check" CHECK ("cantidad" > 0 AND "precio" >= 0);
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_tipo_check" CHECK ("tipo" IN ('entrada', 'salida', 'ajuste', 'conteo'));
ALTER TABLE "movimiento_inventario" ADD CONSTRAINT "movimiento_inventario_saldo_check" CHECK ("saldo" >= 0);
ALTER TABLE "conteo_linea" ADD CONSTRAINT "conteo_linea_cantidad_check" CHECK ("sistema" >= 0 AND "contado" >= 0);
